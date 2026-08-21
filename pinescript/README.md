# ◈ QUANT OPS — Institutional Trading Intelligence

Simulador visual e motor de decisão para Forex, Cripto, Ouro e Índices, com
**velas estilo TradingView** (Lightweight Charts vendorizado), um conjunto de
**engines de análise** inspirados em mesas quantitativas (Price Action,
Liquidez, Smart Money, Regime de Mercado, IA de otimização) e um **painel de
decisão único** que aprova ou bloqueia a operação. Roda 100% no navegador,
sem backend — os dados vêm de APIs públicas (Binance, Twelve Data, Yahoo) ou
de um gerador simulado offline.

> **Aviso**: ferramenta de estudo e simulação. Não é recomendação financeira,
> não envia ordens a nenhuma corretora. Todo "score", "probabilidade" e
> "Kelly" é calculado sobre o histórico carregado no navegador — não é
> garantia de resultado futuro. Leia a seção [⚠️ Avisos e limites](#️-avisos-e-limites)
> antes de usar para decisões reais.

## ⚡ Como abrir

**Arquivo único (recomendado):** dê duplo-clique em `Simulador_Standalone.html`
— HTML, CSS, JS e a lib de gráficos estão embutidos, funciona offline exceto
pelas chamadas de rede a APIs externas (Binance/Twelve Data/Yahoo/notícias).
Depois de editar os fontes (`app.js`/`index.html`/`styles.css`), regenere com:

```bash
node build_standalone.js
```

**Modo pasta (para desenvolver):** sirva o diretório com qualquer servidor
estático — abrir o `index.html` direto do disco (`file://`) quebra por CORS.

```bash
cd pinescript/
python3 -m http.server 8000        # ou: npx http-server -p 8000
```

Acesse `http://localhost:8000`.

---

## 🧭 Visão geral da interface (QUANT OPS)

A tela é organizada como uma central de decisão, não como um gráfico solto:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ◈ QUANT OPS  │ Mercado │ Confiança │ Regime │ Volat. │ Sessão │ ... │  ← barra executiva
├───────────┬───────────────────────────────────────────────────────┤
│           │  Widget TradingView (referência visual)                │
│  SIDEBAR  │  Gráfico de velas + EMAs + marcadores de entrada        │
│  (todos   │  RSI · ATR · Fluxo de volume                           │
│  os       │  DECISÃO AGORA — veredito + selo A/B/C                 │
│  controles│ ┌─────────────┬───────────┬─────────────┬────────────┐│
│  ficam    │ │ PRICE ACTION│ LIQUIDEZ  │ SMART MONEY │ VOLUME/DELTA││
│  aqui)    │ ├─────────────┴───────────┴─────────────┴────────────┤│
│           │ │            ANÁLISE DA OPERAÇÃO (aprovado/bloqueado) ││
│           │ └──────────────────────────────────────────────────┘│
│           │  Heatmap de ativos · Melhores entradas (scanner)      │
│           │  IA: otimizar parâmetros · Estudos de Mercado         │
│           │  Registro de entradas (timeline) · Métricas/Backtest  │
└───────────┴───────────────────────────────────────────────────────┘
```

### Barra executiva (topo)

| Campo | O que mostra |
|---|---|
| **Mercado Atual** | `BULLISH` / `BEARISH` / `NEUTRO` conforme o placar de confluência da última vela |
| **Confiança** | anel de progresso com `score dominante / fatores habilitados`, em % |
| **Regime** | 📈 Tendencial · 🔥 Volátil · ↔ Lateral (ver [Market Regime Engine](#-market-regime-engine)) |
| **Volatilidade** | Alta / Média / Baixa (ATR atual vs. média do ATR) |
| **Sessão** | Ásia / Londres / Nova York / Londres+NY, pelo horário UTC da vela |
| **Operações Aprovadas / Bloqueadas** | quantas entradas do histórico caem fora/dentro da janela de risco de notícia |
| **Expectativa Matemática** | expectativa por operação em unidades de risco (R), do backtest atual |

---

## 🧩 Painel de Decisão

Responde, na vela atual: **ENTRAR CALL ▲ / ENTRAR PUT ▼ / AGUARDAR**, com o
porquê:

- **Chips por fator** — para onde cada filtro aponta agora (▲ alta, ▼ baixa,
  ✓ ok, — neutro, `off` desligado).
- **Selo de qualidade A/B/C** (ver seção própria) com score 0–100, estrelas,
  probabilidade estimada e risco sugerido (½ Kelly).
- **Assertividade medida** — compara o histórico do score atual neste
  gráfico com o *break-even* do payout (`1/(1+payout)`): se o score em vigor
  perde do break-even, o painel avisa.
- **Notícia tem prioridade** — com o filtro de notícias ativo, o veredito
  vira **AGUARDAR ⚠** dentro da janela de risco, independentemente da
  confluência.
- **Registro automático** — toda virada de veredito para CALL/PUT entra
  sozinha no [Registro de Entradas](#️-registro-de-entradas-timeline) com a
  etiqueta **"IA ao vivo"** e o selo do momento.
- **Som de alerta** — toca ao entrar em CALL/PUT (não repete enquanto o
  veredito se mantém). Web Audio puro, sem arquivos; navegadores exigem um
  clique na página antes do primeiro som (use **🔊 Testar som**).

---

## 🎯 Confluência — fatores, modos e pontuação

Cada fator pode ser ligado/desligado individualmente. Legenda:

| Sigla | Fator | Descrição |
|---|---|---|
| `T` | Tendência | EMA rápida × EMA lenta |
| `Ma` | Macro | preço vs. EMA 200 |
| `Mo` | Momentum | cruzamento do RSI (sobrevenda/sobrecompra), dentro de uma janela de N velas |
| `V` | Volatilidade | ATR atual > média do ATR |
| `E` | Estrutura | rompimento da máxima/mínima das últimas *lookback* velas (exclui a própria vela) |
| `F` | Fluxo | delta comprado × vendido (taker buy volume) na janela, só Binance |
| `C` | Correlação | voto majoritário de pares de referência no mesmo fluxo |
| `P` | Padrão de vela | engolfo / marubozu / martelo / estrela cadente (ver [Candle Analyzer](#-candle-analyzer)) |

**Modos** (grupo Confluência):

- **Pontuação (mín. X de Y)** — dispara quando pelo menos **X** fatores
  ativos concordam na direção, e vence a direção com mais fatores. Padrão.
- **Estrita (todos os filtros)** — só dispara com **todos** os fatores
  ativos alinhados.

**Filtros adicionais** (mesmo grupo, todos opcionais):

- **Filtro de notícias** — evita operar perto de manchetes do ativo.
- **Filtro Multi-Timeframe (HTF)** — só permite CALL/PUT a favor da
  tendência do timeframe maior (M5→M15, M15/M30→H1). Mostra a tendência
  atual do TF maior abaixo do checkbox.
- **Padrão de vela** — exige confirmação de preço (engolfo/martelo/etc.) na
  vela do sinal.
- **Só sessões fortes** — bloqueia entradas na sessão asiática (tende a
  lateralizar mais em Forex).
- **Vetar entradas coladas em Suporte/Resistência** — veta CALL colado numa
  resistência e PUT colado num suporte, com distância mínima configurável em
  múltiplos de ATR.
- **Pontuação dinâmica** — troca a pontuação "1 ponto por fator" por pesos
  vindos do [Market Regime Engine](#-market-regime-engine) e do aprendizado
  contínuo por par.
- **Selo de qualidade A/B/C** — liga/desliga o selo no Painel de Decisão.

---

## 🤖 IA — Otimização de parâmetros

Botão **🤖 IA: otimizar parâmetros**. Faz uma busca em grade sobre o
histórico carregado:

- **Multi-timeframe**: testa M1/M5/M15/M30/H1 (com dados reais) e recomenda
  qual timeframe tem melhor desempenho para o par atual.
- **Multi-expiração**: para cada timeframe, testa também várias expirações
  compatíveis (múltiplos do timeframe, até 12×) — corrige o problema de
  apostar sempre "1 vela à frente", horizonte em que sinais de continuação
  (rompimento de estrutura, por exemplo) tendem a reverter.
- **Validação walk-forward**: cada combinação é treinada nos primeiros 70%
  das velas e validada nos 30% finais; só entra no ranking quem passa nas
  duas janelas, ordenado pela **pior das duas taxas** (penaliza overfit).
- **Ranking por edge líquido**: em vez do acerto bruto, ranqueia por
  `taxa de validação − break-even do payout`. Um "acerto" de 52% a payout
  87% aparece como **negativo**, porque é.
- **Cache por par**: o melhor combo (timeframe, expiração, score mínimo,
  zona de RSI, lookback de estrutura, cooldown) fica salvo no navegador por
  símbolo e é reaproveitado pelo [Scanner](#-scanner--melhores-entradas) e
  pelo Score Institucional.

Clicar numa linha do resultado aplica os parâmetros (e troca de timeframe se
necessário).

---

## 🧠 Market Regime Engine

Classifica **cada vela** em um de três regimes, a partir da separação das
EMAs, distância até a EMA 200 e expansão do ATR:

| Regime | Critério | Efeito na pontuação dinâmica |
|---|---|---|
| 📈 **Tendencial** | EMAs separadas e preço distante da EMA200, ambos acima de frações do ATR | Tendência/Macro/Estrutura pesam mais |
| 🔥 **Volátil** | ATR atual ≥ 1,3× a média | ATR/Fluxo pesam mais |
| ↔ **Lateral** | nenhum dos critérios acima | RSI/Padrão de vela/Fluxo pesam mais (fatores de reversão) |

Com **Pontuação dinâmica** ligada, o peso de cada fator na pontuação final é
`peso do regime × acerto histórico do fator naquele par` (ver
[Adaptive Learning](#-adaptive-learning--pesos-por-fator)) — a confluência
deixa de tratar todo fator como "1 ponto" fixo e passa a refletir o que
funciona no contexto atual.

---

## 🕯️ Candle Analyzer

Analisa a vela do sinal e classifica anatomia e padrão:

- **Métricas**: corpo %, pavio superior %, pavio inferior %, range.
- **Padrões**: engolfo de alta/baixa, marubozu, martelo, estrela cadente —
  cada um com **nível de convicção** (alta = engolfo/marubozu, média =
  martelo/estrela).
- **Inside bar** (compressão): a vela fica contida na anterior — não conta
  como confirmação de nenhum lado (indecisão).

O fator `P` (Padrão de vela) só marca "ok" se a vela do sinal confirma a
direção; o painel **VOLUME/DELTA** mostra o padrão e a convicção da última
vela em tempo real.

---

## 💧 Liquidity Engine

Aproximação de **pools de liquidez** via OHLC (sem acesso a livro de ofertas
real):

- **Pools de liquidez** — agrupa pivôs de máxima/mínima quase iguais
  (dentro de uma tolerância em ATR) em clusters: é onde os stops tendem a se
  acumular (*equal highs/equal lows*). O painel mostra quantos pools existem
  acima e abaixo do preço, e o nível mais próximo de cada lado.
- **Sweep de liquidez** — detecta quando um pavio varre um pool (rompe o
  nível) e a vela fecha de volta para dentro, nas últimas 12 velas.
- **Mitigação** — depois de um sweep, marca **Pendente** até o preço reagir
  de forma consistente (≥0,5 ATR) na direção contrária ao sweep, e
  **Concluída** quando isso acontece.

---

## 🏦 Smart Money Engine

Também aproximado via OHLC puro:

- **Order Blocks** — última vela contrária antes de um impulso ≥1,2 ATR nas
  três velas seguintes; considerado ativo enquanto o preço não retornar à
  zona da vela.
- **Fair Value Gaps (FVG)** — vãos de 3 velas (a vela `i` não sobrepõe a
  vela `i-2`) ainda não preenchidos.
- **Direção Institucional** — voto entre Order Blocks ativos, FVGs abertos
  e o sweep de liquidez mais recente.

---

## 💧+🏦 Painéis de inteligência (fileira central)

Ao redor do Painel de Decisão, quatro cartões independentes, recalculados a
cada atualização de dados:

1. **PRICE ACTION** — estrutura Altista/Baixista/Indefinida a partir dos
   últimos swings (`HH · HL · LH · LL` extraídos dos pivôs confirmados), BOS
   recente, força da tendência (%), correção (%) desde o último extremo e
   flag de **pullback saudável** (retração entre 20% e 62%).
2. **LIQUIDEZ** — ver [Liquidity Engine](#-liquidity-engine).
3. **SMART MONEY** — ver [Smart Money Engine](#-smart-money-engine).
4. **VOLUME/DELTA** — nível de volume vs. média das últimas 20 velas, delta
   comprador/vendedor, força compradora %, padrão de vela + convicção.

Um quinto cartão, **ANÁLISE DA OPERAÇÃO**, mostra a leitura consolidada do
sinal ativo (ou o placar corrente se não houver sinal): direção, Score
Institucional, probabilidade estimada, *expectancy* em R, risco sugerido
(½ Kelly) e expiração — com um banner **✓ OPERAÇÃO APROVADA** / **✕
OPERAÇÃO BLOQUEADA** conforme o selo e a expectativa matemática.

---

## 🏅 Score Institucional (selo A/B/C)

Agrega, em 0–100 pontos:

| Componente | Peso |
|---|---|
| Confluência (score/fatores habilitados) | 40 |
| Assertividade histórica do score atual (ou walk-forward do par) vs. break-even | 20 |
| Alinhamento com o timeframe maior (HTF) | 10 |
| Distância de Suporte/Resistência | 10 |
| Força da sessão | 10 |
| Histórico walk-forward do par (cache da IA) | 10 |

O score vira **⭐ estrelas** (score/20, arredondado) e um selo:

- **A · ENTRAR** — score forte (≥70% dos fatores) + todos os filtros de
  qualidade a favor.
- **B · OBSERVAR** — confluência razoável (≥50%) mas com alguma ressalva.
- **C · EVITAR** — score baixo ou múltiplas ressalvas.

Também calcula **probabilidade estimada** (histórico do score neste
gráfico, ou o walk-forward do par) e **risco sugerido** por Kelly
fracionário (½ Kelly, teto de 5% por operação):

```
f* = (p·(1+b) − 1) / b        b = payout, p = probabilidade estimada
risco sugerido = f*/2, limitado a [0%, 5%]
```

---

## 🔎 Scanner — melhores entradas

Botão **🔎 Escanear melhores entradas**. Varre uma lista de símbolos (top 15
cripto na Binance, ou todos os 14 pares Forex/Índices/Ouro) **sem alterar o
gráfico atual**: troca o array de dados internamente, recalcula sinais, e
restaura o estado ao final.

- **Usa os parâmetros já otimizados pela IA para cada par** (cache por
  símbolo); se não houver cache, usa os parâmetros globais atuais. Pares
  com parâmetros afinados aparecem com **✦** dourado.
- Resultado ranqueado por score, com clique para carregar o par.
- Alimenta o **Registro de Entradas** e o **Heatmap de Ativos**.
- Som de alerta no melhor resultado (se ativado).

## 🗺️ Heatmap de Ativos

Alimentado pelo scanner: uma linha por símbolo testado, barra 0–100
colorida (verde/âmbar/vermelho) e seta de direção. Clique numa linha para
carregar aquele par.

## 📚 Estudos de Mercado

Botão **📚 Estudar o mercado**. Sobre as entradas backtestadas do par
carregado:

- **Regime atual** — chips com a leitura de tendência/volatilidade do
  momento (mesmo motor do Market Regime Engine).
- **Acerto por horário** — barras de win rate por hora do dia.
- **Acerto por fator de confluência** — win rate de cada fator presente nas
  entradas (também alimenta os pesos da pontuação dinâmica).
- **Acerto por sessão de mercado** — Ásia / Londres / Nova York / Londres+NY.
- **Dica automática** — melhor horário, fator mais/menos confiável e melhor
  sessão, resumidos em uma frase.

## 🧠 Adaptive Learning — pesos por fator

Quando **Pontuação dinâmica** está ativa, a cada recálculo de entradas o app
atualiza `pesoFatores[símbolo]` com o win rate observado de cada fator
(mínimo 5 amostras) e usa isso, multiplicado pelo peso do regime, como peso
do fator no score. Fatores que "erram muito" naquele par perdem peso
sozinhos; fatores fortes ganham peso — sem esperar você mexer em nada.

## 🗓️ Registro de entradas (timeline)

Painel com gráfico de linha + marcadores: cada entrada do scanner ou virada
ao vivo do Painel de Decisão vira uma seta ▲/▼ na timeline, com o horário
local, o par e o selo A/B/C (quando aplicável). Notícias recentes entram
como marcadores ⚡ amarelos. Persistido no navegador (`localStorage`);
botão **Limpar** reseta.

## 🎓 Treino de Leitura (replay)

Botão **Treinar leitura (replay)**: congela o gráfico num ponto aleatório do
histórico (escondendo o futuro) e testa sua leitura vela a vela — você
decide ▲ CALL / ▼ PUT / ⏭ Pular, o app revela o resultado e mantém o placar
você-vs-indicador, com leitura assistida (padrões de vela + contexto
EMA200/RSI/ATR) a cada rodada.

## 📈 Métricas de Análise (backtest)

Painel dedicado, com **Payout por WIN (%)** configurável (típico de opções
binárias, 70–90%):

- **Win rate geral** vs. **win rate de empate** (`1/(1+payout)`).
- **Janelas recentes** — WR dos últimos 20/50/100 trades, priorizando o
  desempenho atual sobre o histórico completo.
- **P&L acumulado**, **expectativa por operação**, **profit factor**.
- **Win rate por direção** (CALL/PUT) e **maiores sequências** de WIN/LOSS.
- **Curva de capital** e **win rate por score de confluência**.
- **Exportação CSV** com o resumo de métricas + a tabela completa de
  entradas (separador `;`, BOM UTF-8, pronto para Excel/Sheets).

---

## 📡 Fontes de dados

| Fonte | Cobertura | Tempo real | Observações |
|---|---|---|---|
| **Binance** | Cripto (qualquer par negociado) | WebSocket tick-a-tick | REST `data-api.binance.vision` (sem key), WS `data-stream.binance.vision` |
| **Twelve Data** | Forex, Ouro, Índices (14 pares) | Polling 15s | Chave grátis em twelvedata.com; `demo` só funciona em EUR/USD |
| **Yahoo Finance** | Forex, Ouro, Índices (mesmos 14) | Polling 15s | Keyless, via proxy CORS público (instável); fallback automático da Twelve Data |
| **Simulado** | qualquer | — | Passeio aleatório local, para testar a interface sem rede/edge real |

Fluxo automático ao escolher **Twelve Data**: se falhar, tenta Yahoo; se
Yahoo falhar, cai em simulado (deixando claro no status).

### Crypto IDX (proxy do índice da Binomo)

O **Crypto IDX** da Binomo é um índice sintético **proprietário**, sem feed
público — não é possível reproduzi-lo tick a tick. O botão
**📊 Crypto IDX (proxy Binomo)** monta uma aproximação: uma cesta de 5
criptos reais da Binance (BTC/ETH/SOL/BNB/XRP), cada uma normalizada em base
100 e mediada numa série de candles própria, atualizada **tick a tick** via
WebSocket combinado (`/stream?streams=...`). Comportamento parecido com um
índice cripto — **não é** um espelho exato dos valores da Binomo. Use para
leitura/estudo, não como referência de preço de execução.

### Pares Forex/Índices/Ouro suportados

`EUR/USD` `USD/JPY` `GBP/USD` `AUD/USD` `USD/CAD` `USD/CHF` `EUR/JPY`
`GBP/JPY` `EUR/GBP` `NZD/USD` `XAU/USD (Ouro)` `NAS100 (Nasdaq)`
`US30 (Dow Jones)` `GER40 (DAX)`

O widget oficial do **TradingView** sincroniza automaticamente com o
símbolo/timeframe escolhido (ex.: `FX:EURUSD`, `TVC:GOLD`,
`CRYPTOCAP:TOTAL` para o Crypto IDX) — é só referência visual, o TradingView
não expõe API pública de dados para o app consumir.

## 🔄 Fluxo de Volume (compra × venda)

Só disponível com fonte Binance (dado de *taker buy volume* real):

- **Fator Fluxo (`F`)**: delta acumulado (compra agressora − venda) na
  janela configurável; desequilíbrio <5% do volume conta como neutro.
- **Fator Correlação (`C`)**: voto majoritário de até 4 pares de referência
  no mesmo fluxo — a lógica de "BTC lidera o mercado".

Painel próprio com histograma do delta por vela e barras de pressão por
par. Desligado/desabilitado automaticamente em Forex/Yahoo/Twelve Data (sem
volume agressor real).

## 📰 Notícias em tempo real

Agrega RSS (Cointelegraph, CoinDesk) via proxy CORS, atualiza a cada 60s.
Alimenta o **Filtro de notícias** (bloqueia entradas perto de manchetes do
ativo) e os marcadores ⚡ no Registro de Entradas. Requer internet; sem
conexão, mostra aviso e o resto do app segue funcionando.

---

## 🔧 Arquivos

```
pinescript/
├── index.html                                    # marcação da interface QUANT OPS
├── styles.css                                     # tema navy institucional (tokens em :root)
├── app.js                                         # todos os engines + orquestração (~2800 linhas)
├── build_standalone.js                            # gera o Simulador_Standalone.html
├── Simulador_Standalone.html                       # build único, pronto para abrir (gerado)
├── lightweight-charts.standalone.production.js     # lib de gráficos vendorizada
├── server.py                                       # servidor estático mínimo (dev)
├── Confluencia_Multi_Fator_Forex_Cripto.pine        # indicador Pine Script v5 original
└── README.md                                       # este arquivo
```

Parâmetros de URL úteis para desenvolvimento/testes: `?rest=`, `?ws=`
(mirrors da Binance), `?tdbase=` (Twelve Data), `?yproxy=` (proxy Yahoo),
`?news=` (proxy de notícias).

---

## ⚠️ Avisos e limites

- **Ferramenta de estudo.** Não conecta a corretora nenhuma, não envia
  ordens. Use para treinar leitura, testar hipóteses e estudar confluência.
- **Score, probabilidade e Kelly são estatísticas do histórico carregado no
  navegador** — mudam com o número de velas, o par e os parâmetros, e não
  garantem desempenho futuro. Amostras pequenas (poucas dezenas de
  operações) têm alta variância; desconfie de qualquer "100% de acerto" com
  poucas operações.
- **Liquidez e Smart Money são aproximações via OHLC.** Sem acesso a livro
  de ofertas real, não há como saber o tamanho real dos stops, o volume
  institucional real ou a intenção de "smart money" — os painéis detectam
  *padrões geométricos* consistentes com esses conceitos, não os eventos
  reais.
- **Crypto IDX é um proxy**, não os valores reais da Binomo (ver seção
  própria).
- **Payout de opções binárias tem break-even acima de 50%** (`1/(1+payout)`,
  ~53,5% a 87%): um win rate "positivo" mas abaixo do break-even ainda é
  prejuízo líquido — é por isso que a IA otimiza pelo **edge líquido**, não
  pelo acerto bruto.
- Antes de qualquer uso com dinheiro real: backtest extenso, forward test em
  conta demo, e atenção a spread/corretagem em timeframes curtos (M1/M5).
