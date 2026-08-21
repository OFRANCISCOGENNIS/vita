"""
models — Modelos de domínio via dataclasses.

Fluxo: providers produzem `Event`s (cada um com vários `Outcome`s, cada
outcome com odd de um `Bookmaker`). O detector consome eventos e produz
`ArbOpportunity`s, cada uma com suas `StakeLeg`s.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class Bookmaker:
    """Uma casa de aposta."""

    key: str  # identificador estável, ex.: "bet365"
    name: str = ""

    def __post_init__(self) -> None:
        if not self.name:
            object.__setattr__(self, "name", self.key)


@dataclass
class Outcome:
    """Uma odd de UM resultado, em UMA casa, para UM evento.

    `label` é o resultado dentro do mercado: "1"/"X"/"2" no mercado 1X2,
    ou "HOME"/"AWAY" (etc.) no 2-way. `odd` é decimal (payout por unidade).

    `timestamp` é quando a odd foi lida na fonte — carregado até a
    oportunidade final para que o consumidor julgue staleness (odd velha).
    """

    label: str
    odd: float
    bookmaker: Bookmaker
    timestamp: datetime = field(default_factory=_utcnow)


@dataclass
class Event:
    """Um jogo com um conjunto de odds coletadas.

    `market` distingue "1X2" (3-way) de "2WAY". `outcomes` pode conter
    várias odds para o mesmo `label` (casas diferentes) — o detector
    escolhe a melhor por resultado.
    """

    event_id: str
    home: str
    away: str
    market: str  # "1X2" | "2WAY"
    outcomes: list[Outcome] = field(default_factory=list)
    kickoff: Optional[datetime] = None

    @property
    def name(self) -> str:
        return f"{self.home} x {self.away}"


@dataclass(frozen=True)
class StakeLeg:
    """Uma perna do plano de apostas: aposte `stake` em `label` na `bookmaker`
    à `odd`, esperando `payout` se esse resultado sair."""

    label: str
    bookmaker: Bookmaker
    odd: float
    stake: float
    payout: float
    odd_timestamp: datetime


@dataclass
class ArbOpportunity:
    """Uma oportunidade de arbitragem detectada.

    NUNCA rotulada como "risk-free". Carrega `risk_flags` e a idade da odd
    mais velha para que quem lê saiba exatamente o que não está quantificado.
    """

    event: Event
    market: str
    arb_index: float
    margin: float          # 1 - arb_index
    bankroll: float
    profit: float
    roi: float             # fração (0.03 == 3%)
    legs: list[StakeLeg]
    detected_at: datetime = field(default_factory=_utcnow)
    # Riscos NÃO quantificáveis. Presença de qualquer flag => não é "risk-free".
    risk_flags: list[str] = field(default_factory=list)

    @property
    def oldest_odd_timestamp(self) -> datetime:
        return min(leg.odd_timestamp for leg in self.legs)

    @property
    def odd_age_seconds(self) -> float:
        """Idade (s) da odd MAIS VELHA usada — a perna mais arriscada."""
        return (self.detected_at - self.oldest_odd_timestamp).total_seconds()

    @property
    def is_risk_free(self) -> bool:
        # Intencionalmente sempre False quando há QUALQUER flag de risco.
        # Arbitragem esportiva real nunca é risk-free (ver README). Mantemos
        # a property só para deixar explícito que a resposta honesta é "não".
        return False
