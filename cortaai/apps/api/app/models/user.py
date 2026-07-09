from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JsonB, created_at_col, uuid_pk


class User(Base):
    """SPEC: users — branding_kit jsonb {logo_url, font, colors[], caption_preset}.

    Sem planos/cobrança: todo usuário autenticado tem acesso ilimitado."""

    __tablename__ = "users"

    id: Mapped[str] = uuid_pk()
    email: Mapped[str] = mapped_column(sa.String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(sa.String(200))
    name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(sa.String(1000))
    google_id: Mapped[str | None] = mapped_column(sa.String(200), index=True)
    branding_kit: Mapped[dict | None] = mapped_column(JsonB)
    created_at: Mapped[datetime] = created_at_col()

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
