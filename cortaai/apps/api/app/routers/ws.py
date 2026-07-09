"""WebSocket /api/v1/ws/progress/{job_id}.

Streams job progress as JSON frames:
    {"jobId", "progress", "status", "etaSeconds", "message", ...}

Source of truth: Redis pub/sub (published by Celery workers). Fallback when
Redis is unavailable: in-process memory map (inline jobs) + database polling.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.models import Job
from app.services.progress import CHANNEL_PREFIX, get_async_redis, get_memory_state, get_redis_state

router = APIRouter(tags=["ws"])

_TERMINAL = {"done", "error"}


def _db_snapshot(job_id: str) -> dict | None:
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if job is None:
            return None
        return {
            "jobId": job.id,
            "progress": job.progress,
            "status": job.status,
            "etaSeconds": job.eta_seconds,
            "message": job.error_message,
        }
    finally:
        db.close()


@router.websocket("/ws/progress/{job_id}")
async def ws_progress(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    try:
        redis = await get_async_redis()
        if redis is not None:
            await _stream_from_redis(websocket, redis, job_id)
        else:
            await _stream_from_memory(websocket, job_id)
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass


async def _send(websocket: WebSocket, snapshot: dict) -> bool:
    """Sends a frame; returns True when the stream should end (terminal state)."""
    await websocket.send_json(snapshot)
    return snapshot.get("status") in _TERMINAL and int(snapshot.get("progress") or 0) >= 100


async def _stream_from_redis(websocket: WebSocket, redis, job_id: str) -> None:
    pubsub = redis.pubsub()
    await pubsub.subscribe(CHANNEL_PREFIX + job_id)
    try:
        initial = get_redis_state(job_id) or _db_snapshot(job_id)
        if initial is not None and await _send(websocket, initial):
            return
        idle = 0.0
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message is not None and message.get("type") == "message":
                idle = 0.0
                snapshot = json.loads(message["data"])
                if await _send(websocket, snapshot):
                    return
            else:
                idle += 1.0
                if idle >= 5.0:  # heartbeat via DB in case a publish was missed
                    idle = 0.0
                    snapshot = _db_snapshot(job_id)
                    if snapshot is not None and await _send(websocket, snapshot):
                        return
    finally:
        try:
            await pubsub.unsubscribe(CHANNEL_PREFIX + job_id)
            await pubsub.aclose()
        except Exception:
            pass


async def _stream_from_memory(websocket: WebSocket, job_id: str) -> None:
    """In-memory fallback: poll the process-local map + database."""
    last: tuple | None = None
    while True:
        snapshot = get_memory_state(job_id) or _db_snapshot(job_id)
        if snapshot is None:
            await websocket.send_json({"jobId": job_id, "progress": 0, "status": "queued", "etaSeconds": None, "message": None})
            await asyncio.sleep(0.5)
            continue
        fingerprint = (snapshot.get("progress"), snapshot.get("status"), snapshot.get("message"))
        if fingerprint != last:
            last = fingerprint
            if await _send(websocket, snapshot):
                return
        await asyncio.sleep(0.4)
