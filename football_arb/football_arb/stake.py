"""
stake — StakeCalculator: transforma odds vencedoras + bankroll em pernas.

Fina camada sobre `math_core`. Não reimplementa matemática: monta os
objetos `StakeLeg` a partir dos resultados puros do núcleo.
"""

from __future__ import annotations

from datetime import datetime
from typing import Sequence

from . import math_core
from .models import Outcome, StakeLeg


class StakeCalculator:
    """Calcula distribuição de stakes para payout equalizado."""

    def __init__(self, bankroll: float) -> None:
        if bankroll <= 0:
            raise ValueError("Bankroll deve ser > 0.")
        self.bankroll = bankroll

    def build_legs(self, best_outcomes: Sequence[Outcome]) -> list[StakeLeg]:
        """Uma perna por resultado, usando a melhor odd de cada.

        `best_outcomes` deve ter exatamente um Outcome por resultado do
        mercado (o de maior odd). O núcleo garante a matemática; aqui só
        empacotamos. payout é igual em todas as pernas por construção.
        """
        odds = [o.odd for o in best_outcomes]
        stakes = math_core.stakes_for_equal_payout(odds, self.bankroll)
        legs: list[StakeLeg] = []
        for outcome, stake in zip(best_outcomes, stakes):
            legs.append(
                StakeLeg(
                    label=outcome.label,
                    bookmaker=outcome.bookmaker,
                    odd=outcome.odd,
                    stake=stake,
                    payout=stake * outcome.odd,
                    odd_timestamp=outcome.timestamp,
                )
            )
        return legs

    def profit_and_roi(self, best_outcomes: Sequence[Outcome]) -> tuple[float, float]:
        odds = [o.odd for o in best_outcomes]
        return math_core.profit_and_roi(odds, self.bankroll)
