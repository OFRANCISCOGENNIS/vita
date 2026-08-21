"""api — Provider HTTP genérico e PARAMETRIZÁVEL.

Deliberadamente NÃO acoplado a nenhuma API específica. Você fornece:
  - base_url + endpoint
  - como injetar a chave (header ou query param)
  - um `mapper`: callable que traduz o JSON cru daquela API para
    List[Event] normalizado

Assim a mesma classe serve The-Odds-API, Betfair, um feed interno, etc.,
sem reescrever o detector. Usa apenas a stdlib (urllib) — sem dependências.

IMPORTANTE (honestidade): este provider apenas LÊ odds. Ele não faz login,
não autentica em conta de apostas e não envia nenhuma aposta. A "chave" é
uma credencial de LEITURA de dados de odds, nada mais.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any, Callable, Optional

from ..models import Event
from .base import OddsProvider

# Um mapper recebe o objeto JSON já decodificado e devolve eventos
# normalizados. Fica por conta do integrador (varia 100% por API).
EventMapper = Callable[[Any], list[Event]]


class ApiProvider(OddsProvider):
    def __init__(
        self,
        base_url: str,
        endpoint: str,
        mapper: EventMapper,
        api_key: Optional[str] = None,
        key_in: str = "query",  # "query" | "header"
        key_name: str = "apiKey",
        query_params: Optional[dict[str, str]] = None,
        timeout: float = 10.0,
    ) -> None:
        if key_in not in ("query", "header"):
            raise ValueError("key_in deve ser 'query' ou 'header'.")
        self.base_url = base_url.rstrip("/")
        self.endpoint = endpoint.lstrip("/")
        self.mapper = mapper
        self.api_key = api_key
        self.key_in = key_in
        self.key_name = key_name
        self.query_params = dict(query_params or {})
        self.timeout = timeout

    def _build_request(self) -> urllib.request.Request:
        params = dict(self.query_params)
        headers: dict[str, str] = {"Accept": "application/json"}
        if self.api_key:
            if self.key_in == "query":
                params[self.key_name] = self.api_key
            else:
                headers[self.key_name] = self.api_key
        url = f"{self.base_url}/{self.endpoint}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        return urllib.request.Request(url, headers=headers, method="GET")

    def fetch_events(self) -> list[Event]:
        req = self._build_request()
        # nosec: URL vem de config do integrador, não de input não confiável.
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
            payload = json.loads(resp.read().decode("utf-8"))
        return self.mapper(payload)
