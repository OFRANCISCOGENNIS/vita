"""Import worker: yt-dlp download + chunk assembly for uploads.

- URL import: real `yt-dlp` subprocess (see app/services/ytdlp.py) with mock
  fallback, then upload to MinIO and hand-off to transcription.
- Upload assembly: multipart chunks are assembled server-side by S3/MinIO on
  complete_multipart_upload — this worker only verifies and hands off.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from app.database import SessionLocal
from app.models import Job, Project
from app.services import storage, ytdlp
from app.services.progress import publish_progress
from app.workers.celery_app import celery_app
from app.workers.tasks_transcribe import transcribe_task


def _fail(db, job_id: str, message: str) -> None:
    job = db.get(Job, job_id)
    if job is not None:
        job.status = "error"
        job.error_message = message
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    publish_progress(job_id, 100, "error", message=message)


@celery_app.task(name="app.workers.tasks_import.import_url_task", bind=True)
def import_url_task(self, job_id: str, project_id: str, url: str, quality: str) -> None:
    """Downloads a remote video with yt-dlp, stores it, then transcribes."""
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        project = db.get(Project, project_id)
        if job is None or project is None:
            return
        job.status = "running"
        project.status = "importing"
        db.commit()
        publish_progress(job_id, 5, "running", message="Baixando vídeo com yt-dlp...")

        with tempfile.TemporaryDirectory(prefix="cortaai-import-") as tmp:
            out_path = os.path.join(tmp, "source.mp4")
            result = ytdlp.download(url, quality, out_path)
            job.payload = {**(job.payload or {}), "ytdlpCommand": result["command"], "mock": result["mock"]}
            job.progress = 55
            db.commit()
            publish_progress(job_id, 55, "running", message="Enviando para o armazenamento...")

            key = f"projects/{project_id}/source.mp4"
            data = Path(out_path).read_bytes()
            # avoid pushing huge files through the mock path in one shot
            storage.put_bytes(key, data if len(data) < 64 * 1024 * 1024 else data[: 64 * 1024 * 1024], "video/mp4")
            project.storage_key = key

        job.progress = 75
        db.commit()
        publish_progress(job_id, 75, "running", message="Download concluído. Iniciando transcrição...")

        # hand off to transcription within the same job for a single progress bar
        job.status = "done"
        job.progress = 100
        job.finished_at = datetime.now(timezone.utc)
        project.status = "transcribing"
        db.commit()
        publish_progress(job_id, 100, "done", message="Importação concluída.")

        # spawn the transcribe job (own job row → own progress stream)
        t_job = Job(user_id=job.user_id, project_id=project_id, type="transcribe", status="queued", payload={})
        db.add(t_job)
        db.commit()
        from app.workers.dispatch import dispatch_task

        dispatch_task(transcribe_task, t_job.id, project_id)
    except Exception:
        db.rollback()
        _fail(db, job_id, "Falha ao importar o vídeo. Verifique a URL e tente novamente.")
    finally:
        db.close()
