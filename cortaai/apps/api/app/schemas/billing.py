from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.common import CamelModel


class CheckoutIn(CamelModel):
    plan: Literal["pro", "studio"]
    interval: Literal["month", "year"] = "month"


class CheckoutOut(CamelModel):
    checkout_url: str


class SubscriptionOut(CamelModel):
    id: str
    user_id: str
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    plan: str
    interval: str
    status: str
    current_period_end: datetime | None = None
