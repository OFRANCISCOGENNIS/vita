"""ESTÚDIO IA — camada de integração de vídeo generativo.

# INTEGRAÇÃO PAGA: Kling AI API
(alternativas equivalentes: Runway Gen-3, Luma Dream Machine, Pika)

Todas as 8 funções do Estúdio (text_to_video, image_to_video, extend, frames,
motion_brush, lip_sync, camera, effect_template) são geração de IA pesada em
GPU / API paga. A plataforma constrói a UI + o ponto de integração; sem
``KLING_API_KEY`` configurada, um MOCK DETERMINÍSTICO assume — resultado
placeholder + thumbnail SVG data-URI, estável por função+prompt — para o produto
rodar 100% offline e os testes serem reprodutíveis.

--------------------------------------------------------------------------------
Contrato real da Kling AI API (documentado — não executado no mock)
--------------------------------------------------------------------------------

Autenticação:  Authorization: Bearer <JWT assinado a partir de access/secret key>

1) Submeter geração (text-to-video / image-to-video):

   POST {KLING_API_BASE}/v1/videos/text2video
   {
     "model_name": "kling-v1",
     "prompt": "<prompt>",
     "negative_prompt": "<negativePrompt>",
     "aspect_ratio": "9:16",          # 9:16 | 1:1 | 16:9
     "duration": "5",                  # segundos (string na API da Kling)
     "camera_control": {"type": "simple", "config": {"zoom": 5}},
     "cfg_scale": 0.5
   }
   POST {KLING_API_BASE}/v1/videos/image2video   -> + "image": "<url|base64>"
   -> { "code": 0, "data": { "task_id": "..." , "task_status": "submitted" } }

   Endpoints por função:
     text_to_video     -> /v1/videos/text2video
     image_to_video    -> /v1/videos/image2video
     frames            -> /v1/videos/image2video (+ image_tail = quadro final)
     extend            -> /v1/videos/video-extend  { "video_id": "..." }
     motion_brush      -> /v1/videos/image2video (+ dynamic_masks/motion_brush)
     lip_sync          -> /v1/videos/lip-sync    { "video_id"|"video_url", "mode": "text2video"|"audio2video", "text"|"audio_url", "voice_id" }
     camera            -> /v1/videos/image2video|text2video (+ camera_control)
     effect_template   -> /v1/videos/effects     { "effect_scene": "explodir|..." }

2) Polling do job (a Kling é assíncrona — não há webhook por padrão):

   GET {KLING_API_BASE}/v1/videos/text2video/{task_id}
   -> data.task_status in (submitted | processing | succeed | failed)
   -> quando succeed: data.task_result.videos[0].url  (mp4 temporário da Kling)

3) Persistência: baixar o mp4 e reupar no nosso S3/MinIO (o link da Kling
   expira), gerar thumbnail com ``ffmpeg -i out.mp4 -frames:v 1 thumb.jpg`` e
   guardar ambos via app.services.storage.put_bytes.

O worker (app/workers/tasks_generative.py) orquestra submit -> poll -> download;
esta camada expõe apenas ``run_generation`` (mock) e ``build_kling_request``
(documentação viva do payload real).
"""
from __future__ import annotations

import hashlib
import html

from app.config import settings
from app.services import storage

# Kling só entrega 5s ou 10s; a UI oferece durações menores para preview.
DEFAULT_RESOLUTION = "1080p"
DEFAULT_FPS = 30.0

# Passos de progresso simulados (mesma UX da fila de render).
PROGRESS_STEPS: list[tuple[int, str]] = [
    (6, "Enviando prompt para o modelo de vídeo..."),
    (18, "Interpretando cena e movimento..."),
    (34, "Gerando quadros-chave..."),
    (52, "Sintetizando movimento entre quadros..."),
    (70, "Refinando detalhes e iluminação..."),
    (85, "Renderizando vídeo final..."),
    (95, "Enviando para o armazenamento..."),
]

# Rótulos pt-BR por função (mensagem inicial + descrição do resultado mock).
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

# Paleta determinística por função (fundo do thumbnail placeholder).
_FUNCTION_COLORS: dict[str, tuple[str, str]] = {
    "text_to_video": ("#7C3AED", "#0F172A"),
    "image_to_video": ("#2563EB", "#0F172A"),
    "extend": ("#059669", "#0F172A"),
    "frames": ("#DB2777", "#0F172A"),
    "motion_brush": ("#EA580C", "#0F172A"),
    "lip_sync": ("#0891B2", "#0F172A"),
    "camera": ("#CA8A04", "#0F172A"),
    "effect_template": ("#DC2626", "#0F172A"),
}


def is_live() -> bool:
    """True quando há chave da Kling — usa a API real; senão, mock."""
    return bool(settings.kling_api_key)


def model_name() -> str:
    return settings.kling_model if is_live() else "mock"


def _seed(function: str, prompt: str | None, params: dict | None) -> str:
    raw = f"{function}|{prompt or ''}|{sorted((params or {}).items()) if params else ''}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _aspect_dims(params: dict | None) -> tuple[int, int]:
    ratio = (params or {}).get("aspectRatio") or (params or {}).get("aspect_ratio") or "9:16"
    mapping = {"9:16": (720, 1280), "1:1": (1000, 1000), "16:9": (1280, 720), "4:5": (960, 1200)}
    return mapping.get(ratio, (720, 1280))


def build_thumbnail_svg(function: str, prompt: str | None, params: dict | None) -> str:
    """SVG data-URI determinístico (placeholder de preview, sem rede)."""
    seed = _seed(function, prompt, params)
    w, h = _aspect_dims(params)
    c1, c2 = _FUNCTION_COLORS.get(function, ("#7C3AED", "#0F172A"))
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
    import base64

    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


def build_kling_request(function: str, prompt: str | None, params: dict | None, assets: dict) -> dict:
    """# INTEGRAÇÃO PAGA: Kling AI — monta o payload real (documentação viva).

    Não faz chamada de rede; é usado para (a) documentar o contrato e (b)
    persistir em Generation.params['klingRequest'] para auditoria/depuração.
    """
    p = params or {}
    endpoints = {
        "text_to_video": "/v1/videos/text2video",
        "image_to_video": "/v1/videos/image2video",
        "frames": "/v1/videos/image2video",
        "extend": "/v1/videos/video-extend",
        "motion_brush": "/v1/videos/image2video",
        "lip_sync": "/v1/videos/lip-sync",
        "camera": "/v1/videos/text2video",
        "effect_template": "/v1/videos/effects",
    }
    body: dict = {"model_name": settings.kling_model}
    if prompt:
        body["prompt"] = prompt
    if p.get("negativePrompt"):
        body["negative_prompt"] = p["negativePrompt"]
    if p.get("aspectRatio"):
        body["aspect_ratio"] = p["aspectRatio"]
    if p.get("duration") or p.get("seconds"):
        body["duration"] = str(p.get("duration") or p.get("seconds"))
    if assets.get("input_asset_url"):
        body["image"] = assets["input_asset_url"]
    if assets.get("input_asset_url_2"):
        body["image_tail"] = assets["input_asset_url_2"]
    if function == "effect_template":
        body["effect_scene"] = p.get("template")
    return {"method": "POST", "url": settings.kling_api_base + endpoints[function], "body": body}


def run_generation(
    function: str,
    prompt: str | None,
    params: dict | None,
    input_asset_url: str | None = None,
) -> dict:
    """MOCK DETERMINÍSTICO: produz result_url + thumbnail_url estáveis.

    Na versão paga, o worker submete ``build_kling_request`` à Kling, faz o
    polling do task_id e baixa o mp4 — vide docstring do módulo. Aqui gravamos
    um mp4 placeholder (bytes determinísticos) no storage e um thumbnail SVG.
    """
    seed = _seed(function, prompt, params)
    duration = float((params or {}).get("duration") or (params or {}).get("seconds") or 5)
    thumb = build_thumbnail_svg(function, prompt, params)

    # mp4 placeholder — na produção estes bytes vêm do download do vídeo da Kling.
    marker = build_kling_request(function, prompt, params, {"input_asset_url": input_asset_url})
    video_bytes = b"CORTAAI_STUDIO\x00" + f"{function}:{seed}:{marker['url']}".encode()
    key = f"studio/{function}/{seed[:16]}/result.mp4"
    result_url = storage.put_bytes(key, video_bytes, "video/mp4")

    return {
        "result_url": result_url,
        "thumbnail_url": thumb,
        "duration_seconds": duration,
        "resolution": DEFAULT_RESOLUTION,
        "fps": DEFAULT_FPS,
        "model": model_name(),
        "storage_key": key,
        "kling_request": marker,
    }
