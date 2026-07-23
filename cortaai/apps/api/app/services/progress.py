"""Job progress bus.

Publish side (Celery workers / inline fallback threads): writes the latest
snapshot to Redis (pub/sub channel + state key) and to an in-process memory
map. Subscribe side (WebSocket): prefers Redis pub/sub; falls back to the
in-memory map + database polling when Redis is unavailable — which is exactly
the scenario where jobs run inline in the API process.
"""
from __future__ import annotations

import json
import threading
from typing import Any

from app.config import settings

CHANNEL_PREFIX = "cortaai:progress:"
STATE_PREFIX = "cortaai:progress-state:"
STATE_TTL_SECONDS = 3600

_memory_state: dict[str, dict] = {}
_memory_lock = threading.Lock()

_redis_client = None
_redis_failed = False


def _get_redis():
    """Sync Redis client (publish side). Returns None when unreachable."""
    global _redis_client, _redis_failed
    if _redis_failed:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        import redis

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=2)
        client.ping()
        _redis_client = client
        return client
    except Exception:
        _redis_failed = True
        return None


def publish_progress(
    job_id: str,
    progress: int,
    status: str,
    *,
    eta_seconds: int | None = None,
    message: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    snapshot: dict[str, Any] = {
        "jobId": job_id,
        "progress": int(progress),
        "status": status,
        "etaSeconds": eta_seconds,
        "message": message,
    }
    if extra:
        snapshot.update(extra)

    with _memory_lock:
        _memory_state[job_id] = snapshot

    client = _get_redis()
    if client is not None:
        try:
            raw = json.dumps(snapshot, ensure_ascii=False)
            client.publish(CHANNEL_PREFIX + job_id, raw)
            client.setex(STATE_PREFIX + job_id, STATE_TTL_SECONDS, raw)
        except Exception:
            pass  # never break a worker because of progress reporting


def get_memory_state(job_id: str) -> dict | None:
    with _memory_lock:
        return _memory_state.get(job_id)


def get_redis_state(job_id: str) -> dict | None:
    client = _get_redis()
    if client is None:
        return None
    try:
        raw = client.get(STATE_PREFIX + job_id)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def get_async_redis():
    """Async Redis client for the WebSocket subscriber. None when unreachable."""
    try:
        import redis.asyncio as aioredis

        client = aioredis.Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=3)
        await client.ping()
        return client
    except Exception:
        return None
