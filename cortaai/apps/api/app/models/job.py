from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JsonB, created_at_col, uuid_pk


class Job(Base):
    """SPEC: jobs — type (import|transcribe|analyze|render|radar_scan);
    status (queued|running|done|error); progress 0–100."""

    __tablename__ = "jobs"

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    project_id: Mapped[str | None] = mapped_column(sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    cut_id: Mapped[str | None] = mapped_column(sa.ForeignKey("cuts.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(sa.String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="queued", index=True)
    progress: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
    eta_seconds: Mapped[int | None] = mapped_column(sa.Integer)
    error_message: Mapped[str | None] = mapped_column(sa.Text)
    payload: Mapped[dict | None] = mapped_column(JsonB)
    created_at: Mapped[datetime] = created_at_col()
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
