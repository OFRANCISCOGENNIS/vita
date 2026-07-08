from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JsonB, created_at_col, uuid_pk


class Generation(Base):
    """SPEC (APÊNDICE — Módulo ESTÚDIO IA): generations.

    function in (text_to_video | image_to_video | extend | frames |
    motion_brush | lip_sync | camera | effect_template).
    status in (queued | running | done | error); progress 0–100.
    model in (kling-v1 | mock). params is a per-function jsonb (contrato
    documentado em app/schemas/studio.py).
    """

    __tablename__ = "generations"

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    project_id: Mapped[str | None] = mapped_column(sa.ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    cut_id: Mapped[str | None] = mapped_column(sa.ForeignKey("cuts.id", ondelete="SET NULL"), index=True)
    function: Mapped[str] = mapped_column(sa.String(30), nullable=False, index=True)
    prompt: Mapped[str | None] = mapped_column(sa.Text)
    params: Mapped[dict | None] = mapped_column(JsonB)
    input_asset_url: Mapped[str | None] = mapped_column(sa.String(2000))
    input_asset_url_2: Mapped[str | None] = mapped_column(sa.String(2000))
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="queued", index=True)
    progress: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(sa.Text)
    result_url: Mapped[str | None] = mapped_column(sa.String(2000))
    thumbnail_url: Mapped[str | None] = mapped_column(sa.String(2000))
    duration_seconds: Mapped[float | None] = mapped_column(sa.Float)
    resolution: Mapped[str | None] = mapped_column(sa.String(10))
    fps: Mapped[float | None] = mapped_column(sa.Float)
    model: Mapped[str] = mapped_column(sa.String(30), nullable=False, default="mock")
    created_at: Mapped[datetime] = created_at_col()
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
