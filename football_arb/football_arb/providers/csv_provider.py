"""csv_provider — Lê odds de um CSV local. Sem rede, sem credencial.

Formato esperado (cabeçalho obrigatório):

    event_id,home,away,market,label,odd,bookmaker_key,bookmaker_name,timestamp

- `market`: "1X2" ou "2WAY"
- `label`: "1"/"X"/"2" ou "HOME"/"AWAY"
- `odd`: decimal (ponto ou vírgula aceitos)
- `timestamp`: ISO-8601 opcional; ausente => agora (UTC)

Cada linha é UMA odd. Linhas do mesmo `event_id` são agrupadas em um Event.
"""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..models import Bookmaker, Event, Outcome
from .base import OddsProvider


def _parse_odd(raw: str) -> float:
    # Aceita vírgula decimal (locale pt-BR) — premissa frágil de parsing,
    # documentada aqui para não virar bug silencioso.
    return float(raw.strip().replace(",", "."))


def _parse_ts(raw: str) -> datetime:
    raw = (raw or "").strip()
    if not raw:
        return datetime.now(timezone.utc)
    ts = datetime.fromisoformat(raw)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


class CsvProvider(OddsProvider):
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def fetch_events(self) -> list[Event]:
        events: dict[str, Event] = {}
        with self.path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                eid = row["event_id"].strip()
                ev = events.get(eid)
                if ev is None:
                    ev = Event(
                        event_id=eid,
                        home=row["home"].strip(),
                        away=row["away"].strip(),
                        market=row["market"].strip().upper(),
                    )
                    events[eid] = ev
                book_key = row["bookmaker_key"].strip()
                book_name = (row.get("bookmaker_name") or "").strip()
                ev.outcomes.append(
                    Outcome(
                        label=row["label"].strip().upper()
                        if ev.market == "2WAY"
                        else row["label"].strip(),
                        odd=_parse_odd(row["odd"]),
                        bookmaker=Bookmaker(book_key, book_name or book_key),
                        timestamp=_parse_ts(row.get("timestamp", "")),
                    )
                )
        return list(events.values())
