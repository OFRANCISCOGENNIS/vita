"""ESTÚDIO IA — worker de geração de vídeo REAL com FFmpeg.

Pipeline (sem Kling, sem chave):

    1. Marca a Generation/Job como "running" e publica progresso inicial.
    2. Chama ``generative.run_generation`` que monta o comando FFmpeg da função,
       renderiza um .mp4 real, extrai um thumbnail (frame do vídeo) e persiste
       ambos no storage (MinIO/local).
    3. O progresso REAL vem da saída ``-progress`` do ffmpeg (via progress_cb) e
       é publicado no barramento (app.services.progress) → WebSocket existente
       ``/api/v1/ws/progress/{job_id}``.
    4. Marca a Generation como "done" com result_url/thumbnail_url reais.

Sem ffmpeg no ambiente, ``run_generation`` cai num placeholder (model="mock").
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import Generation, Job
from app.services import generative
from app.services.progress import publish_progress
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks_generative.generate_task", bind=True)
def generate_task(self, job_id: str, generation_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        gen = db.get(Generation, generation_id)
        if gen is None:
            return

        gen.status = "running"
        gen.progress = 0
        if job is not None:
            job.status = "running"
        db.commit()
        publish_progress(job_id, 0, "running", message="Iniciando geração no Estúdio IA...")
        publish_progress(job_id, 10, "running", message="Preparando entradas e montando o comando FFmpeg...")

        # Estado mutável para o callback de progresso (evita spam no banco).
        last = {"pct": 10}

        def progress_cb(pct: int, message: str) -> None:
            pct = max(10, min(95, int(pct)))
            if pct <= last["pct"]:
                return
            last["pct"] = pct
            publish_progress(job_id, pct, "running", message=message)

        result = generative.run_generation(
            gen.function,
            gen.prompt,
            gen.params,
            input_asset_url=gen.input_asset_url,
            input_asset_url_2=gen.input_asset_url_2,
            progress_cb=progress_cb,
        )

        gen.result_url = result["result_url"]
        gen.thumbnail_url = result["thumbnail_url"]
        gen.duration_seconds = result["duration_seconds"]
        gen.resolution = result["resolution"]
        gen.fps = result["fps"]
        gen.model = result["model"]
        gen.status = "done"
        gen.progress = 100
        gen.finished_at = datetime.now(timezone.utc)

        if job is not None:
            job.status = "done"
            job.progress = 100
            job.eta_seconds = 0
            job.finished_at = datetime.now(timezone.utc)
            job.payload = {
                **(job.payload or {}),
                "resultUrl": result["result_url"],
                "thumbnailUrl": result["thumbnail_url"],
                "storageKey": result["storage_key"],
                "ffmpegCommand": result.get("ffmpeg_command"),
                "model": result["model"],
            }
        db.commit()
        publish_progress(
            job_id,
            100,
            "done",
            message="Geração concluída!",
            extra={"resultUrl": gen.result_url, "thumbnailUrl": gen.thumbnail_url, "generationId": gen.id},
        )
    except Exception as exc:  # pragma: no cover
        db.rollback()
        gen = db.get(Generation, generation_id)
        if gen is not None:
            gen.status = "error"
            gen.error_message = "Falha na geração de vídeo. Tente novamente."
            gen.finished_at = datetime.now(timezone.utc)
        job = db.get(Job, job_id)
        if job is not None:
            job.status = "error"
            job.error_message = "Falha na geração de vídeo."
            job.finished_at = datetime.now(timezone.utc)
        db.commit()
        publish_progress(job_id, 100, "error", message=str(exc))
    finally:
        db.close()
