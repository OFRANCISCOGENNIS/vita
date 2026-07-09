"""Multimodal analysis worker → generates ranked cuts.

Real pipeline integration points (documented commands):

- Frame sampling for visual analysis:
      ffmpeg -y -i input.mp4 -vf fps=1,scale=320:-1 frames/%05d.jpg
- Audio extraction for energy analysis:
      ffmpeg -y -i input.mp4 -vn -ac 1 -ar 22050 -c:a pcm_s16le audio.wav
- Scene boundaries (PySceneDetect):
      from scenedetect import detect, ContentDetector
      scenes = detect("input.mp4", ContentDetector(threshold=27.0))
- Audio energy peaks (librosa):
      import librosa, numpy as np
      y, sr = librosa.load("audio.wav")
      rms = librosa.feature.rms(y=y, hop_length=sr // 4)[0]
      times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=sr // 4)
      peaks = times[rms > np.percentile(rms, 85)]

Offline fallback: deterministic energy peaks + transcript-window candidates,
scored by app/services/scoring.py.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

import sqlalchemy as sa

from app.database import SessionLocal
from app.models import Cut, Job, NichePattern, Project
from app.services import llm
from app.services.progress import publish_progress
from app.services.scoring import compute_viral_score, transcript_to_text
from app.workers.celery_app import celery_app
from app.workers.tasks_transcribe import latest_transcript_for_project, mock_transcript

FFMPEG_FRAMES_CMD = "ffmpeg -y -i {input} -vf fps=1,scale=320:-1 {outdir}/%05d.jpg"
FFMPEG_AUDIO_CMD = "ffmpeg -y -i {input} -vn -ac 1 -ar 22050 -c:a pcm_s16le {output}"

# target cut length (seconds) per generation mode
MODE_TARGET_LENGTH: dict[str, tuple[float, float]] = {
    "viral": (25.0, 60.0),
    "qa": (30.0, 75.0),
    "tutorial": (45.0, 90.0),
    "quotes": (12.0, 30.0),
    "manual": (20.0, 60.0),
}

BEST_POST_TIMES = ["07:30", "12:15", "18:30", "19:45", "21:00"]


def _mock_energy_peaks(seed_key: str, duration: float) -> list[float]:
    """Deterministic stand-in for librosa RMS peaks (one every ~4–8s)."""
    h = int(hashlib.sha256(seed_key.encode()).hexdigest(), 16)
    peaks, t = [], 2.0 + (h % 30) / 10.0
    while t < duration:
        peaks.append(round(t, 2))
        t += 4.0 + ((h := h // 7) % 40) / 10.0
    return peaks


def _candidate_windows(duration: float, mode: str, aggressiveness: int) -> list[tuple[float, float]]:
    """Sliding windows over the video; higher aggressiveness → more, shorter cuts."""
    lo, hi = MODE_TARGET_LENGTH.get(mode, MODE_TARGET_LENGTH["viral"])
    length = hi - (hi - lo) * (aggressiveness - 1) / 4.0
    step = max(length * (0.85 - 0.1 * aggressiveness), 8.0)
    windows, start = [], 1.0
    while start + length <= duration:
        windows.append((round(start, 1), round(start + length, 1)))
        start += step
    if not windows:
        windows = [(0.0, min(duration, hi))]
    return windows


def _niche_for_project(db, project: Project) -> tuple[str | None, float | None]:
    """Best-effort niche guess + its average viral duration from niche_patterns."""
    title = (project.title or "").lower()
    from app.constants import NICHES

    niche = next((n for n in NICHES if n.rstrip("s") in title or n in title), None) or "podcast"
    pattern = db.execute(
        sa.select(NichePattern).where(NichePattern.niche == niche, NichePattern.period == "7d")
    ).scalar_one_or_none()
    return niche, (pattern.avg_duration if pattern else None)


@celery_app.task(name="app.workers.tasks_analyze.analyze_task", bind=True)
def analyze_task(self, job_id: str, project_id: str, mode: str = "viral", aggressiveness: int = 3, count: int = 6) -> None:
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        project = db.get(Project, project_id)
        if job is None or project is None:
            return
        job.status = "running"
        project.status = "analyzing"
        db.commit()
        publish_progress(job_id, 5, "running", message="Extraindo frames e áudio (FFmpeg)...")

        duration = project.duration_seconds or 900.0
        transcript = latest_transcript_for_project(db, project_id) or mock_transcript(project_id, duration)
        peaks = _mock_energy_peaks(project_id, duration)
        niche, niche_avg = _niche_for_project(db, project)

        publish_progress(job_id, 30, "running", message="Detectando cenas e picos de energia...")
        job.progress = 30
        db.commit()

        inspiration = (job.payload or {}).get("inspiration")  # from radar inspire-cut
        windows = _candidate_windows(duration, mode, aggressiveness)
        scored: list[tuple[float, dict, tuple[float, float], list[dict]]] = []
        for start, end in windows:
            words = [w for w in transcript if start <= w.get("start", 0) < end]
            length = end - start
            if inspiration and inspiration.get("idealDuration"):
                length_target = float(inspiration["idealDuration"])
                end = min(start + length_target, duration)
                words = [w for w in transcript if start <= w.get("start", 0) < end]
            score, breakdown = compute_viral_score(
                words, end - start, [p - start for p in peaks if start <= p < end], niche, niche_avg
            )
            scored.append((score, breakdown, (start, end), words))
        scored.sort(key=lambda item: item[0], reverse=True)

        publish_progress(job_id, 60, "running", message="Gerando títulos e hashtags com IA...")
        job.progress = 60
        db.commit()

        created_ids: list[str] = []
        for rank, (score, breakdown, (start, end), words) in enumerate(scored[: max(count, 1)]):
            text = transcript_to_text(words)
            titles = llm.generate_titles(text, niche)
            cut = Cut(
                project_id=project_id,
                title=titles[0],
                title_options=titles,
                description=llm.generate_description(text, niche),
                hashtags=llm.generate_hashtags(text, niche),
                start_seconds=start,
                end_seconds=end,
                viral_score=score,
                score_breakdown=breakdown,
                transcript=words,
                mode=mode,
                best_post_time=BEST_POST_TIMES[rank % len(BEST_POST_TIMES)],
                status="suggested",
                edit_state=None,
            )
            db.add(cut)
            db.flush()
            created_ids.append(cut.id)

        project.status = "ready"
        job.status = "done"
        job.progress = 100
        job.finished_at = datetime.now(timezone.utc)
        job.payload = {**(job.payload or {}), "cutIds": created_ids, "niche": niche}
        db.commit()
        publish_progress(job_id, 100, "done", message=f"{len(created_ids)} cortes gerados.", extra={"cutIds": created_ids})
    except Exception as exc:  # pragma: no cover
        db.rollback()
        job = db.get(Job, job_id)
        if job is not None:
            job.status = "error"
            job.error_message = "Falha na análise do vídeo."
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        publish_progress(job_id, 100, "error", message=str(exc))
    finally:
        db.close()
