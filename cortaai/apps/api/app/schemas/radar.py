"""Radar Viral schemas — mirror trend_videos / trend_analyses / niche_patterns
including the exact jsonb shapes from the SPEC."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.common import CamelModel

Platform = Literal["youtube", "tiktok", "instagram"]
Period = Literal["24h", "7d", "30d"]


class TrendVideoOut(CamelModel):
    id: str
    platform: Platform
    external_id: str
    url: str
    title: str
    channel: str | None = None
    thumbnail_url: str | None = None
    niche: str
    language: str | None = None
    duration_seconds: float | None = None
    views: int = 0
    views_per_hour: float = 0.0
    likes: int = 0
    comments: int = 0
    published_at: datetime | None = None
    retention_index: float = 0.0
    fetched_at: datetime | None = None


class TrendListOut(CamelModel):
    items: list[TrendVideoOut]


# --- Raio-X jsonb shapes (SPEC contract) -----------------------------------

class VoiceInfo(CamelModel):
    words_per_minute: int | None = None
    pauses: str | None = None
    tone: str | None = None


class StrategicSilence(CamelModel):
    at_second: float
    duration_ms: int


class SoundAnalysis(CamelModel):
    track: str | None = None
    track_trending: bool = False
    bpm: int | None = None
    energy: float | None = None
    sound_effects: list[str] = []
    voice: VoiceInfo | None = None
    strategic_silences: list[StrategicSilence] = []


class CaptionsInfo(CamelModel):
    present: bool = True
    style: str | None = None
    position: str | None = None


class ImageAnalysis(CamelModel):
    cuts_per_minute: int | None = None
    zoom_punches: int | None = None
    dominant_palette: list[str] = []
    captions: CaptionsInfo | None = None
    on_screen_text: bool = False
    lighting: str | None = None
    framing: str | None = None


class StructureAnalysis(CamelModel):
    hook_type: str | None = None
    hook_text: str | None = None
    narrative_arc: str | None = None
    ideal_duration: int | None = None
    cta: str | None = None
    perfect_loop: bool = False


class RetentionPoint(CamelModel):
    second: int
    retention_pct: float
    marker: str | None = None


class TrendAnalysisOut(CamelModel):
    id: str
    trend_video_id: str
    sound: SoundAnalysis | None = None
    image: ImageAnalysis | None = None
    structure: StructureAnalysis | None = None
    retention_timeline: list[RetentionPoint] | None = None
    generated_at: datetime | None = None


class NichePatternOut(CamelModel):
    id: str
    niche: str
    period: Period
    avg_duration: float | None = None
    top_caption_styles: list | None = None
    trending_sounds: list | None = None
    top_hooks: list | None = None
    best_post_times: list | None = None
    computed_at: datetime | None = None


class NichesOut(CamelModel):
    niches: list[str]


class NicheAlertIn(CamelModel):
    niche: str


class NicheAlertOut(CamelModel):
    id: str
    user_id: str
    niche: str
    enabled: bool = True
    last_notified_at: datetime | None = None


class UseSoundIn(CamelModel):
    cut_id: str


class UseCaptionStyleIn(CamelModel):
    project_id: str


class InspireCutIn(CamelModel):
    project_id: str
