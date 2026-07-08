"""Plan limits per SPEC:

| Plano  | Minutos/mês | Resolução máx. | Marca d'água | Radar                       | Preço mensal |
| free   | 60          | 720p           | sim          | limitado (top 5, sem Raio-X)| R$ 0        |
| pro    | 600         | 4K             | não          | completo                    | R$ 79 (anual R$ 63/mês) |
| studio | ilimitado   | 4K             | não          | completo + alertas + API    | R$ 199 (anual R$ 159/mês) |
"""
from __future__ import annotations

from app.errors import upgrade_required
from app.models import User

RESOLUTION_HEIGHT = {"720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160}

PLAN_LIMITS: dict[str, dict] = {
    "free": {
        "minutes_per_month": 60,
        "max_resolution": "720p",
        "max_height": 720,
        "watermark": True,
        "radar_full": False,
        "radar_top_n": 5,
        "alerts": False,
        "api_access": False,
        "price_month_brl": 0,
        "price_year_month_brl": 0,
    },
    "pro": {
        "minutes_per_month": 600,
        "max_resolution": "2160p",
        "max_height": 2160,
        "watermark": False,
        "radar_full": True,
        "radar_top_n": None,
        "alerts": False,
        "api_access": False,
        "price_month_brl": 79,
        "price_year_month_brl": 63,
    },
    "studio": {
        "minutes_per_month": None,  # unlimited
        "max_resolution": "2160p",
        "max_height": 2160,
        "watermark": False,
        "radar_full": True,
        "radar_top_n": None,
        "alerts": True,
        "api_access": True,
        "price_month_brl": 199,
        "price_year_month_brl": 159,
    },
}


def limits_for(user: User) -> dict:
    return PLAN_LIMITS.get(user.plan, PLAN_LIMITS["free"])


def check_minutes_quota(user: User, extra_minutes: float = 0.0) -> None:
    """Raises upgrade_required when the monthly minutes quota would be exceeded."""
    limit = limits_for(user)["minutes_per_month"]
    if limit is None:
        return
    if user.minutes_used_month + extra_minutes > limit:
        raise upgrade_required(
            f"Você atingiu o limite de {limit} minutos/mês do plano "
            f"{user.plan.capitalize() if user.plan != 'free' else 'Grátis'}. "
            "Faça upgrade para continuar processando vídeos."
        )


def check_resolution(user: User, resolution: str) -> None:
    requested = RESOLUTION_HEIGHT.get(resolution, 1080)
    allowed = limits_for(user)["max_height"]
    if requested > allowed:
        raise upgrade_required(
            f"Exportação em {resolution} está disponível apenas nos planos Pro e Studio "
            f"(seu plano permite até {limits_for(user)['max_resolution']})."
        )
