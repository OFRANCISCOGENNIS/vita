"""cli — Ponto de entrada de linha de comando.

Default: modo MOCK, sem credencial nenhuma. Isto é intencional e faz parte
da postura de honestidade do projeto: você consegue ver o detector
funcionando sem tocar em nenhuma conta ou chave.

    python -m football_arb                      # mock, tabela
    python -m football_arb --format json        # mock, json
    python -m football_arb --source csv --csv sample_odds.csv
    python -m football_arb --bankroll 5000 --min-margin 0.02

O provider de API existe (ApiProvider) mas NÃO é exposto por flags de CLI
de propósito — configurar um mapper específico de API é código, não é algo
que se faça às cegas por linha de comando.
"""

from __future__ import annotations

import argparse
import sys

from .detector import ArbitrageDetector
from .output import render
from .providers import CsvProvider, MockProvider

_BANNER = (
    "football_arb — DETECTOR/ANALISADOR de arbitragem. "
    "NÃO executa apostas. NÃO faz login. Apenas análise."
)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="football_arb", description=_BANNER)
    p.add_argument(
        "--source",
        choices=["mock", "csv"],
        default="mock",
        help="Fonte de odds (default: mock, sem credencial).",
    )
    p.add_argument("--csv", help="Caminho do CSV quando --source csv.")
    p.add_argument(
        "--format",
        choices=["table", "json"],
        default="table",
        help="Formato de saída (default: table).",
    )
    p.add_argument(
        "--bankroll", type=float, default=1000.0, help="Banca (default: 1000)."
    )
    p.add_argument(
        "--min-margin",
        type=float,
        default=0.01,
        help="Margem mínima p/ considerar oportunidade (default: 0.01 = 1%%).",
    )
    p.add_argument(
        "--stale-after",
        type=float,
        default=60.0,
        help="Segundos p/ marcar odd como possivelmente obsoleta (default 60).",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.source == "csv":
        if not args.csv:
            print("Erro: --source csv exige --csv <arquivo>.", file=sys.stderr)
            return 2
        provider = CsvProvider(args.csv)
    else:
        provider = MockProvider()

    detector = ArbitrageDetector(
        bankroll=args.bankroll,
        min_margin=args.min_margin,
        stale_after_seconds=args.stale_after,
    )
    events = provider.fetch_events()
    opps = detector.detect(events)

    print(render(opps, args.format))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
