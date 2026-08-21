"""
football_arb — Detector de arbitragem para jogos de futebol.

NÃO É UM BOT DE EXECUÇÃO. Este pacote apenas *detecta e analisa*
oportunidades de arbitragem a partir de odds decimais. Ele não faz
login em casas de aposta, não envia apostas e não movimenta dinheiro.
Veja o README para as razões pelas quais arbitragem "no papel" quase
nunca é executável sem risco.
"""

from .models import Event, Outcome, Bookmaker, ArbOpportunity, StakeLeg
from .math_core import (
    implied_probability,
    arb_index,
    margin,
    stakes_for_equal_payout,
    profit_and_roi,
)
from .detector import ArbitrageDetector
from .stake import StakeCalculator

__all__ = [
    "Event",
    "Outcome",
    "Bookmaker",
    "ArbOpportunity",
    "StakeLeg",
    "implied_probability",
    "arb_index",
    "margin",
    "stakes_for_equal_payout",
    "profit_and_roi",
    "ArbitrageDetector",
    "StakeCalculator",
]

__version__ = "0.1.0"
