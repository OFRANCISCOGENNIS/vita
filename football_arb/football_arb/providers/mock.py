"""mock — Provider padrão. Roda SEM credencial nenhuma.

Este é o modo default do CLI. Dados fixos e inofensivos que incluem, de
propósito, tanto um mercado com arbitragem quanto um sem, para demonstrar
que o detector separa os dois. As odds recebem timestamps relativos ao
"agora" para exercitar a lógica de staleness.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..models import Bookmaker, Event, Outcome
from .base import OddsProvider

_BET365 = Bookmaker("bet365", "Bet365")
_PINNACLE = Bookmaker("pinnacle", "Pinnacle")
_BETFAIR = Bookmaker("betfair", "Betfair")


class MockProvider(OddsProvider):
    """Fonte determinística em memória — nenhuma chamada de rede."""

    def fetch_events(self) -> list[Event]:
        now = datetime.now(timezone.utc)
        fresh = now  # odd recém-lida
        old = now - timedelta(seconds=120)  # odd "velha" -> vira flag stale

        return [
            # Evento 1X2 COM arbitragem (odds espalhadas por 3 casas).
            # arb_index = 1/3.10 + 1/3.90 + 1/3.20 ≈ 0.883 -> margem ~11.7%.
            # (Margem intencionalmente exagerada p/ demonstração; margens
            #  reais raramente passam de 1-2% e somem em segundos.)
            Event(
                event_id="EV1",
                home="Flamengo",
                away="Palmeiras",
                market="1X2",
                outcomes=[
                    Outcome("1", 3.10, _BET365, fresh),
                    Outcome("X", 3.90, _PINNACLE, fresh),
                    Outcome("2", 3.20, _BETFAIR, fresh),
                ],
            ),
            # Evento 1X2 SEM arbitragem (mercado normal, arb_index > 1).
            Event(
                event_id="EV2",
                home="Corinthians",
                away="São Paulo",
                market="1X2",
                outcomes=[
                    Outcome("1", 2.10, _BET365, fresh),
                    Outcome("X", 3.30, _BET365, fresh),
                    Outcome("2", 3.50, _BET365, fresh),
                ],
            ),
            # Evento 2-way COM arbitragem mas com uma odd VELHA -> stale flag.
            # arb_index = 1/2.05 + 1/2.10 ≈ 0.964 -> margem ~3.6%.
            Event(
                event_id="EV3",
                home="Grêmio",
                away="Internacional",
                market="2WAY",
                outcomes=[
                    Outcome("HOME", 2.05, _PINNACLE, fresh),
                    Outcome("AWAY", 2.10, _BETFAIR, old),
                ],
            ),
        ]
