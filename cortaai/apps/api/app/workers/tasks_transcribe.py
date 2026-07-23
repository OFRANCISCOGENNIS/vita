"""Transcription worker.

# INTEGRAÇÃO PAGA/GPU: Whisper large-v3. Real integration point (documented):

    from faster_whisper import WhisperModel
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    segments, info = model.transcribe(audio_path, language="pt",
                                      word_timestamps=True, vad_filter=True)
    words = [{"word": w.word.strip(), "start": w.start, "end": w.end,
              "speaker": None} for seg in segments for w in seg.words]

Audio is extracted first with FFmpeg:

    ffmpeg -y -i input.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le audio.wav

Offline fallback: deterministic word-level mock timestamps generated from a
pt-BR sample script so the whole pipeline works without GPU/network.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import Job, Project
from app.services.progress import publish_progress
from app.workers.celery_app import celery_app

FFMPEG_EXTRACT_AUDIO_CMD = "ffmpeg -y -i {input} -vn -ac 1 -ar 16000 -c:a pcm_s16le {output}"

# pt-BR sample scripts used by the mock transcriber (per niche flavor)
_SAMPLE_SCRIPTS = [
    "Você sabia que a maioria das pessoas comete esse erro todos os dias? "
    "Hoje eu vou te mostrar o segredo que ninguém te conta e que mudou completamente os meus resultados. "
    "Presta atenção porque isso é mais simples do que parece. "
    "O primeiro passo é entender exatamente onde você está errando. "
    "Depois disso, tudo fica muito mais fácil e você nunca mais vai olhar para isso da mesma forma. "
    "Se esse conteúdo te ajudou, comenta aqui embaixo e compartilha com alguém que precisa ver isso.",
    "Deixa eu te contar uma história rápida que vai mudar a sua visão sobre esse assunto. "
    "Quando eu comecei, eu não tinha ideia do quanto isso era importante. "
    "Aí um dia tudo mudou e eu descobri a verdade por trás de tudo isso. "
    "O que ninguém fala é que existe um caminho muito mais curto. "
    "E o melhor de tudo é que qualquer pessoa consegue aplicar isso hoje mesmo. "
    "Salva esse vídeo para não esquecer e me segue para a parte dois.",
    "Pare de fazer isso agora mesmo porque está te custando caro. "
    "Existem três erros que praticamente todo mundo comete sem perceber. "
    "O primeiro é o mais perigoso de todos e quase ninguém percebe. "
    "O segundo parece inofensivo mas destrói os seus resultados aos poucos. "
    "E o terceiro é exatamente o oposto do que te ensinaram a vida inteira. "
    "Comenta EU QUERO que eu te mando o material completo gratuito.",
]


def words_from_text(text: str, start: float = 0.0, words_per_second: float = 2.8, speaker: str | None = "SPEAKER_00") -> list[dict]:
    """Word-level mock timestamps (SPEC transcript shape: {word, start, end, speaker})."""
    step = 1.0 / max(words_per_second, 0.5)
    out: list[dict] = []
    t = start
    for raw in text.split():
        # longer words take a bit longer to say
        dur = min(step * (0.6 + len(raw) / 12.0), step * 2.2)
        out.append({"word": raw, "start": round(t, 2), "end": round(t + dur, 2), "speaker": speaker})
        t += dur
    return out


def mock_transcript(seed_key: str, duration_seconds: float) -> list[dict]:
    """Deterministic full-video transcript covering ~duration_seconds."""
    h = int(hashlib.sha256(seed_key.encode()).hexdigest(), 16)
    words: list[dict] = []
    t = 0.5
    i = 0
    while t < max(duration_seconds - 2.0, 5.0):
        script = _SAMPLE_SCRIPTS[(h + i) % len(_SAMPLE_SCRIPTS)]
        chunk = words_from_text(script, start=t, speaker=f"SPEAKER_0{(h + i) % 2}")
        for w in chunk:
            if w["end"] >= duration_seconds:
                break
            words.append(w)
        t = (words[-1]["end"] + 1.2) if words else duration_seconds
        i += 1
        if i > 400:  # safety
            break
    return words


@celery_app.task(name="app.workers.tasks_transcribe.transcribe_task", bind=True)
def transcribe_task(self, job_id: str, project_id: str) -> None:
    """Transcribes a project's video; stores the transcript in job.payload."""
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        project = db.get(Project, project_id)
        if job is None or project is None:
            return
        job.status = "running"
        project.status = "transcribing"
        db.commit()
        publish_progress(job_id, 5, "running", message="Extraindo áudio do vídeo...")

        # Real pipeline: FFMPEG_EXTRACT_AUDIO_CMD then Whisper (see module docstring).
        # INTEGRAÇÃO PAGA/GPU: Whisper large-v3 — mock fallback below.
        duration = project.duration_seconds or 900.0
        for pct, msg in ((25, "Transcrevendo com Whisper large-v3..."), (60, "Alinhando timestamps por palavra..."), (85, "Identificando falantes...")):
            publish_progress(job_id, pct, "running", message=msg)
            job.progress = pct
            db.commit()

        transcript = mock_transcript(project_id, duration)
        job.payload = {**(job.payload or {}), "transcript": transcript, "wordCount": len(transcript), "mock": True}
        job.status = "done"
        job.progress = 100
        job.finished_at = datetime.now(timezone.utc)
        project.status = "ready"
        db.commit()
        publish_progress(job_id, 100, "done", message="Transcrição concluída.")
    except Exception as exc:  # pragma: no cover
        db.rollback()
        job = db.get(Job, job_id)
        if job is not None:
            job.status = "error"
            job.error_message = "Falha na transcrição do vídeo."
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        publish_progress(job_id, 100, "error", message=str(exc))
    finally:
        db.close()


def latest_transcript_for_project(db, project_id: str) -> list[dict] | None:
    """Fetches the most recent transcribe job transcript for a project."""
    import sqlalchemy as sa

    job = db.execute(
        sa.select(Job)
        .where(Job.project_id == project_id, Job.type == "transcribe", Job.status == "done")
        .order_by(Job.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if job and job.payload and job.payload.get("transcript"):
        return job.payload["transcript"]
    return None
