from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_col, uuid_pk


class Project(Base):
    """SPEC: projects — source_type (upload|youtube|twitch|vimeo);
    resolution (720p|1080p|1440p|2160p); language (pt-BR|en|es|auto);
    status (importing|transcribing|analyzing|ready|error)."""

    __tablename__ = "projects"

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    source_type: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="upload")
    source_url: Mapped[str | None] = mapped_column(sa.String(2000))
    original_filename: Mapped[str | None] = mapped_column(sa.String(500))
    duration_seconds: Mapped[float | None] = mapped_column(sa.Float)
    resolution: Mapped[str | None] = mapped_column(sa.String(10))
    fps: Mapped[float | None] = mapped_column(sa.Float)
    language: Mapped[str] = mapped_column(sa.String(10), nullable=False, default="auto")
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="importing", index=True)
    thumbnail_url: Mapped[str | None] = mapped_column(sa.String(2000))
    storage_key: Mapped[str | None] = mapped_column(sa.String(1000))
    created_at: Mapped[datetime] = created_at_col()

    user = relationship("User", back_populates="projects")
    cuts = relationship("Cut", back_populates="project", cascade="all, delete-orphan")
