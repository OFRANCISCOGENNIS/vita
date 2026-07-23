"""Radar Viral tables: trend_videos, trend_analyses (Raio-X), niche_patterns,
niche_alerts — exactly per SPEC."""
from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JsonB, uuid_pk, utcnow


class TrendVideo(Base):
    """SPEC: trend_videos — platform (youtube|tiktok|instagram);
    retention_index 0–100."""

    __tablename__ = "trend_videos"
    __table_args__ = (sa.UniqueConstraint("platform", "external_id", name="uq_trend_platform_external"),)

    id: Mapped[str] = uuid_pk()
    platform: Mapped[str] = mapped_column(sa.String(20), nullable=False, index=True)
    external_id: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    url: Mapped[str] = mapped_column(sa.String(2000), nullable=False)
    title: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    channel: Mapped[str | None] = mapped_column(sa.String(200))
    thumbnail_url: Mapped[str | None] = mapped_column(sa.String(2000))
    niche: Mapped[str] = mapped_column(sa.String(50), nullable=False, index=True)
    language: Mapped[str | None] = mapped_column(sa.String(10))
    duration_seconds: Mapped[float | None] = mapped_column(sa.Float)
    views: Mapped[int] = mapped_column(sa.BigInteger, nullable=False, default=0)
    views_per_hour: Mapped[float] = mapped_column(sa.Float, nullable=False, default=0.0)
    likes: Mapped[int] = mapped_column(sa.BigInteger, nullable=False, default=0)
    comments: Mapped[int] = mapped_column(sa.BigInteger, nullable=False, default=0)
    published_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    retention_index: Mapped[float] = mapped_column(sa.Float, nullable=False, default=0.0)
    fetched_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, default=utcnow)

    analysis = relationship("TrendAnalysis", back_populates="trend_video", uselist=False, cascade="all, delete-orphan")


class TrendAnalysis(Base):
    """SPEC: trend_analyses (Raio-X) — jsonb shapes:
    sound {track, trackTrending, bpm, energy, soundEffects[], voice{}, strategicSilences[]}
    image {cutsPerMinute, zoomPunches, dominantPalette[], captions{}, onScreenText, lighting, framing}
    structure {hookType, hookText, narrativeArc, idealDuration, cta, perfectLoop}
    retention_timeline [{second, retentionPct, marker}] — one point per second."""

    __tablename__ = "trend_analyses"

    id: Mapped[str] = uuid_pk()
    trend_video_id: Mapped[str] = mapped_column(
        sa.ForeignKey("trend_videos.id", ondelete="CASCADE"), index=True, nullable=False, unique=True
    )
    sound: Mapped[dict | None] = mapped_column(JsonB)
    image: Mapped[dict | None] = mapped_column(JsonB)
    structure: Mapped[dict | None] = mapped_column(JsonB)
    retention_timeline: Mapped[list | None] = mapped_column(JsonB)
    generated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, default=utcnow)

    trend_video = relationship("TrendVideo", back_populates="analysis")


class NichePattern(Base):
    """SPEC: niche_patterns — period (24h|7d|30d)."""

    __tablename__ = "niche_patterns"
    __table_args__ = (sa.UniqueConstraint("niche", "period", name="uq_niche_pattern_period"),)

    id: Mapped[str] = uuid_pk()
    niche: Mapped[str] = mapped_column(sa.String(50), nullable=False, index=True)
    period: Mapped[str] = mapped_column(sa.String(5), nullable=False)
    avg_duration: Mapped[float | None] = mapped_column(sa.Float)
    top_caption_styles: Mapped[list | None] = mapped_column(JsonB)
    trending_sounds: Mapped[list | None] = mapped_column(JsonB)
    top_hooks: Mapped[list | None] = mapped_column(JsonB)
    best_post_times: Mapped[list | None] = mapped_column(JsonB)
    computed_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, default=utcnow)


class NicheAlert(Base):
    """SPEC: niche_alerts."""

    __tablename__ = "niche_alerts"
    __table_args__ = (sa.UniqueConstraint("user_id", "niche", name="uq_niche_alert_user_niche"),)

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    niche: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    enabled: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)
    last_notified_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
