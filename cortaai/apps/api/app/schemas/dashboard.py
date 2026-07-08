from __future__ import annotations

from app.schemas.common import CamelModel
from app.schemas.project import ProjectOut


class UsagePoint(CamelModel):
    date: str  # YYYY-MM-DD
    minutes: float


class NicheHighlight(CamelModel):
    niche: str
    headline: str
    retention_index: float
    trend_video_id: str | None = None


class DashboardStatsOut(CamelModel):
    minutes_processed: float
    cuts_generated: int
    recent_projects: list[ProjectOut]
    usage_series: list[UsagePoint]
    niche_highlights: list[NicheHighlight]
