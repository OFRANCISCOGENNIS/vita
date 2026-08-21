"""
detector — ArbitrageDetector: eventos normalizados → oportunidades.

Estratégia por evento:
  1. Valida os resultados esperados para o tipo de mercado (1X2 => 3
     resultados; 2WAY => 2). Sem os resultados completos, NÃO detecta —
     um mercado incompleto produz arb_index baixo artificial (falso +).
  2. Para cada resultado, escolhe a MELHOR odd entre as casas ("best
     odds arb": pega o topo de cada perna, possivelmente casas distintas).
  3. Roda o núcleo. Se margem >= min_margin, monta a oportunidade.
  4. Anexa flags de risco (staleness, casas múltiplas, etc.).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

from . import math_core
from .models import ArbOpportunity, Event, Outcome
from .stake import StakeCalculator

# Resultados obrigatórios por mercado. A ordem é só de apresentação.
MARKET_OUTCOMES: dict[str, tuple[str, ...]] = {
    "1X2": ("1", "X", "2"),
    "2WAY": ("HOME", "AWAY"),
}


class ArbitrageDetector:
    def __init__(
        self,
        bankroll: float = 1000.0,
        min_margin: float = 0.01,
        stale_after_seconds: float = 60.0,
    ) -> None:
        """
        `min_margin` (default 1%): colchão contra movimento de odd,
        arredondamento e spread. Ver math_core.is_arbitrage.

        `stale_after_seconds` (default 60s): acima disso a odd é marcada
        como possivelmente obsoleta. É heurístico — mercados líquidos
        movem em segundos; 60s é conservador para dados de demonstração.
        """
        if min_margin < 0:
            raise ValueError("min_margin não pode ser negativo.")
        self.bankroll = bankroll
        self.min_margin = min_margin
        self.stale_after_seconds = stale_after_seconds

    def _best_outcomes(self, event: Event) -> Optional[list[Outcome]]:
        """Melhor (maior) odd por resultado exigido pelo mercado.

        Retorna None se algum resultado exigido não tiver nenhuma odd —
        mercado incompleto não é analisável (evita falso positivo).
        """
        required = MARKET_OUTCOMES.get(event.market)
        if required is None:
            return None
        best: dict[str, Outcome] = {}
        for oc in event.outcomes:
            label = oc.label
            if label not in required:
                continue
            if label not in best or oc.odd > best[label].odd:
                best[label] = oc
        if any(label not in best for label in required):
            return None
        return [best[label] for label in required]

    def _risk_flags(
        self, best: list[Outcome], now: datetime
    ) -> list[str]:
        flags: list[str] = []

        # Staleness: qualquer perna velha => risco de a odd já ter mudado.
        for oc in best:
            age = (now - oc.timestamp).total_seconds()
            if age > self.stale_after_seconds:
                flags.append(
                    f"ODD_STALE:{oc.label}={age:.0f}s"
                    f">{self.stale_after_seconds:.0f}s"
                )

        # Multi-casa: pernas em casas diferentes => você precisa ter conta,
        # saldo e velocidade em TODAS simultaneamente. Slippage entre elas
        # é risco real e não quantificável aqui.
        distinct_books = {oc.bookmaker.key for oc in best}
        if len(distinct_books) > 1:
            flags.append(f"MULTI_BOOK:{len(distinct_books)}_casas")

        # Lembrete permanente: suspensão de mercado e limite/ban de conta
        # podem invalidar qualquer perna a qualquer momento. Nunca é
        # quantificável a partir das odds — por isso é sempre anexado.
        flags.append("MARKET_SUSPENSION_RISK")
        flags.append("ACCOUNT_LIMIT_RISK")
        return flags

    def detect_event(self, event: Event) -> Optional[ArbOpportunity]:
        best = self._best_outcomes(event)
        if best is None:
            return None
        odds = [oc.odd for oc in best]
        if not math_core.is_arbitrage(odds, self.min_margin):
            return None

        now = datetime.now(timezone.utc)
        calc = StakeCalculator(self.bankroll)
        legs = calc.build_legs(best)
        profit, roi = calc.profit_and_roi(best)

        return ArbOpportunity(
            event=event,
            market=event.market,
            arb_index=math_core.arb_index(odds),
            margin=math_core.margin(odds),
            bankroll=self.bankroll,
            profit=profit,
            roi=roi,
            legs=legs,
            detected_at=now,
            risk_flags=self._risk_flags(best, now),
        )

    def detect(self, events: Iterable[Event]) -> list[ArbOpportunity]:
        """Detecta em vários eventos; ordena por ROI decrescente."""
        opps = [
            opp
            for opp in (self.detect_event(e) for e in events)
            if opp is not None
        ]
        opps.sort(key=lambda o: o.roi, reverse=True)
        return opps
