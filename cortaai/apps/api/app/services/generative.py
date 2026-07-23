"""ESTÚDIO IA — geração de vídeo REAL com FFmpeg (sem Kling, sem chave).

Cada uma das 8 funções do Estúdio (text_to_video, image_to_video, extend,
frames, motion_brush, lip_sync, camera, effect_template) renderiza um arquivo
``.mp4`` DE VERDADE com FFmpeg (H.264/yuv420p) e o persiste no storage
(MinIO via app.services.storage, com fallback local). O thumbnail também é
real: um frame extraído do próprio vídeo com ffmpeg.

Cada função monta um comando FFmpeg documentado (drawtext/gradients/zoompan/
xfade/tpad/hue/curves/etc.) e o executa via subprocess com timeout; o progresso
real é derivado da saída ``-progress`` do ffmpeg e publicado no WebSocket
existente pelo worker (app.workers.tasks_generative).

Entradas de imagem/vídeo são baixadas quando possível; offline (sem rede) um
fundo em gradiente é sintetizado localmente para que um mp4 real seja SEMPRE
produzido. Se o ffmpeg não existir no ambiente, cai num placeholder (logado).

# INTEGRAÇÃO PAGA: geração fotorrealista/semântica (texto→cena, lip-sync real,
# motion-brush neural) exige um modelo externo de GPU (Kling/Runway/Luma/Pika).
# Aqui entregamos uma aproximação honesta 100% local com FFmpeg.
"""
from __future__ import annotations

import base64
import hashlib
import html
import logging
import os
import shutil
import subprocess
import tempfile
import textwrap
import urllib.request
from pathlib import Path

from app.services import storage

logger = logging.getLogger(__name__)

DEFAULT_FPS = 30.0
_MAX_DURATION = 15.0  # teto de segurança para renders locais
_FFMPEG_TIMEOUT = 120  # segundos por render

# Rótulos pt-BR por função.
FUNCTION_LABELS: dict[str, str] = {
    "text_to_video": "Texto para vídeo",
    "image_to_video": "Imagem para vídeo",
    "extend": "Estender / loop",
    "frames": "Quadros inicial e final",
    "motion_brush": "Pincel de movimento",
    "lip_sync": "Sincronia labial",
    "camera": "Direção de câmera",
    "effect_template": "Efeito com template",
}

# Efeitos disponíveis (galeria de templates) — id, rótulo pt-BR e cor de fundo.
EFFECT_TEMPLATES: list[dict] = [
    {"id": "explodir", "label": "Explodir", "color": "#EF4444"},
    {"id": "abraco", "label": "Abraço", "color": "#EC4899"},
    {"id": "envelhecer", "label": "Envelhecer", "color": "#A16207"},
    {"id": "transformar", "label": "Transformar", "color": "#8B5CF6"},
    {"id": "derreter", "label": "Derreter", "color": "#F59E0B"},
    {"id": "inflar", "label": "Inflar", "color": "#06B6D4"},
]

# Paleta determinística por função (cores do gradiente de fundo).
_FUNCTION_COLORS: dict[str, tuple[str, str]] = {
    "text_to_video": ("0x7C3AED", "0x0F172A"),
    "image_to_video": ("0x2563EB", "0x0F172A"),
    "extend": ("0x059669", "0x0F172A"),
    "frames": ("0xDB2777", "0x0F172A"),
    "motion_brush": ("0xEA580C", "0x0F172A"),
    "lip_sync": ("0x0891B2", "0x0F172A"),
    "camera": ("0xCA8A04", "0x0F172A"),
    "effect_template": ("0xDC2626", "0x0F172A"),
}

_CANDIDATE_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]


# ---------------------------------------------------------------------------
# capabilities
# ---------------------------------------------------------------------------

def ffmpeg_bin() -> str | None:
    return shutil.which("ffmpeg")


def ffprobe_bin() -> str | None:
    return shutil.which("ffprobe")


def has_ffmpeg() -> bool:
    return ffmpeg_bin() is not None


def model_name() -> str:
    """model="ffmpeg" quando renderizamos de verdade; "mock" sem ffmpeg."""
    return "ffmpeg" if has_ffmpeg() else "mock"


def _font_file() -> str | None:
    for f in _CANDIDATE_FONTS:
        if os.path.exists(f):
            return f
    return None


# ---------------------------------------------------------------------------
# deterministic helpers (seed / dims / SVG thumbnail fallback)
# ---------------------------------------------------------------------------

def _seed(function: str, prompt: str | None, params: dict | None) -> str:
    raw = f"{function}|{prompt or ''}|{sorted((params or {}).items()) if params else ''}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _even(n: int) -> int:
    n = int(round(n))
    return n if n % 2 == 0 else n + 1


def _aspect_dims(params: dict | None) -> tuple[int, int]:
    ratio = (params or {}).get("aspectRatio") or (params or {}).get("aspect_ratio") or "9:16"
    mapping = {"9:16": (720, 1280), "1:1": (1000, 1000), "16:9": (1280, 720), "4:5": (864, 1080)}
    w, h = mapping.get(ratio, (720, 1280))
    return _even(w), _even(h)


def _duration(params: dict | None) -> float:
    d = float((params or {}).get("duration") or (params or {}).get("seconds") or 5)
    return max(1.0, min(_MAX_DURATION, d))


def _fps(params: dict | None) -> float:
    return float((params or {}).get("fps") or DEFAULT_FPS)


def build_thumbnail_svg(function: str, prompt: str | None, params: dict | None) -> str:
    """SVG data-URI determinístico — usado na galeria de templates de efeito e
    como fallback de thumbnail quando o ffmpeg não está disponível."""
    seed = _seed(function, prompt, params)
    w, h = _aspect_dims(params)
    c1 = "#" + _FUNCTION_COLORS.get(function, ("0x7C3AED", "0x0F172A"))[0][2:]
    c2 = "#" + _FUNCTION_COLORS.get(function, ("0x7C3AED", "0x0F172A"))[1][2:]
    accent = "#" + seed[:6]
    label = html.escape(FUNCTION_LABELS.get(function, function))
    caption = html.escape((prompt or FUNCTION_LABELS.get(function, function))[:42])
    cx = 20 + int(seed[6:8], 16) % max(w - 40, 1)
    cy = 20 + int(seed[8:10], 16) % max(h - 40, 1)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>'
        f'<rect width="{w}" height="{h}" fill="url(#g)"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{max(w, h) // 6}" fill="{accent}" opacity="0.35"/>'
        f'<circle cx="{w // 2}" cy="{h // 2}" r="{min(w, h) // 8}" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="6"/>'
        f'<polygon points="{w // 2 - 14},{h // 2 - 20} {w // 2 - 14},{h // 2 + 20} {w // 2 + 22},{h // 2}" fill="#FFFFFF" fill-opacity="0.85"/>'
        f'<text x="24" y="52" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#FFFFFF">Estúdio IA</text>'
        f'<text x="24" y="90" font-family="Arial, sans-serif" font-size="22" fill="#FFFFFF" opacity="0.85">{label}</text>'
        f'<text x="24" y="{h - 32}" font-family="Arial, sans-serif" font-size="20" fill="#FFFFFF" opacity="0.9">{caption}</text>'
        f"</svg>"
    )
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


# ---------------------------------------------------------------------------
# input preparation (download or synthesize)
# ---------------------------------------------------------------------------

def _fetch_url_bytes(url: str, timeout: int = 8) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CortaAI/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            return resp.read()
    except Exception:
        return None


def _resolve_local_asset(url: str | None) -> bytes | None:
    """Tenta materializar bytes de um asset: chave de storage local, data-URI,
    caminho de arquivo, ou download HTTP(S). None em qualquer falha."""
    if not url:
        return None
    if url.startswith("data:"):
        try:
            return base64.b64decode(url.split(",", 1)[1])
        except Exception:
            return None
    # chave interna de storage (mock/local) — ex.: put_bytes gerou URL com a key
    for candidate in (url, url.split("?", 1)[0]):
        try:
            key = candidate.split(f"/{storage.settings.s3_bucket}/", 1)[-1]
            data = storage.get_bytes(key)
            if data:
                return data
        except Exception:
            pass
    if os.path.exists(url):
        try:
            return Path(url).read_bytes()
        except Exception:
            return None
    if url.startswith("http://") or url.startswith("https://"):
        return _fetch_url_bytes(url)
    return None


def _synth_gradient_image(path: str, w: int, h: int, function: str) -> None:
    """Gera uma imagem de fundo em gradiente com ffmpeg (fallback offline)."""
    c1, c2 = _FUNCTION_COLORS.get(function, ("0x7C3AED", "0x0F172A"))
    subprocess.run(
        [
            ffmpeg_bin() or "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"gradients=s={w}x{h}:c0={c1}:c1={c2}:x0=0:y0=0:x1={w}:y1={h}",
            "-frames:v", "1", path,
        ],
        capture_output=True, timeout=30,
    )


def _prepare_image(url: str | None, w: int, h: int, function: str, workdir: str, name: str = "in.png") -> str:
    """Devolve um caminho local para uma imagem WxH (cover). Baixa o asset
    quando possível; senão sintetiza um gradiente — sempre retorna algo válido."""
    path = os.path.join(workdir, name)
    raw = _resolve_local_asset(url)
    if raw and raw[:4] not in (b"CORT",):  # ignora placeholders mock antigos
        src = os.path.join(workdir, "src_" + name)
        Path(src).write_bytes(raw)
        # normaliza para WxH com cover (scale+crop); se falhar, sintetiza.
        proc = subprocess.run(
            [
                ffmpeg_bin() or "ffmpeg", "-y", "-i", src,
                "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1",
                "-frames:v", "1", path,
            ],
            capture_output=True, timeout=30,
        )
        if proc.returncode == 0 and os.path.exists(path):
            return path
    _synth_gradient_image(path, w, h, function)
    return path


# ---------------------------------------------------------------------------
# ffmpeg execution with real progress
# ---------------------------------------------------------------------------

def _run_ffmpeg(args: list[str], total_duration: float, progress_cb=None, lo: int = 15, hi: int = 92) -> bool:
    """Executa ffmpeg parseando ``-progress pipe:1`` para publicar progresso real.

    Retorna True quando o processo termina com sucesso.
    """
    cmd = [ffmpeg_bin() or "ffmpeg", "-y", "-nostats", "-progress", "pipe:1", *args]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except Exception:
        logger.exception("Falha ao iniciar ffmpeg")
        return False

    total_us = max(total_duration, 0.1) * 1_000_000
    try:
        for line in proc.stdout:  # type: ignore[union-attr]
            line = line.strip()
            if progress_cb and (line.startswith("out_time_us=") or line.startswith("out_time_ms=")):
                try:
                    val = int(line.split("=", 1)[1])
                    cur_us = val if line.startswith("out_time_us=") else val * 1000
                    frac = max(0.0, min(1.0, cur_us / total_us))
                    pct = int(lo + (hi - lo) * frac)
                    progress_cb(pct, "Renderizando vídeo com FFmpeg...")
                except Exception:
                    pass
        proc.wait(timeout=_FFMPEG_TIMEOUT)
    except Exception:
        logger.exception("Execução do ffmpeg falhou/expirou")
        proc.kill()
        return False
    return proc.returncode == 0


def _extract_thumbnail(video_path: str, workdir: str, at: float = 0.5) -> bytes | None:
    thumb = os.path.join(workdir, "thumb.jpg")
    proc = subprocess.run(
        [ffmpeg_bin() or "ffmpeg", "-y", "-ss", f"{at:.2f}", "-i", video_path,
         "-frames:v", "1", "-q:v", "3", thumb],
        capture_output=True, timeout=30,
    )
    if proc.returncode == 0 and os.path.exists(thumb):
        return Path(thumb).read_bytes()
    return None


def _encode_tail(fps: float, dur: float, out_path: str) -> list[str]:
    return [
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
        "-movflags", "+faststart", "-r", f"{fps:g}", "-t", f"{dur:g}", out_path,
    ]


# ---------------------------------------------------------------------------
# per-function ffmpeg command builders
# each returns a list of ffmpeg args (without the leading `ffmpeg -y`)
# ---------------------------------------------------------------------------

def _drawtext_filter(prompt: str | None, function: str, workdir: str, w: int, h: int, dur: float) -> str | None:
    font = _font_file()
    if not font:
        return None
    text = (prompt or FUNCTION_LABELS.get(function, "Estúdio IA")).strip()
    wrapped = "\n".join(textwrap.wrap(text, width=max(12, w // 34)) or [text])[:400]
    tfile = os.path.join(workdir, "text.txt")
    Path(tfile).write_text(wrapped, encoding="utf-8")
    fontsize = max(24, h // 16)
    fade_out = max(0.3, dur - 0.6)
    return (
        f"drawtext=fontfile='{font}':textfile='{tfile}':fontcolor=white:fontsize={fontsize}"
        f":x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=24:line_spacing=12"
        f",fade=t=in:st=0:d=0.6,fade=t=out:st={fade_out:.2f}:d=0.6"
    )


def _zoompan_move(camera: str, tot: int, w: int, h: int) -> str:
    """Expressão zoompan por movimento de câmera."""
    base_x = "iw/2-(iw/zoom/2)"
    base_y = "ih/2-(ih/zoom/2)"
    if camera in ("zoom_in", "dolly"):
        return f"zoompan=z='min(zoom+0.0018,1.6)':x='{base_x}':y='{base_y}':d={tot}"
    if camera == "pan_left":
        return f"zoompan=z=1.3:x='(iw-iw/zoom)*(1-on/{tot})':y='{base_y}':d={tot}"
    if camera == "pan_right":
        return f"zoompan=z=1.3:x='(iw-iw/zoom)*(on/{tot})':y='{base_y}':d={tot}"
    if camera == "tilt_up":
        return f"zoompan=z=1.3:x='{base_x}':y='(ih-ih/zoom)*(1-on/{tot})':d={tot}"
    if camera == "orbit":
        return (
            f"zoompan=z=1.35:x='(iw-iw/zoom)/2+(iw-iw/zoom)/2*sin(2*PI*on/{tot})'"
            f":y='(ih-ih/zoom)/2+(ih-ih/zoom)/2*cos(2*PI*on/{tot})':d={tot}"
        )
    # none / default: gentle push-in
    return f"zoompan=z='min(zoom+0.0010,1.3)':x='{base_x}':y='{base_y}':d={tot}"


def _build_text_to_video(prompt, params, assets, workdir, out, w, h, fps, dur, function="text_to_video") -> list[str]:
    c1, c2 = _FUNCTION_COLORS.get(function, ("0x7C3AED", "0x0F172A"))
    grad = f"gradients=s={w}x{h}:c0={c1}:c1={c2}:x0=0:y0=0:x1={w}:y1={h}:d={dur:g}:r={fps:g}"
    dt = _drawtext_filter(prompt, function, workdir, w, h, dur)
    vf = f"[0:v]{dt}[v]" if dt else "[0:v]fade=t=in:st=0:d=0.6[v]"
    return ["-f", "lavfi", "-i", grad, "-filter_complex", vf, "-map", "[v]", *_encode_tail(fps, dur, out)]


def _build_image_to_video(prompt, params, assets, workdir, out, w, h, fps, dur, function="image_to_video") -> list[str]:
    img = _prepare_image(assets.get("input_asset_url"), w, h, function, workdir)
    tot = int(dur * fps)
    camera = (params or {}).get("cameraMovement") or (params or {}).get("camera_movement") or "zoom_in"
    zp = _zoompan_move(camera, tot, w, h)
    vf = f"[0:v]scale={w * 2}:{h * 2},{zp}:s={w}x{h}:fps={fps:g},fade=t=in:st=0:d=0.4[v]"
    return ["-loop", "1", "-t", f"{dur:g}", "-i", img, "-filter_complex", vf, "-map", "[v]",
            *_encode_tail(fps, dur, out)]


def _build_frames(prompt, params, assets, workdir, out, w, h, fps, dur, function="frames") -> list[str]:
    a = _prepare_image(assets.get("input_asset_url"), w, h, function, workdir, "a.png")
    b = _prepare_image(assets.get("input_asset_url_2"), w, h, function, workdir, "b.png")
    xd = min(1.5, dur / 2.0)
    off = max(0.1, dur - xd)
    vf = (
        f"[0:v]scale={w}:{h},setsar=1,fps={fps:g}[a];"
        f"[1:v]scale={w}:{h},setsar=1,fps={fps:g}[b];"
        f"[a][b]xfade=transition=fade:duration={xd:.2f}:offset={off:.2f}[v]"
    )
    return ["-loop", "1", "-t", f"{dur:g}", "-i", a, "-loop", "1", "-t", f"{dur:g}", "-i", b,
            "-filter_complex", vf, "-map", "[v]", *_encode_tail(fps, dur, out)]


def _build_extend(prompt, params, assets, workdir, out, w, h, fps, dur, function="extend") -> list[str]:
    seconds = float((params or {}).get("seconds") or (params or {}).get("duration") or 4)
    seconds = max(1.0, min(_MAX_DURATION, seconds))
    direction = (params or {}).get("direction") or "loop"
    # base clip: usa o vídeo de origem se disponível localmente; senão sintetiza
    src = _resolve_local_asset(assets.get("input_asset_url"))
    base = os.path.join(workdir, "base.mp4")
    base_dur = 2.0
    if src and src[:4] not in (b"CORT",):
        Path(os.path.join(workdir, "src.mp4")).write_bytes(src)
        probe = subprocess.run(
            [ffmpeg_bin() or "ffmpeg", "-y", "-i", os.path.join(workdir, "src.mp4"),
             "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1",
             "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", base],
            capture_output=True, timeout=60,
        )
        if probe.returncode != 0:
            src = None
    if not src:
        img = _prepare_image(None, w, h, function, workdir)
        tot = int(base_dur * fps)
        subprocess.run(
            [ffmpeg_bin() or "ffmpeg", "-y", "-loop", "1", "-t", f"{base_dur:g}", "-i", img,
             "-filter_complex", f"[0:v]scale={w * 2}:{h * 2},{_zoompan_move('zoom_in', tot, w, h)}:s={w}x{h}:fps={fps:g}[v]",
             "-map", "[v]", *_encode_tail(fps, base_dur, base)],
            capture_output=True, timeout=60,
        )
    total = base_dur + seconds
    if direction == "loop":
        # boomerang: clipe + reverso = loop perfeito
        vf = "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]"
    else:
        # forward: prolonga clonando o último frame (tpad)
        vf = f"[0:v]tpad=stop_mode=clone:stop_duration={seconds:g}[v]"
    return ["-i", base, "-filter_complex", vf, "-map", "[v]", *_encode_tail(fps, total, out)]


def _build_motion_brush(prompt, params, assets, workdir, out, w, h, fps, dur, function="motion_brush") -> list[str]:
    img = _prepare_image(assets.get("input_asset_url"), w, h, function, workdir)
    tot = int(dur * fps)
    strokes = (params or {}).get("strokes") or []
    dx, dy = (1.0, 0.0)
    if strokes and isinstance(strokes[0], dict):
        d = strokes[0].get("direction") or [1, 0]
        dx, dy = (float(d[0]), float(d[1])) if len(d) >= 2 else (1.0, 0.0)
    sgx = 1 if dx >= 0 else -1
    sgy = 1 if dy >= 0 else -1
    # parallax: zoom fixo + deslocamento animado da região (aproximação real)
    zp = (
        f"zoompan=z=1.3:d={tot}:s={w}x{h}:fps={fps:g}"
        f":x='iw/2-(iw/zoom/2)+{sgx}*(on/{tot})*iw*0.14'"
        f":y='ih/2-(ih/zoom/2)+{sgy}*(on/{tot})*ih*0.14'"
    )
    vf = f"[0:v]scale={w * 2}:{h * 2},{zp},fade=t=in:st=0:d=0.4[v]"
    return ["-loop", "1", "-t", f"{dur:g}", "-i", img, "-filter_complex", vf, "-map", "[v]",
            *_encode_tail(fps, dur, out)]


def _build_camera(prompt, params, assets, workdir, out, w, h, fps, dur, function="camera") -> list[str]:
    img = _prepare_image(assets.get("input_asset_url"), w, h, function, workdir)
    tot = int(dur * fps)
    moves = (params or {}).get("moves") or []
    camera = "orbit"
    if moves and isinstance(moves[0], dict):
        camera = moves[0].get("type") or "orbit"
    zp = _zoompan_move(camera, tot, w, h)
    vf = f"[0:v]scale={w * 2}:{h * 2},{zp}:s={w}x{h}:fps={fps:g},fade=t=in:st=0:d=0.4[v]"
    return ["-loop", "1", "-t", f"{dur:g}", "-i", img, "-filter_complex", vf, "-map", "[v]",
            *_encode_tail(fps, dur, out)]


def _build_effect(prompt, params, assets, workdir, out, w, h, fps, dur, function="effect_template") -> list[str]:
    img = _prepare_image(assets.get("input_asset_url"), w, h, function, workdir)
    tot = int(dur * fps)
    template = (params or {}).get("template") or "explodir"
    base_x, base_y = "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    # movimento base + filtro estilístico real por template
    effects = {
        "explodir": (f"zoompan=z='min(zoom+0.03,3)':x='{base_x}':y='{base_y}':d={tot}", ""),
        "abraco": (f"zoompan=z='min(zoom+0.004,1.4)':x='{base_x}':y='{base_y}':d={tot}", ""),
        "envelhecer": (f"zoompan=z='min(zoom+0.001,1.2)':x='{base_x}':y='{base_y}':d={tot}",
                       ",curves=preset=vintage,noise=alls=10:allf=t+u,vignette"),
        "transformar": (f"zoompan=z=1.2:x='{base_x}':y='{base_y}':d={tot}", ",hue=H=2*PI*t/2"),
        "derreter": (f"zoompan=z='min(zoom+0.002,1.3)':x='{base_x}':y='{base_y}':d={tot}",
                     ",tblend=all_mode=average,tmix=frames=3:weights='1 1 1'"),
        "inflar": (f"zoompan=z='1.15+0.15*sin(on/6)':x='{base_x}':y='{base_y}':d={tot}", ""),
    }
    zp, extra = effects.get(template, effects["explodir"])
    vf = f"[0:v]scale={w * 2}:{h * 2},{zp}:s={w}x{h}:fps={fps:g}{extra}[v]"
    return ["-loop", "1", "-t", f"{dur:g}", "-i", img, "-filter_complex", vf, "-map", "[v]",
            *_encode_tail(fps, dur, out)]


def _build_lip_sync(prompt, params, assets, workdir, out, w, h, fps, dur, function="lip_sync") -> list[str]:
    """Aproximação honesta de lip-sync: clipe com forma de onda do áudio/TTS +
    legenda sincronizada sobre a imagem/fundo.

    # INTEGRAÇÃO PAGA: lip-sync FOTORREALISTA (mover os lábios de um rosto
    # conforme o áudio) exige um modelo externo (ex.: Kling lip-sync, SadTalker,
    # Wav2Lip). Sem chave/GPU, geramos esta visualização de áudio + caption.
    """
    p = params or {}
    tts = p.get("ttsText") or prompt or "Sincronia labial (demonstração)"
    c1, c2 = _FUNCTION_COLORS.get(function, ("0x0891B2", "0x0F172A"))
    # áudio sintético (sem TTS externo): tom suave — só para termos uma trilha real
    audio = f"sine=frequency=180:duration={dur:g}"
    grad = f"gradients=s={w}x{h}:c0={c1}:c1={c2}:x0=0:y0=0:x1={w}:y1={h}:d={dur:g}:r={fps:g}"
    wave = f"[1:a]showwaves=s={w}x{max(120, h // 6)}:mode=cline:colors=white,format=rgba[wv]"
    dt = _drawtext_filter(tts, function, workdir, w, h, dur)
    text_part = f",{dt}" if dt else ""
    vf = (
        f"{wave};"
        f"[0:v]scale={w}:{h}{text_part}[bg];"
        f"[bg][wv]overlay=(W-w)/2:H-h-80[v]"
    )
    return [
        "-f", "lavfi", "-i", grad,
        "-f", "lavfi", "-i", audio,
        "-filter_complex", vf, "-map", "[v]", "-map", "1:a",
        "-c:a", "aac", "-b:a", "128k", "-shortest",
        *_encode_tail(fps, dur, out),
    ]


_BUILDERS = {
    "text_to_video": _build_text_to_video,
    "image_to_video": _build_image_to_video,
    "frames": _build_frames,
    "extend": _build_extend,
    "motion_brush": _build_motion_brush,
    "camera": _build_camera,
    "effect_template": _build_effect,
    "lip_sync": _build_lip_sync,
}


def build_ffmpeg_args(
    function: str, prompt: str | None, params: dict | None, workdir: str, out_path: str,
    input_asset_url: str | None = None, input_asset_url_2: str | None = None,
) -> tuple[list[str], int, int, float, float]:
    """Monta os args ffmpeg para a função. Retorna (args, w, h, fps, dur)."""
    w, h = _aspect_dims(params)
    fps = _fps(params)
    dur = _duration(params)
    assets = {"input_asset_url": input_asset_url, "input_asset_url_2": input_asset_url_2}
    builder = _BUILDERS.get(function, _build_text_to_video)
    args = builder(prompt, params, assets, workdir, out_path, w, h, fps, dur)
    return args, w, h, fps, dur


# ---------------------------------------------------------------------------
# main entrypoint
# ---------------------------------------------------------------------------

def run_generation(
    function: str,
    prompt: str | None,
    params: dict | None,
    input_asset_url: str | None = None,
    input_asset_url_2: str | None = None,
    progress_cb=None,
) -> dict:
    """Renderiza um .mp4 REAL com FFmpeg e o persiste no storage.

    Retorna result_url + thumbnail_url reais, além de duração/resolução/fps e
    o comando ffmpeg (para auditoria). Sem ffmpeg, cai num placeholder logado.
    """
    seed = _seed(function, prompt, params)
    w, h = _aspect_dims(params)
    fps = _fps(params)
    dur = _duration(params)
    resolution = f"{h}p"
    key = f"studio/{function}/{seed[:16]}/result.mp4"
    thumb_key = f"studio/{function}/{seed[:16]}/thumb.jpg"

    if not has_ffmpeg():
        # Degradação: ffmpeg ausente — placeholder + thumbnail SVG (logado).
        logger.warning("FFmpeg ausente — Estúdio IA gerando placeholder para %s.", function)
        video_bytes = b"CORTAAI_STUDIO_PLACEHOLDER\x00" + f"{function}:{seed}".encode()
        result_url = storage.put_bytes(key, video_bytes, "video/mp4")
        return {
            "result_url": result_url,
            "thumbnail_url": build_thumbnail_svg(function, prompt, params),
            "duration_seconds": dur,
            "resolution": resolution,
            "fps": fps,
            "model": "mock",
            "storage_key": key,
            "ffmpeg_command": None,
        }

    workdir = tempfile.mkdtemp(prefix="cortaai-studio-")
    try:
        out_path = os.path.join(workdir, "result.mp4")
        try:
            args, w, h, fps, dur = build_ffmpeg_args(
                function, prompt, params, workdir, out_path, input_asset_url, input_asset_url_2
            )
        except Exception:
            logger.exception("Falha ao montar comando ffmpeg para %s", function)
            args = None

        ok = False
        if args is not None:
            # duração total pode exceder `dur` (ex.: extend/frames) — usa a maior.
            total = dur
            if "-t" in args:
                try:
                    total = float(args[args.index("-t", args.index("-filter_complex") if "-filter_complex" in args else 0) + 1])
                except Exception:
                    total = dur
            ok = _run_ffmpeg(args, total, progress_cb=progress_cb)

        if ok and os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            video_bytes = Path(out_path).read_bytes()
            result_url = storage.put_bytes(key, video_bytes, "video/mp4")
            thumb_bytes = _extract_thumbnail(out_path, workdir, at=min(1.0, dur / 2.0))
            if thumb_bytes:
                thumbnail_url = storage.put_bytes(thumb_key, thumb_bytes, "image/jpeg")
            else:
                thumbnail_url = build_thumbnail_svg(function, prompt, params)
            # duração real do arquivo
            real_dur = _probe_duration(out_path) or dur
            return {
                "result_url": result_url,
                "thumbnail_url": thumbnail_url,
                "duration_seconds": round(real_dur, 2),
                "resolution": resolution,
                "fps": fps,
                "model": "ffmpeg",
                "storage_key": key,
                "ffmpeg_command": "ffmpeg -y " + " ".join(args) if args else None,
            }

        # ffmpeg falhou: placeholder (não quebra o produto).
        logger.warning("Render ffmpeg falhou para %s — usando placeholder.", function)
        video_bytes = b"CORTAAI_STUDIO_PLACEHOLDER\x00" + f"{function}:{seed}".encode()
        result_url = storage.put_bytes(key, video_bytes, "video/mp4")
        return {
            "result_url": result_url,
            "thumbnail_url": build_thumbnail_svg(function, prompt, params),
            "duration_seconds": dur,
            "resolution": resolution,
            "fps": fps,
            "model": "mock",
            "storage_key": key,
            "ffmpeg_command": "ffmpeg -y " + " ".join(args) if args else None,
        }
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _probe_duration(path: str) -> float | None:
    probe = ffprobe_bin()
    if not probe:
        return None
    try:
        out = subprocess.run(
            [probe, "-v", "error", "-show_entries", "format=duration", "-of",
             "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=15,
        )
        return float(out.stdout.strip())
    except Exception:
        return None
