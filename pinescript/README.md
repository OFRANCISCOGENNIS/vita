# 📊 Simulador: Confluência Multi-Fator [Forex/Cripto]

Um **simulador visual interativo** do indicador Pine Script v5 com **velas japonesas
estilo TradingView** (biblioteca oficial **Lightweight Charts** vendorizada localmente),
que roda 100% offline no navegador. Inclui **avisos de entrada com expiração**
(1m / 5m / 15m / 30m / 1h) no estilo opções binárias, com avaliação automática
WIN/LOSS de cada entrada e win rate.

## ⚡ Modo mais rápido: arquivo único

Abra **`Simulador_Standalone.html`** com duplo-clique — a interface e a lib de
gráficos estão embutidas. Regenere-o com `node build_standalone.js` após editar
os fontes.

## 🧭 Painel de Decisão (assertividade)

O topo da página é um **painel de decisão** que responde, na vela atual:
**ENTRAR CALL ▲ / ENTRAR PUT ▼ / AGUARDAR** — com o porquê:

- **Chips por fator**: para onde cada filtro aponta agora (▲ alta, ▼ baixa, ✓ ok,
  — neutro, `off` desligado).
- **Assertividade medida**: "score 3/5 acertou 38% em 16 operações · empate exige
  53,5%" — o painel compara o histórico do score atual com o breakeven do payout;
  se o score em vigor perde do breakeven, suba o mínimo de fatores.
- **Notícia tem prioridade**: com o filtro de notícias ativo, o veredito vira
  **AGUARDAR ⚠** dentro da janela de risco, independentemente da confluência.
- **Som de alerta**: com "Som quando o veredito virar CALL/PUT" ligado (grupo
  **Alertas**), o app toca dois tons subindo (CALL) ou descendo (PUT) **na
  transição** do veredito — não repete enquanto ele se mantém. Gerado via Web
  Audio (sem arquivos, funciona offline). Navegadores exigem um clique na página
  antes do primeiro som; use **🔊 Testar som** para conferir o volume.

A interface usa tema escuro de trading com paleta validada para daltonismo e
contraste (tokens em `styles.css`).

## 🎓 Treino de Leitura (replay)

Ferramenta para **melhorar o desempenho em leitura de mercado**: o botão
**Treinar leitura (replay)** congela o gráfico num ponto **aleatório** do histórico
(escondendo o futuro) e testa sua leitura vela a vela:

- Você decide **▲ CALL / ▼ PUT / ⏭ Pular** com base na vela e no contexto;
- O app revela as velas da expiração, mostra o resultado (subiu/caiu, variação %)
  e mantém o **placar: você vs indicador** (win rate de cada um, sequência de acertos);
- **Leitura assistida** a cada vela: padrões clássicos detectados automaticamente
  (Doji, Martelo, Estrela cadente, Engolfo de alta/baixa, corpo cheio) + contexto
  (preço vs EMA200, zona do RSI, força do ATR) — para você aprender O QUE olhar;
- O indicador só pontua quando dá veredito CALL/PUT (AGUARDAR não conta), então a
  comparação é justa;
- Ao encerrar, o app restaura o gráfico completo e reconecta o ao-vivo.

Funciona com dados reais da Binance (treine a leitura no comportamento do ativo
que você opera) ou com dados simulados, e respeita o timeframe e a expiração
configurados.

## 🎯 Confluência (modos e pontuação)

A confluência ganhou dois modos, no grupo **Confluência** do painel:

- **Pontuação (mín. X de Y)** — dispara quando pelo menos **X** dos filtros ativos
  concordam na direção (e vence a direção com mais fatores). É o padrão e resolve o
  problema de a confluência estrita quase nunca ocorrer.
- **Estrita (todos os filtros)** — só dispara com **todos** os filtros ativos alinhados.

Além disso, uma **janela de confluência (velas)** permite que o momentum (reversão de
RSI) e o rompimento de estrutura se alinhem **dentro de N velas** — antes exigia a
mesma vela, o que é quase impossível (RSI saindo da sobrevenda × preço rompendo máxima
raramente coincidem no mesmo candle).

Cada entrada mostra os **fatores que dispararam** (ex.: `T·Ma·V·E (4/5)` = Tendência,
Macro, Volatilidade e Estrutura, 4 de 5) na tabela e no marcador do gráfico. O painel
de status tem um **medidor de confluência ao vivo** (CALL e PUT) da última vela.

Legenda dos fatores: `T` Tendência (EMA), `Ma` Macro (EMA200), `Mo` Momentum (RSI),
`V` Volatilidade (ATR), `E` Estrutura (rompimento), `F` Fluxo (delta compra×venda),
`C` Correlação (pares de referência).

## 💱 Forex, Ouro e Índices — duas fontes

> **Por que não TradingView?** O TradingView **não tem API pública de dados**: o
> widget embutido mostra o gráfico real (visual), mas é um iframe fechado e não
> entrega os números das velas para o app. Por isso os dados de Forex/índices/ouro
> vêm de uma das duas fontes abaixo (e o widget do TradingView continua ali só como
> conferência visual).

**Fonte recomendada — Twelve Data (chave grátis):** estável, com CORS próprio (sem
proxy no meio). Pegue uma chave grátis em **twelvedata.com**, cole no campo
"Chave Twelve Data" e escolha a fonte *Forex/Índices/Ouro — Twelve Data*. A chave
`demo` já funciona no EUR/USD para você testar.

**Fonte alternativa — Yahoo (keyless):** não precisa de cadastro, mas depende de um
proxy CORS público instável; o app tenta vários proxies em sequência e, se todos
caírem, mostra dados simulados com opção de recarregar.

Ambas cobrem os mesmos pares:

`EUR/USD` `USD/JPY` `GBP/USD` `AUD/USD` `USD/CAD` `USD/CHF` `EUR/JPY` `GBP/JPY`
`EUR/GBP` `NZD/USD` `XAU/USD (Ouro)` `NAS100 (Nasdaq)` `US30 (Dow Jones)` `GER40 (DAX)`

- Selecione **Fonte → Forex/Índices/Ouro (Yahoo)** ou escolha direto no dropdown
  **"Pares Forex / Índices / Ouro"** (troca a fonte sozinho).
- **Histórico + tempo real**: carrega o histórico via REST e depois **atualiza por
  polling a cada 15s** (Yahoo não oferece WebSocket público — diferente da Binance,
  que empurra cada tick). O status mostra "AO VIVO (polling 15s)" para deixar claro
  o mecanismo.
- Como o dado vem sem CORS liberado, a chamada passa por um proxy público
  (`allorigins`, mesmo usado nas notícias) — instável ocasionalmente; o app tenta
  3 vezes antes de cair no modo simulado como último recurso.
- **Fluxo/Correlação desativados automaticamente**: Forex/índices/ouro no Yahoo não
  têm volume agressor real, então esses dois fatores ficariam sempre neutros e
  distorceriam a pontuação — o app desliga e desabilita os controles nessa fonte, e
  **restaura seu estado anterior** ao voltar para Binance/cripto.
- O **widget oficial do TradingView** sincroniza para o símbolo correto de cada
  mercado (ex.: `FX:EURUSD`, `TVC:GOLD`, `TVC:NDX`, `TVC:DJI`, `TVC:DEU40`).

## 🔄 Fluxo de Volume — compra × venda entre pares

Dois fatores de confluência baseados em **fluxo real de ordens** (keyless, da própria
Binance — campo *taker buy volume* dos klines/WS):

- **Fator Fluxo (`F`)**: em cada vela, `compra = volume agressor (taker buy)` e
  `venda = volume − compra`. O **delta acumulado** na *janela do fluxo* (default 10
  velas) precisa apontar na direção da entrada: compra dominante favorece CALL,
  venda dominante favorece PUT. Desequilíbrios menores que 5% do volume total contam
  como equilíbrio (neutro).
- **Fator Correlação (`C`)**: busca os mesmos klines para **pares de referência**
  (default `BTCUSDT,ETHUSDT`, editável — até 4) e vota pela **maioria**: se a maior
  parte dos pares mostra o mesmo lado do fluxo na mesma janela, o fator aponta
  naquela direção. A ideia: o BTC lidera o mercado — pressão compradora nele
  reforça CALLs nas altcoins. Os pares renovam via REST a cada 60s no modo ao vivo.

O painel **Fluxo de Volume** mostra o **histograma do delta por vela** (verde =
compra dominante, vermelho = venda) sincronizado com o gráfico de preço, e as
**barras de pressão por par** (par atual + referências) com % de compra/venda e a
direção na janela. No modo simulado, o fluxo e os pares de referência são
sintetizados com correlação parcial, só para exercitar a mecânica.

### Filtro de notícias (evitar operar no susto)

Com **"Filtro de notícias"** ligado, entradas cujo horário cai dentro de uma
**janela (min)** em torno de uma notícia da moeda atual são marcadas **⚠ EVITAR**,
destacadas na tabela e **excluídas do win rate** (contadas como "Evitadas (notícia)").
Um **banner vermelho** avisa quando a vela mais recente está nessa janela de risco —
útil para não abrir posição em cima de um evento de alto impacto.

## 📈 Métricas de Análise (backtest)

Painel dedicado que avalia o desempenho das entradas (ignorando as bloqueadas por
notícia). Informe o **Payout por WIN (%)** — típico de opções binárias, 70–90% — e o
app calcula, em unidades de aposta (WIN = +payout, LOSS = −1):

- **Win rate geral** vs **Win rate p/ empatar** (breakeven = `1/(1+payout)`): se o
  win rate real fica abaixo do breakeven, a estratégia perde dinheiro mesmo acertando
  "bastante" — o ponto central de opções binárias.
- **P&L acumulado** e **Expectativa por operação** (valor esperado por trade).
- **Profit factor** (ganho bruto / perda bruta).
- **Win rate por direção** (CALL e PUT separados).
- **Maiores sequências** de WIN e de LOSS consecutivos (risco de drawdown).
- **Curva de capital** (baseline verde acima / vermelho abaixo de zero).
- **Win rate por score de confluência** — tabela que mostra se sinais com mais fatores
  (ex.: 5/5) realmente acertam mais que os fracos (ex.: 3/5), validando a confluência.

O botão **⬇️ Exportar CSV** baixa um arquivo (`simulador_PAR_TF_data.csv`) com o resumo
das métricas no cabeçalho e a tabela completa de entradas (separador `;` e BOM UTF-8,
prontos para abrir direto no Excel/Google Sheets) para análise offline.

## 📰 Notícias em tempo real

Painel **Notícias em tempo real (cripto)** que agrega manchetes de RSS
(Cointelegraph, CoinDesk) e atualiza sozinho a cada 60s:

- **Requer internet.** O RSS é buscado via um proxy CORS keyless
  (`api.allorigins.win`, sobrescrevível com `?news=`), pois feeds RSS não enviam
  cabeçalhos CORS. Sem internet, mostra um aviso e o resto do app segue funcionando.
- **"Só notícias da moeda atual"** filtra pelas manchetes que mencionam o ativo do par
  selecionado (ex.: BTCUSDT → Bitcoin/BTC).
- Cada item tem tempo relativo ("há 5 min"), título clicável e a fonte.

## 📺 Gráfico oficial do TradingView

No topo da página fica embutido o **widget oficial "Advanced Chart" do TradingView**
(o gráfico real do site, com todas as ferramentas e indicadores do TradingView).
Ele **sincroniza automaticamente** com o par e o timeframe escolhidos no painel
(ex.: `BTCUSDT` M5 → `BINANCE:BTCUSDT`, intervalo 5). Já vem com EMA, RSI e ATR.

- Requer **internet** (carrega de `s3.tradingview.com`). Sem internet, aparece um
  aviso e o **restante do simulador continua funcionando** normalmente.
- Logo abaixo fica o **meu gráfico de velas com os sinais CALL/PUT**, RSI/ATR
  calculados e a tabela de entradas com expiração — os dois convivem na mesma tela.

## 📡 Tempo real (dados ao vivo da Binance)

Por padrão a fonte é **Binance (ao vivo)**: ao abrir com **internet**, o simulador
- baixa o histórico de candles via REST (`data-api.binance.vision`, domínio público
  oficial da Binance, **sem cadastro / sem API key**);
- abre um **WebSocket** (`wss://data-stream.binance.vision`) e atualiza o candle em
  formação, os indicadores, os sinais e os avisos de entrada **a cada tick**;
- o indicador **● AO VIVO** e o ponto verde piscando confirmam a conexão.

**Par / moeda:** digite qualquer par no campo (ex.: `BTCUSDT`, `ETHUSDT`, `SOLUSDT`,
`XRPUSDT`…). O campo tem autocompletar com **todas as ~1300 moedas em negociação**
(carregadas do `exchangeInfo` da Binance).

**Sem internet / região bloqueada:** troque a fonte para **Simulado (offline)** —
gera candles aleatórios localmente. Se o carregamento ao vivo falhar, o app cai
automaticamente no modo simulado para não deixar a tela vazia.

**Endpoint alternativo:** é possível apontar para outro espelho compatível com a API
da Binance via query string, ex.:
`Simulador_Standalone.html?rest=https://SEU_MIRROR&ws=wss://SEU_MIRROR_WS`.

> Observação: em algumas regiões o domínio principal `api.binance.com` é bloqueado,
> mas o domínio público de dados `data-api.binance.vision` costuma funcionar — é o
> que o simulador usa.

## 🚀 Como usar (pasta + servidor)

### Opção 1: Python SimpleHTTPServer (Python 3)

```bash
cd pinescript/
python3 -m http.server 8000
```

Então abra o navegador em: **http://localhost:8000**

### Opção 2: Node.js http-server

```bash
npm install -g http-server
cd pinescript/
http-server -p 8000
```

Acesse: **http://localhost:8000**

### Opção 3: Node.js embutido (sem instalação)

```bash
cd pinescript/
node -e "const http = require('http'); const fs = require('fs'); const path = require('path'); const server = http.createServer((req, res) => { const file = path.join(__dirname, req.url === '/' ? 'index.html' : req.url); fs.readFile(file, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(err ? '404' : data); }); }); server.listen(8000, () => console.log('http://localhost:8000')); });"
```

### Opção 4: PHP embutido (PHP 5.4+)

```bash
cd pinescript/
php -S localhost:8000
```

---

## 📋 Funcionalidades

### 🎮 Controles em Tempo Real

- **Tendência (EMAs)**
  - EMA Rápida (default 9)
  - EMA Lenta (default 21)
  - EMA 200 (viés macro)
  - Toggle on/off para desativar este fator

- **Momentum (RSI)**
  - Período do RSI (default 14)
  - Zona de Sobrevenda (default 30)
  - Zona de Sobrecompra (default 70)
  - Toggle on/off

- **Volatilidade (ATR)**
  - Período do ATR (default 14)
  - Média do ATR (default 50)
  - Toggle on/off

- **Estrutura (Rompimento)**
  - Lookback (nº de velas, default 20)
  - Valida rompimento da máxima/mínima recente
  - Toggle on/off

- **Anti-Ruído**
  - Confirmação de fechamento de vela
  - Cooldown entre sinais (default 5 velas)

### 🕒 Gráfico & Expiração

- **Timeframe do gráfico**: M1, M5, M15, M30, H1 (define o tamanho de cada vela)
- **Expiração da entrada**: 1m, 5m, 15m, 30m, 1h (estilo opções binárias)
- Cada sinal vira um **aviso de entrada** (CALL/PUT) avaliado na expiração:
  compara o preço no fechamento da vela de entrada com o preço N velas à frente
  (N = expiração ÷ timeframe) e marca **WIN / LOSS / EMPATE / pendente**
- Tabela de entradas + resumo com **win rate**

### 📊 Gráficos Interativos (Lightweight Charts / TradingView)

1. **Preço (Velas) & EMAs**
   - Velas japonesas (verde alta / vermelho baixa), pan e zoom
   - EMA Rápida (azul), EMA Lenta (laranja), EMA 200 (roxo)
   - Setas CALL (▲ abaixo) / PUT (▼ acima) com o texto da expiração
   - Legenda O/H/L/C + valores das EMAs

2. **RSI (Momentum)**
   - Gráfico em área com linhas de referência (30/70)
   - Sobrevenda e sobrecompra marcadas

3. **ATR (Volatilidade)**
   - ATR atual vs Média do ATR
   - Identifica períodos laterais (ATR < Média)

4. **Status de Sinais**
   - Total de sinais LONG e SHORT
   - Último sinal disparado
   - Viés atual (ALTA / BAIXA / NEUTRO)
   - Status de cada filtro (✓ ativo / – desligado)

### 🎯 Simulação

- **Gerar Dados**: cria série OHLC aleatória parametrizável
  - Nº de velas: 20-500
  - Volatilidade: 0.5%-10%
- **Recalcular Sinais**: roda o indicador com os parâmetros atuais
- Todos os cálculos acontecem no navegador (sem backend)

---

## 📈 Lógica de Confluência

Um sinal LONG dispara quando **TODOS** os fatores abaixo se alinham (cada um pode ser desligado):

```
✓ Tendência: EMA Rápida > EMA Lenta
✓ Macro:     Preço > EMA 200
✓ Momentum:  RSI cruzando acima de 30 (sobrevenda)
✓ ATR:       ATR Atual > Média do ATR (movimento com força)
✓ Estrutura: Preço rompendo máxima recente
✓ Cooldown:  N velas desde o último sinal
```

**SHORT** é o espelho (todas as condições invertidas).

---

## 🔧 Arquivos

```
pinescript/
├── index.html          # Página principal (HTML5)
├── styles.css          # Estilo responsivo
├── app.js              # Lógica do indicador + renderização
├── README.md           # Este arquivo
└── Confluencia_Multi_Fator_Forex_Cripto.pine  # Código Pine Script v5 original
```

---

## 💡 Dicas de Uso

### Testar Diferentes Combinações de Filtros

1. Gere dados com uma volatilidade realista (ex.: 2%)
2. Desative filtros um a um (ex.: desativar ATR, depois EMA 200)
3. Observe como o número de sinais muda
4. Procure a combinação que melhor se adapta ao seu estilo

### Validar Sinais

- Use o gráfico de RSI para confirmar a zona de entrada
- Verifique no gráfico de ATR se o mercado tem força no momento do sinal
- Compare com o gráfico de preço: o rompimento é real?

### Anti-Ruído

- Aumente o **Cooldown** (ex.: 10 velas) para filtrar ruído em M1/M5
- Ative **Confirmação de fechamento** para evitar sinais prematuros
- Diminua a **volatilidade dos dados** para testar em mercado lateral

---

## ⚠️ Aviso Importante

**FERRAMENTA DE ESTUDO. Não é recomendação financeira.**

Este simulador é 100% educacional:
- Não conecta a nenhuma corretora ou API real
- Não envia ou executa ordens
- Os dados são simulados (OHLC aleatório)

**Antes de usar o indicador real em produção:**
1. ✅ Backtest extenso (mínimo 6 meses de histórico)
2. ✅ Forward test (2-4 semanas em conta demo)
3. ✅ Validação de entrada/saída e risco/retorno
4. ✅ Atenção especial em M1/M5 (spread, corretagem corroem o edge)

---

## 📝 Referências

- **Indicador Pine Script original**: `Confluencia_Multi_Fator_Forex_Cripto.pine`
- **Documentação**: Comentários em PT dentro do código
- **Gráficos**: Chart.js v3 (cdn)

---

## 🐛 Troubleshooting

### "Erro de CORS ao carregar Chart.js"
→ Use o servidor Python/Node/PHP acima (não abra o HTML diretamente)

### "Os gráficos não aparecem"
→ Abra o console do navegador (F12) e verifique se há erros JavaScript

### "Mudei os parâmetros mas nada aconteceu"
→ Clique em **"🔄 Recalcular Sinais"** após ajustar os inputs

---

**Versão**: 1.0  
**Atualizado**: 2026-07-01  
**Autor**: Claude (Anthropic)
