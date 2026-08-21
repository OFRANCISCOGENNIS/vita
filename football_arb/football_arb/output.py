"""output — Renderização das oportunidades em `table` ou `json`.

Colunas da tabela: evento | casas por perna | odds | stakes | lucro |
ROI | idade_da_odd. Sem dependências externas (tabela ASCII manual).
"""

from __future__ import annotations

import json
from typing import Sequence

from .models import ArbOpportunity


def to_json(opps: Sequence[ArbOpportunity]) -> str:
    """Serialização JSON completa e auditável (inclui flags de risco)."""
    out = []
    for o in opps:
        out.append(
            {
                "event_id": o.event.event_id,
                "event": o.event.name,
                "market": o.market,
                "arb_index": round(o.arb_index, 6),
                "margin": round(o.margin, 6),
                "bankroll": round(o.bankroll, 2),
                "profit": round(o.profit, 2),
                "roi_pct": round(o.roi * 100, 3),
                "odd_age_seconds": round(o.odd_age_seconds, 1),
                "risk_free": o.is_risk_free,  # sempre false, por design
                "risk_flags": list(o.risk_flags),
                "legs": [
                    {
                        "label": leg.label,
                        "bookmaker": leg.bookmaker.name,
                        "odd": leg.odd,
                        "stake": round(leg.stake, 2),
                        "payout": round(leg.payout, 2),
                        "odd_timestamp": leg.odd_timestamp.isoformat(),
                    }
                    for leg in o.legs
                ],
            }
        )
    return json.dumps(out, ensure_ascii=False, indent=2)


def _join(values: Sequence[str]) -> str:
    return " / ".join(values)


def to_table(opps: Sequence[ArbOpportunity]) -> str:
    if not opps:
        return "Nenhuma oportunidade de arbitragem acima da margem mínima."

    headers = [
        "EVENTO",
        "CASAS (por perna)",
        "ODDS",
        "STAKES",
        "LUCRO",
        "ROI %",
        "IDADE ODD",
    ]
    rows: list[list[str]] = []
    for o in opps:
        rows.append(
            [
                f"{o.event.name} [{o.market}]",
                _join([leg.bookmaker.name for leg in o.legs]),
                _join([f"{leg.odd:.2f}" for leg in o.legs]),
                _join([f"{leg.stake:.2f}" for leg in o.legs]),
                f"{o.profit:.2f}",
                f"{o.roi * 100:.2f}",
                f"{o.odd_age_seconds:.0f}s",
            ]
        )

    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))

    def fmt(cells: Sequence[str]) -> str:
        return " | ".join(c.ljust(widths[i]) for i, c in enumerate(cells))

    sep = "-+-".join("-" * w for w in widths)
    lines = [fmt(headers), sep]
    lines += [fmt(row) for row in rows]

    # Bloco de risco por oportunidade — NUNCA "risk-free".
    lines.append("")
    lines.append("RISCOS (não quantificados — jamais tratar como risk-free):")
    for o in opps:
        lines.append(f"  • {o.event.name}: {', '.join(o.risk_flags)}")
    return "\n".join(lines)


def render(opps: Sequence[ArbOpportunity], fmt: str = "table") -> str:
    if fmt == "json":
        return to_json(opps)
    if fmt == "table":
        return to_table(opps)
    raise ValueError(f"Formato desconhecido: {fmt!r} (use 'table' ou 'json').")
