from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, uuid_pk


class Subscription(Base):
    """SPEC: subscriptions — interval (month|year)."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(sa.String(200), index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(sa.String(200), index=True)
    plan: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    interval: Mapped[str] = mapped_column(sa.String(10), nullable=False, default="month")
    status: Mapped[str] = mapped_column(sa.String(30), nullable=False, default="active")
    current_period_end: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_col()
