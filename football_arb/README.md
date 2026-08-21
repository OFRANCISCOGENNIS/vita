# football_arb — Detector de arbitragem para futebol

**Isto é uma ferramenta de ANÁLISE, não um bot de execução.** Ela detecta
oportunidades de arbitragem em odds decimais (mercados 1X2 e 2-way) e mostra
stakes, lucro e ROI. **Não faz login, não envia apostas, não movimenta
dinheiro. Zero automação de conta.**

## Por que NÃO executa apostas (as limitações reais)

1. **Delay de odds** — a odd lida já pode ter mudado quando você agiria;
   cada oportunidade carrega o timestamp e uma flag de *staleness*.
2. **Limitação / ban de conta** — casas restringem ou banem apostadores de
   arbitragem; a perna que você "garantiu" pode simplesmente não ser aceita.
3. **Slippage entre pernas** — você não coloca todas as apostas no mesmo
   instante; a odd de uma perna se move enquanto você fecha a outra.
4. **Suspensão de mercado** — o mercado pode ser suspenso entre uma perna e
   outra, deixando você exposto em vez de coberto.
5. Por tudo acima, **nenhuma oportunidade é "risk-free"** — o código recusa
   esse rótulo por design e anexa flags de risco não quantificável a cada uma.

## Site (interface web)

```bash
python -m football_arb.webapp                # http://127.0.0.1:8000
python -m football_arb.webapp --port 9000 --host 0.0.0.0
```

Servidor **stdlib apenas, sem dependências**. O backend reutiliza exatamente
o mesmo núcleo testado (`math_core` via `ArbitrageDetector`) — a matemática
**não** é reimplementada no navegador; o front só coleta odds e desenha o
resultado que o Python calcula. Digite as odds de um mercado (1X2 ou 2-way),
banca e margem mínima, ou clique em *Carregar exemplo (mock)*.

## Uso (CLI, modo mock, sem credencial)

```bash
python -m football_arb                       # tabela, dados mock
python -m football_arb --format json         # saída JSON
python -m football_arb --source csv --csv sample_odds.csv
python -m football_arb --bankroll 5000 --min-margin 0.02
```

O **modo mock é o default** e roda sem nenhuma chave. Há também `CsvProvider`
(arquivo local) e `ApiProvider` (HTTP genérico, parametrizável por chave e por
`mapper` — não acoplado a nenhuma API específica; a chave é só de *leitura* de
odds).

## Arquitetura

- `providers/` — `OddsProvider` (abstrato) → `MockProvider`, `CsvProvider`,
  `ApiProvider`. Todos produzem `Event`s normalizados.
- `math_core.py` — o núcleo (prob implícita, arb_index, stakes, lucro/ROI).
  Única parte 100% coberta por testes.
- `detector.py` — `ArbitrageDetector`: eventos → `ArbOpportunity`s.
- `stake.py` — `StakeCalculator`: distribuição de stakes.
- `models.py` — `Event`, `Outcome`, `Bookmaker`, `ArbOpportunity`, `StakeLeg`.
- `output.py` — saída `table` | `json`.

## Matemática (o que precisa ser confiável)

- prob implícita de um resultado = `1 / odd`
- `arb_index` = soma das probs implícitas de todos os resultados exclusivos
- `arb_index < 1.0` → oportunidade teórica; margem = `1 - arb_index`
- stake por perna = `bankroll * (1/odd) / arb_index` → payout igual em qualquer
  resultado; `sum(stakes) == bankroll`
- lucro = `bankroll/arb_index - bankroll`; ROI = `1/arb_index - 1`
- margem mínima configurável (default **1%**) para descontar arredondamento e
  movimento de odd — margens menores são ruído, não lucro.

## Testes

```bash
pip install -e ".[test]"
pytest
```

Os testes cobrem **apenas a matemática de arbitragem** — é o que precisa ser
confiável. Providers/CLI/formatação não são testados de propósito.
