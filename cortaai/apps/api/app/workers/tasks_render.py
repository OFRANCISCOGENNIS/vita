"""Render worker: FFmpeg pipeline builder + simulated execution.

The real command is built (and persisted in job.payload["ffmpegCommand"]) even
in mock mode, documenting the exact production pipeline:

1. Cut          — accurate seek: `-ss <start> -to <end>` after the input.
2. Crop 9:16    — animated crop keyframes are interpolated with an FFmpeg
                  expression on `crop=w:h:x:y` using lerp between keyframes
                  (from cuts.edit_state.cropKeyframes: [{t, x}] normalized).
3. Captions     — ASS subtitles burned with libass: `subtitles=captions.ass`.
                  Styles generated per caption preset (8 presets from SPEC).
4. Scale        — NEVER upscale: target = min(requested, source). When the
                  target equals the source, no scale filter is added.
5. Encode       — h264 (libx264) / h265 (libx265). 4K (2160p) uses
                  `-preset slow -crf 16` for maximum quality; lower
                  resolutions use `-preset medium -crf 19`.
6. Watermark    — free plan only: overlay of the CortaAí logo bottom-right.

Progress is simulated 0→100 and published to Redis pub/sub for the
WebSocket (/api/v1/ws/progress/{job_id}).
"""
from __future__ import annotations

import time
import zlib
import struct
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import Cut, Job, Project
from app.constants import RESOLUTION_HEIGHT
from app.services import storage
from app.services.progress import publish_progress
from app.workers.celery_app import celery_app

# --- caption styling (ASS) ----------------------------------------------------

# libass style strings per SPEC caption preset
ASS_PRESET_STYLES: dict[str, str] = {
    "hormozi": "Style: Default,Montserrat ExtraBold,64,&H00FFFFFF,&H0000FFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,4,2,2,120,120,320,1",
    "karaoke": "Style: Default,Inter Bold,56,&H00FFFFFF,&H0000D7FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,3,1,2,120,120,320,1",
    "neon": "Style: Default,Poppins Bold,58,&H00FFF700,&H00FF00E1,&H00120012,&H64000000,-1,0,0,0,100,100,0,0,1,3,4,2,120,120,320,1",
    "minimal": "Style: Default,Inter,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,120,120,320,1",
    "boldEmoji": "Style: Default,Nunito Black,60,&H00FFFFFF,&H0000A5FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,4,2,2,120,120,320,1",
    "highlightBox": "Style: Default,Archivo Black,56,&H00000000,&H00FFFFFF,&H0000F7FF,&H0000F7FF,-1,0,0,0,100,100,0,0,3,0,0,2,120,120,320,1",
    "typewriter": "Style: Default,JetBrains Mono,50,&H00E8E8E8,&H00FFFFFF,&H00000000,&HC8000000,0,0,0,0,100,100,0,0,1,2,0,2,120,120,320,1",
    "gradientAnimated": "Style: Default,Sora Bold,58,&H00FFB86B,&H00FF79C6,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,3,2,2,120,120,320,1",
}


def _ass_time(seconds: float) -> str:
    seconds = max(seconds, 0.0)
    h = int(seconds // 3600)
    m = int(seconds % 3600 // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _srt_time(seconds: float) -> str:
    seconds = max(seconds, 0.0)
    ms = int(round((seconds % 1) * 1000))
    s = int(seconds)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d},{ms:03d}"


def _group_words(transcript: list[dict], start_offset: float, max_words: int = 6) -> list[tuple[float, float, str]]:
    """Groups word timestamps into caption lines relative to the cut start."""
    groups: list[tuple[float, float, str]] = []
    buf: list[dict] = []
    for w in transcript or []:
        buf.append(w)
        if len(buf) >= max_words or w.get("word", "").rstrip().endswith((".", "!", "?")):
            groups.append((buf[0]["start"] - start_offset, buf[-1]["end"] - start_offset, " ".join(x["word"] for x in buf)))
            buf = []
    if buf:
        groups.append((buf[0]["start"] - start_offset, buf[-1]["end"] - start_offset, " ".join(x["word"] for x in buf)))
    return [(max(a, 0.0), max(b, 0.1), t) for a, b, t in groups]


def build_ass(transcript: list[dict], start_offset: float, preset: str = "hormozi") -> str:
    style = ASS_PRESET_STYLES.get(preset, ASS_PRESET_STYLES["hormozi"])
    lines = [
        "[Script Info]",
        "Title: CortaAí captions",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        style,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for a, b, text in _group_words(transcript, start_offset):
        # pop-in animation used by most presets (word-by-word feel via \fad)
        lines.append(f"Dialogue: 0,{_ass_time(a)},{_ass_time(b)},Default,,0,0,0,,{{\\fad(80,60)}}{text}")
    return "\n".join(lines) + "\n"


def build_srt(transcript: list[dict], start_offset: float) -> str:
    out = []
    for i, (a, b, text) in enumerate(_group_words(transcript, start_offset), start=1):
        out.append(f"{i}\n{_srt_time(a)} --> {_srt_time(b)}\n{text}\n")
    return "\n".join(out) + "\n"


# --- FFmpeg command builder -----------------------------------------------------

def _crop_expr(edit_state: dict | None) -> str:
    """9:16 crop with animated keyframes.

    edit_state.cropKeyframes = [{"t": seconds, "x": 0..1}] — x is the
    normalized horizontal center. Interpolated with nested lerp() expressions.
    """
    keyframes = (edit_state or {}).get("cropKeyframes") or []
    w, h = "ih*9/16", "ih"
    if len(keyframes) < 2:
        x = keyframes[0]["x"] if keyframes else 0.5
        return f"crop={w}:{h}:(iw-{w})*{x:.3f}:0"
    expr = f"{keyframes[-1]['x']:.3f}"
    for k0, k1 in zip(reversed(keyframes[:-1]), reversed(keyframes[1:])):
        t0, t1 = k0["t"], max(k1["t"], k0["t"] + 0.01)
        expr = f"lerp({k0['x']:.3f},{expr},min(max((t-{t0:.2f})/({t1 - t0:.2f}),0),1))"
    return f"crop={w}:{h}:(iw-{w})*({expr}):0"


def build_ffmpeg_command(
    input_path: str,
    output_path: str,
    ass_path: str,
    start: float,
    end: float,
    source_height: int,
    target_resolution: str,
    fps: int,
    codec: str,
    watermark: bool,
    edit_state: dict | None = None,
    watermark_path: str = "assets/watermark.png",
) -> str:
    requested_h = RESOLUTION_HEIGHT.get(target_resolution, 1080)
    target_h = min(requested_h, source_height)  # NEVER upscale
    target_w = round(target_h * 9 / 16 / 2) * 2

    filters = [_crop_expr(edit_state)]
    if target_h < source_height:
        filters.append(f"scale={target_w}:{target_h}:flags=lanczos")
    filters.append(f"ass={ass_path}")

    vcodec = "libx264" if codec == "h264" else "libx265"
    if target_h >= 2160:
        quality = "-preset slow -crf 16"  # 4K: max quality preset
    else:
        quality = "-preset medium -crf 19"

    filter_chain = ",".join(filters)
    if watermark:
        # free plan: CortaAí watermark bottom-right (10px margin)
        filtergraph = f"[0:v]{filter_chain}[v];[v][1:v]overlay=W-w-24:H-h-24[vout]"
        inputs = f'-i "{input_path}" -i "{watermark_path}"'
        map_v = '-map "[vout]" -map 0:a?'
    else:
        filtergraph = f"[0:v]{filter_chain}[vout]"
        inputs = f'-i "{input_path}"'
        map_v = '-map "[vout]" -map 0:a?'

    return (
        f'ffmpeg -y -ss {start:.2f} -to {end:.2f} {inputs} '
        f'-filter_complex "{filtergraph}" {map_v} '
        f"-r {fps} -c:v {vcodec} {quality} -pix_fmt yuv420p "
        f'-c:a aac -b:a 192k -movflags +faststart "{output_path}"'
    )


# --- placeholder binary assets ---------------------------------------------------

def _png_placeholder(rgb: tuple[int, int, int] = (17, 24, 39), size: int = 64) -> bytes:
    """Minimal valid solid-color PNG (AI thumbnail placeholder)."""
    row = b"\x00" + bytes(rgb) * size
    raw = row * size

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


# --- render task ------------------------------------------------------------------

_PROGRESS_STEPS = [
    (8, "Preparando pipeline de renderização..."),
    (20, "Cortando trecho do vídeo original..."),
    (38, "Aplicando crop 9:16 com keyframes..."),
    (55, "Queimando legendas animadas (libass)..."),
    (72, "Codificando vídeo..."),
    (86, "Gerando capa com IA e arquivos extras..."),
    (96, "Enviando arquivos para o armazenamento..."),
]


@celery_app.task(name="app.workers.tasks_render.render_task", bind=True)
def render_task(self, job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if job is None:
            return
        payload = job.payload or {}
        cut = db.get(Cut, job.cut_id) if job.cut_id else None
        if cut is None:
            raise ValueError("cut not found")
        project = db.get(Project, cut.project_id)

        job.status = "running"
        cut.status = "rendering"
        db.commit()

        resolution = payload.get("resolution", "1080p")
        fps = int(payload.get("fps", 30))
        codec = payload.get("codec", "h264")
        preset = payload.get("preset", "tiktok")
        watermark = bool(payload.get("watermark", False))
        caption_preset = ((cut.edit_state or {}).get("captionPreset")) or payload.get("captionPreset") or "hormozi"
        source_height = RESOLUTION_HEIGHT.get((project.resolution if project else None) or "1080p", 1080)

        ass_content = build_ass(cut.transcript or [], cut.start_seconds, caption_preset)
        srt_content = build_srt(cut.transcript or [], cut.start_seconds)
        ffmpeg_cmd = build_ffmpeg_command(
            input_path=(project.storage_key if project else None) or "source.mp4",
            output_path=f"renders/{job_id}/output.mp4",
            ass_path=f"renders/{job_id}/captions.ass",
            start=cut.start_seconds,
            end=cut.end_seconds,
            source_height=source_height,
            target_resolution=resolution,
            fps=fps,
            codec=codec,
            watermark=watermark,
            edit_state=cut.edit_state,
        )

        # Simulated execution — in production this parses `-progress pipe:1`
        # output from the real ffmpeg process and republishes each percentage.
        duration = max(cut.end_seconds - cut.start_seconds, 1.0)
        for pct, msg in _PROGRESS_STEPS:
            job.progress = pct
            job.eta_seconds = int(duration * (100 - pct) / 100)
            db.commit()
            publish_progress(job_id, pct, "running", eta_seconds=job.eta_seconds, message=msg)
            time.sleep(0.35)

        base = f"renders/{job_id}"
        # mock output video: header bytes + the documented command (real bytes come from ffmpeg)
        video_bytes = b"CORTAAI_RENDER\x00" + ffmpeg_cmd.encode()
        meta_txt = (
            f"{cut.title}\n\n{cut.description or ''}\n\n{' '.join(cut.hashtags or [])}\n\n"
            f"Melhor horário para postar: {cut.best_post_time or '19:00'}\n"
        )
        outputs = {
            "downloadUrl": storage.put_bytes(f"{base}/output.mp4", video_bytes, "video/mp4"),
            "srtUrl": storage.put_bytes(f"{base}/captions.srt", srt_content.encode(), "text/plain"),
            "thumbUrl": storage.put_bytes(f"{base}/thumbnail.png", _png_placeholder(), "image/png"),
            "metaTxtUrl": storage.put_bytes(f"{base}/descricao.txt", meta_txt.encode(), "text/plain"),
        }
        storage.put_bytes(f"{base}/captions.ass", ass_content.encode(), "text/plain")

        job.payload = {
            **payload,
            "outputs": outputs,
            "storageKeys": {
                "video": f"{base}/output.mp4",
                "srt": f"{base}/captions.srt",
                "thumb": f"{base}/thumbnail.png",
                "metaTxt": f"{base}/descricao.txt",
            },
            "ffmpegCommand": ffmpeg_cmd,
            "captionPreset": caption_preset,
            "platformPreset": preset,
        }
        job.status = "done"
        job.progress = 100
        job.eta_seconds = 0
        job.finished_at = datetime.now(timezone.utc)
        cut.status = "rendered"
        db.commit()
        publish_progress(job_id, 100, "done", message="Renderização concluída!", extra={"outputs": outputs})
    except Exception as exc:  # pragma: no cover
        db.rollback()
        job = db.get(Job, job_id)
        if job is not None:
            job.status = "error"
            job.error_message = "Falha na renderização do corte."
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        publish_progress(job_id, 100, "error", message=str(exc))
    finally:
        db.close()
