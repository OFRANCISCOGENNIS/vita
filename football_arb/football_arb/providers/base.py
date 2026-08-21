"""base — Contrato abstrato de fonte de odds.

Qualquer fonte (mock, CSV, API HTTP, banco...) implementa `fetch_events`
e devolve `Event`s NORMALIZADOS. O detector não sabe (nem deve saber) de
onde vieram as odds.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import Event


class OddsProvider(ABC):
    """Fonte de odds. Subclasses só precisam produzir eventos normalizados."""

    @abstractmethod
    def fetch_events(self) -> list[Event]:
        """Retorna eventos com seus outcomes. Deve normalizar labels para
        o vocabulário do mercado ("1"/"X"/"2" ou "HOME"/"AWAY")."""
        raise NotImplementedError
