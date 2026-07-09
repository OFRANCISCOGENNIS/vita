from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.common import CamelModel

CutStatus = Literal["suggested", "edited", "rendering", "rendered"]


class ScoreBreakdown(CamelModel):
    """SPEC: cuts.score_breakdown = {hook, retention, emotion, nicheFit}."""

    hook: float
    retention: float
    emotion: float
    niche_fit: float  # serialized as "nicheFit"


class TranscriptWord(CamelModel):
    """SPEC: cuts.transcript = [{word, start, end, speaker}]."""

    word: str
    start: float
    end: float
    speaker: str | None = None


class SuggestedSound(CamelModel):
    """SPEC: cuts.suggested_sound = {track, reason, trendVideoId}."""

    track: str
    reason: str | None = None
    trend_video_id: str | None = None


class CutOut(CamelModel):
    id: str
    project_id: str
    title: str
    title_options: list[str] | None = None
    description: str | None = None
    hashtags: list[str] | None = None
    start_seconds: float
    end_seconds: float
    viral_score: float
    score_breakdown: ScoreBreakdown | None = None
    transcript: list[TranscriptWord] | None = None
    mode: str = "viral"
    suggested_sound: SuggestedSound | None = None
    best_post_time: str | None = None
    status: CutStatus = "suggested"
    edit_state: dict | None = None
    created_at: datetime | None = None


class CutPatchIn(CamelModel):
    """PATCH /cuts/{id} — all fields optional."""

    title: str | None = None
    description: str | None = None
    hashtags: list[str] | None = None
    start_seconds: float | None = None
    end_seconds: float | None = None
    best_post_time: str | None = None
    status: CutStatus | None = None
    edit_state: dict | None = None
