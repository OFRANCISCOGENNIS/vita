"""Celery application + beat schedule (Radar Viral).

- worker:  celery -A app.workers.celery_app worker -l info
- radar:   celery -A app.workers.celery_app beat -l info
"""
from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "cortaai",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.tasks_import",
        "app.workers.tasks_transcribe",
        "app.workers.tasks_analyze",
        "app.workers.tasks_render",
        "app.workers.tasks_radar",
        "app.workers.tasks_generative",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    # Publishing from the API must fail fast when Redis is down so the inline
    # fallback (threads) can take over — see app/workers/dispatch.py.
    broker_connection_timeout=2,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        # Radar Viral scan: hourly (quota-safe — results cached in Redis)
        "radar-scan-hourly": {
            "task": "app.workers.tasks_radar.radar_scan_all",
            "schedule": crontab(minute=0),
        },
        # Niche patterns recomputed every 6 hours
        "niche-patterns-every-6h": {
            "task": "app.workers.tasks_radar.compute_all_niche_patterns",
            "schedule": crontab(minute=15, hour="*/6"),
        },
    },
)
