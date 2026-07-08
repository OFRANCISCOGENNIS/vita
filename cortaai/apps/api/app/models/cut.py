from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JsonB, created_at_col, uuid_pk


class Cut(Base):
    """SPEC: cuts — jsonb shapes:
    - title_options: string[3]
    - hashtags: string[]
    - score_breakdown: {hook, retention, emotion, nicheFit}
    - transcript: [{word, start, end, speaker}]
    - suggested_sound: {track, reason, trendVideoId}
    - edit_state: editor timeline
    mode (viral|qa|tutorial|quotes|manual); status (suggested|edited|rendering|rendered)."""

    __tablename__ = "cuts"

    id: Mapped[str] = uuid_pk()
    project_id: Mapped[str] = mapped_column(sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    title_options: Mapped[list | None] = mapped_column(JsonB)
    description: Mapped[str | None] = mapped_column(sa.Text)
    hashtags: Mapped[list | None] = mapped_column(JsonB)
    start_seconds: Mapped[float] = mapped_column(sa.Float, nullable=False, default=0.0)
    end_seconds: Mapped[float] = mapped_column(sa.Float, nullable=False, default=0.0)
    viral_score: Mapped[float] = mapped_column(sa.Float, nullable=False, default=0.0)
    score_breakdown: Mapped[dict | None] = mapped_column(JsonB)
    transcript: Mapped[list | None] = mapped_column(JsonB)
    mode: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="viral")
    suggested_sound: Mapped[dict | None] = mapped_column(JsonB)
    best_post_time: Mapped[str | None] = mapped_column(sa.String(50))
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="suggested", index=True)
    edit_state: Mapped[dict | None] = mapped_column(JsonB)
    created_at: Mapped[datetime] = created_at_col()

    project = relationship("Project", back_populates="cuts")
