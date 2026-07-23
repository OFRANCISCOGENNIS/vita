"""Índice de Retenção Estimado (0–100) + retention timeline builder.

Formula (documented):

    retention_index = 0.40*vph + 0.25*like_ratio + 0.20*comment_ratio + 0.15*growth

- vph           — views/hour on a log10 scale: 10k views/h ≈ 80 pts, capped at 100.
                  `min(100, 20 * log10(1 + views_per_hour))`
- like_ratio    — likes/views vs the short-form benchmark of ~5%:
                  `min(100, (likes/views) / 0.05 * 100)`
- comment_ratio — comments/views vs benchmark ~0.5%:
                  `min(100, (comments/views) / 0.005 * 100)`
- growth        — growth-curve factor: young videos still accelerating score
                  higher. Age half-life of 48h:
                  `100 * exp(-age_hours / 96)` floored at 20 (evergreen base).

The retention timeline (Raio-X) is a synthesized per-second curve calibrated
by hook strength: strong hooks decay slower in the first 5 seconds; a
mid-video "virada" bump and an end-of-video CTA cliff are modeled.
"""
from __future__ import annotations

import hashlib
import math
from datetime import datetime, timezone


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def compute_retention_index(
    views: int,
    views_per_hour: float,
    likes: int,
    comments: int,
    published_at: datetime | None,
    now: datetime | None = None,
) -> float:
    views = max(views, 1)
    vph_score = _clamp(20.0 * math.log10(1.0 + max(views_per_hour, 0.0)))
    like_score = _clamp((likes / views) / 0.05 * 100.0)
    comment_score = _clamp((comments / views) / 0.005 * 100.0)

    if published_at is not None:
        now = now or datetime.now(timezone.utc)
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        age_hours = max((now - published_at).total_seconds() / 3600.0, 0.0)
    else:
        age_hours = 168.0  # assume a week old when unknown
    growth_score = max(20.0, 100.0 * math.exp(-age_hours / 96.0))

    index = 0.40 * vph_score + 0.25 * like_score + 0.20 * comment_score + 0.15 * growth_score
    return round(_clamp(index), 1)


# pt-BR markers placed on notable timeline moments
_HOOK_MARKERS = ["gancho de pergunta", "gancho visual", "promessa forte", "corte seco no gancho"]
_MID_MARKERS = ["virada da narrativa", "zoom punch", "prova social", "revelação do segredo", "mudança de cenário"]
_END_MARKERS = ["CTA — comente abaixo", "CTA — siga o canal", "loop perfeito para o início"]


def build_retention_timeline(duration_seconds: int, hook_strength: float, seed: str) -> list[dict]:
    """One point per second: [{second, retentionPct, marker}] (SPEC shape).

    Deterministic per `seed` so mock data is stable across runs.
    """
    duration = max(int(duration_seconds), 5)
    h = int(hashlib.sha256(seed.encode()).hexdigest(), 16)
    hook_strength = _clamp(hook_strength) / 100.0

    # decay per second: strong hook -> slow early decay
    early_decay = 2.6 - 1.8 * hook_strength   # % lost per second in first 5s
    base_decay = 0.9 - 0.35 * hook_strength   # steady-state decay
    bump_at = max(5, int(duration * (0.45 + (h % 15) / 100.0)))  # narrative turn
    cliff_at = max(bump_at + 2, duration - max(3, duration // 10))  # CTA cliff

    timeline: list[dict] = []
    retention = 100.0
    for second in range(duration):
        marker: str | None = None
        if second == 0:
            marker = _HOOK_MARKERS[h % len(_HOOK_MARKERS)]
        elif second == bump_at:
            retention = min(retention + 2.5, 100.0)  # re-hook bump
            marker = _MID_MARKERS[(h // 7) % len(_MID_MARKERS)]
        elif second == cliff_at:
            marker = _END_MARKERS[(h // 13) % len(_END_MARKERS)]

        timeline.append({"second": second, "retentionPct": round(_clamp(retention), 1), "marker": marker})

        if second < 5:
            retention -= early_decay
        elif second >= cliff_at:
            retention -= 2.2  # end-of-video drop-off
        else:
            wobble = math.sin((second + h % 10) / 4.0) * 0.25
            retention -= base_decay + wobble
    return timeline
