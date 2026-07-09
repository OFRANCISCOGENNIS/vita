"""ESTÚDIO IA — Pydantic v2 schemas (SPEC APÊNDICE — Módulo ESTÚDIO IA).

The database is snake_case; SPEC JSON payloads are camelCase (aspectRatio,
cameraMovement, inputAssetUrl…). CamelModel's alias generator bridges both, so
requests may arrive camelCase and responses serialize camelCase via
`model_dump(by_alias=True)` (FastAPI response_model handles this).

The `params` jsonb of each function follows the exact contract in the SPEC. The
nested models below both document and validate those shapes; routers persist the
validated dict (`model_dump(by_alias=True)`) into Generation.params.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel

StudioFunction = Literal[
    "text_to_video",
    "image_to_video",
    "extend",
    "frames",
    "motion_brush",
    "lip_sync",
    "camera",
    "effect_template",
]
GenerationStatus = Literal["queued", "running", "done", "error"]

AspectRatio = Literal["9:16", "1:1", "16:9", "4:5"]
Style = Literal["cinematográfico", "anime", "realista", "3D"]
CameraMovement = Literal["none", "zoom_in", "orbit", "pan_left"]
Motion = Literal["sutil", "moderado", "intenso"]
CameraMoveType = Literal["zoom_in", "pan_left", "orbit", "tilt_up", "dolly"]
EffectTemplate = Literal["explodir", "abraco", "envelhecer", "transformar", "derreter", "inflar"]


# ---------------------------------------------------------------------------
# params shapes (one nested model per function — the SPEC contract)
# ---------------------------------------------------------------------------

class TextToVideoParams(CamelModel):
    """SPEC text_to_video params."""

    aspect_ratio: AspectRatio = "9:16"
    duration: int = 5
    style: Style = "cinematográfico"
    camera_movement: CameraMovement = "none"
    negative_prompt: str = ""


class ImageToVideoParams(CamelModel):
    """SPEC image_to_video params."""

    motion: Motion = "moderado"
    duration: int = 5
    camera_movement: CameraMovement = "none"


class ExtendParams(CamelModel):
    """SPEC extend params — gera continuação / loop perfeito."""

    seconds: int = 4
    direction: Literal["forward", "loop"] = "forward"


class FramesParams(CamelModel):
    """SPEC frames params — quadro inicial (input_asset_url) + final (input_asset_url_2)."""

    duration: int = 5


class BrushStroke(CamelModel):
    """SPEC motion_brush.strokes[] item."""

    path: list[list[float]] = Field(default_factory=list)  # [[x, y], ...]
    direction: list[float] = Field(default_factory=lambda: [0.0, 0.0])  # [dx, dy]
    intensity: float = 0.7


class MotionBrushParams(CamelModel):
    """SPEC motion_brush params."""

    strokes: list[BrushStroke] = Field(default_factory=list)
    duration: int = 5


class LipSyncParams(CamelModel):
    """SPEC lip_sync params."""

    source: Literal["ttsText", "audioUrl"] = "ttsText"
    tts_text: str = ""
    audio_url: str | None = None
    voice: str = "pt-BR-Francisca"
    language: str = "pt-BR"


class CameraMove(CamelModel):
    """SPEC camera.moves[] item."""

    type: CameraMoveType = "zoom_in"
    start_second: float = 0.0
    end_second: float = 3.0


class CameraParams(CamelModel):
    """SPEC camera params."""

    moves: list[CameraMove] = Field(default_factory=list)


class EffectTemplateParams(CamelModel):
    """SPEC effect_template params."""

    template: EffectTemplate = "explodir"


# ---------------------------------------------------------------------------
# request bodies (one per endpoint)
# ---------------------------------------------------------------------------

class TextToVideoIn(CamelModel):
    prompt: str = Field(min_length=1)
    params: TextToVideoParams = Field(default_factory=TextToVideoParams)
    project_id: str | None = None


class ImageToVideoIn(CamelModel):
    input_asset_url: str = Field(min_length=1)
    prompt: str | None = None
    params: ImageToVideoParams = Field(default_factory=ImageToVideoParams)
    project_id: str | None = None


class ExtendIn(CamelModel):
    cut_id: str | None = None
    generation_id: str | None = None
    prompt: str | None = None
    params: ExtendParams = Field(default_factory=ExtendParams)
    project_id: str | None = None


class FramesIn(CamelModel):
    start_image_url: str = Field(min_length=1)
    end_image_url: str = Field(min_length=1)
    prompt: str | None = None
    params: FramesParams = Field(default_factory=FramesParams)
    project_id: str | None = None


class MotionBrushIn(CamelModel):
    input_asset_url: str = Field(min_length=1)
    prompt: str | None = None
    params: MotionBrushParams = Field(default_factory=MotionBrushParams)
    project_id: str | None = None


class LipSyncIn(CamelModel):
    cut_id: str | None = None
    input_asset_url: str | None = None
    params: LipSyncParams = Field(default_factory=LipSyncParams)
    project_id: str | None = None


class CameraIn(CamelModel):
    cut_id: str | None = None
    input_asset_url: str | None = None
    prompt: str | None = None
    params: CameraParams = Field(default_factory=CameraParams)
    project_id: str | None = None


class EffectIn(CamelModel):
    input_asset_url: str = Field(min_length=1)
    params: EffectTemplateParams = Field(default_factory=EffectTemplateParams)
    project_id: str | None = None


# ---------------------------------------------------------------------------
# responses
# ---------------------------------------------------------------------------

class GenerationOut(CamelModel):
    id: str
    user_id: str
    project_id: str | None = None
    cut_id: str | None = None
    function: StudioFunction
    prompt: str | None = None
    params: dict | None = None
    input_asset_url: str | None = None
    input_asset_url_2: str | None = None
    status: GenerationStatus = "queued"
    progress: int = 0
    error_message: str | None = None
    result_url: str | None = None
    thumbnail_url: str | None = None
    duration_seconds: float | None = None
    resolution: str | None = None
    fps: float | None = None
    model: str = "mock"
    created_at: datetime | None = None
    finished_at: datetime | None = None


class EffectTemplateOut(CamelModel):
    id: str
    label: str
    thumbnail_url: str | None = None
    preview_url: str | None = None


class EffectTemplatesOut(CamelModel):
    templates: list[EffectTemplateOut]


class ToCutIn(CamelModel):
    project_id: str | None = None
