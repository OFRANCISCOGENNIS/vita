"""ESTÚDIO IA — worker de geração de vídeo por IA.

# INTEGRAÇÃO PAGA: Kling AI API (ou Runway/Luma/Pika)

Pipeline real (documentado — o mock simula os mesmos passos):

    1. Montar o payload por função      -> app.services.generative.build_kling_request
    2. Submeter à Kling                  -> POST /v1/videos/{fn}  => task_id
    3. Polling do task_id                -> GET  /v1/videos/{fn}/{task_id}
       enquanto task_status in (submitted|processing): sleep + republica progresso
    4. Ao "succeed": baixar o mp4 temporário (task_result.videos[0].url)
    5. Reupar mp4 no S3/MinIO + gerar thumbnail (ffmpeg -frames:v 1)
    6. Marcar a Generation como done com result_url/thumbnail_url

Sem KLING_API_KEY, ``generative.run_generation`` devolve um resultado
determinístico (mp4 placeholder + thumbnail SVG). O progresso 0→100 é publicado
no mesmo barramento do render (app.services.progress) e transmitido pelo
WebSocket existente ``/api/v1/ws/progress/{job_id}``.
"""
from __future__ import annotations

import time
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

        duration = float((gen.params or {}).get("duration") or (gen.params or {}).get("seconds") or 5)
        # Passos simulados — na produção cada iteração é um poll do task_status.
        for pct, msg in generative.PROGRESS_STEPS:
            gen.progress = pct
            if job is not None:
                job.progress = pct
                job.eta_seconds = int(duration * (100 - pct) / 100)
            db.commit()
            publish_progress(job_id, pct, "running", eta_seconds=int(duration * (100 - pct) / 100), message=msg)
            time.sleep(0.25)

        result = generative.run_generation(
            gen.function, gen.prompt, gen.params, input_asset_url=gen.input_asset_url
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
                "klingRequest": result["kling_request"],
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
            gen.error_message = "Falha na geração de vídeo por IA. Tente novamente."
            gen.finished_at = datetime.now(timezone.utc)
        job = db.get(Job, job_id)
        if job is not None:
            job.status = "error"
            job.error_message = "Falha na geração de vídeo por IA."
            job.finished_at = datetime.now(timezone.utc)
        db.commit()
        publish_progress(job_id, 100, "error", message=str(exc))
    finally:
        db.close()
