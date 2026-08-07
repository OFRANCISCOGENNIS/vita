# QUANT OPS v2.1 — MetaTrader 4 (Pepperstone e outras corretoras)

⚠️ **Ferramenta de ESTUDO. Não é recomendação de investimento.** Operação
alavancada (CFD/forex) é de risco altíssimo — spread, swap, comissão e
slippage corroem qualquer vantagem estatística. O painel de evidência deste
indicador mede o comportamento **bruto** do preço e **não desconta custos**.
Valide em **conta DEMO** por tempo suficiente antes de usar dinheiro real.

Arquivo: `QUANT_OPS_v2.mq4` (~1.270 linhas)

## O que ele faz

Porte refinado do QUANT OPS (app web + indicador Pine) para o MT4. Já abre com
todos os parâmetros ligados.

### Decisão
- **8 fatores de confluência**: tendência (EMA 9×21), EMA 200, RSI, ATR,
  estrutura, MACD, Bandas de Bollinger e padrão de vela
- **Portões de contexto**: multi-timeframe (com opção de TF duplo), sessão
  forte, distância de S/R, Price Action (só entra no *teste* da zona),
  **spread máximo** e **janela de rollover**
- **Selo A / B / C** e **semáforo** ENTRAR / ESPERAR / EVITAR, sempre com o
  motivo escrito por extenso
- **Entradas nível A e B**: seta grande (A) e seta pequena (B)

### Price action no gráfico
- **Zonas de S/R**, 2 por lado, com força pelo nº de toques
- **Fibonacci automático** da última perna (38.2 / 50 / 61.8)
- **LTA / LTB** automáticas por pivôs
- **Divergências RSI × preço**

### Evidência (é o que separa isso de um indicador qualquer)
O painel mede **os próprios sinais no histórico visível**: quantos saíram,
quantos o preço confirmou N velas depois, e o **limite inferior de Wilson a
95%** — porque com amostra pequena a taxa crua mente e o limite inferior não.
Mostra também a **expectativa em R** e o **break-even** implícito no seu
stop/alvo. Se o nível A tem 12 casos e 58% de acerto, o painel diz isso na
sua cara em vez de fingir confiança.

Com `ExigirEvidencia = true`, o semáforo **só abre o verde** se houver ao
menos 30 casos e o limite inferior superar o break-even.

### Gestão de risco
Stop e alvo por múltiplo de ATR, convertidos em pips, e o **lote sugerido**
para o seu percentual de risco — calculado com o tick value real da
corretora, respeitando lote mínimo/máximo e passo. Se a corretora não
devolver os dados, mostra `-` em vez de inventar número.

## Garantias técnicas

- **Sem repintura.** Um pivô só entra na conta `ForcaPivo` velas depois de
  acontecer — exatamente como você o veria em tempo real. As setas só são
  gravadas em velas **fechadas**.
- **Rápido.** O ATR vai para um buffer de cálculo (em vez de 50 chamadas de
  `iATR` por vela) e os pivôs usam cache incremental O(1) por vela em vez de
  varrer o passado. O desenho e a medição de evidência têm *throttle*
  (`RedesenhoMs`), então dezenas de ticks por segundo não travam o terminal.
- **À prova de histórico faltando.** `iBarShift`, `iHighest` e `iLowest`
  retornando −1 são tratados; o TF maior sem histórico vira "neutro" em vez
  de virar sinal falso.
- **Tema claro e escuro.** O painel lê a cor de fundo do gráfico e troca a
  paleta sozinho.

## Instalação

1. No MT4: **Arquivo → Abrir pasta de dados**
2. Copie o `QUANT_OPS_v2.mq4` para `MQL4\Indicators\`
3. **Ctrl+N** (Navegador) → botão direito em *Indicadores* → **Atualizar**
4. Arraste **QUANT_OPS_v2** para o gráfico

Se o MetaEditor abrir, **F7** compila e gera o `.ex4`.

## Push no celular

1. No MT4 mobile: *Configurações → Mensagens* → copie o **MetaQuotes ID**
2. No MT4 do PC: **Ferramentas → Opções → Notificações** → ative *notificações
   push* e cole o ID
3. No indicador, `AlertaPush = true` (padrão)

O alerta já chega com o nível (A ou B), o semáforo e a evidência daquele
nível — não é só "sinal!".

## Ajustes que valem a pena conferir

| Parâmetro | Padrão | Por quê |
|---|---|---|
| `SessaoInicio` / `SessaoFim` | 7 / 21 | É **hora do servidor**, não a sua. Na Pepperstone costuma ser GMT+2 (inverno) / GMT+3 (verão) — talvez você queira 9–23. |
| `MinimoFatores` | 4 | Sobe para 5–6 = menos sinais e mais seletivos. Desce para 3 = muito mais ruído. |
| `SpreadMaximo` | 0 (off) | Ligue com um valor real do seu par (ex.: 20 pts no EURUSD). Evita entrar em spread alargado. |
| `EvitarRolloverMin` | 0 (off) | 10–15 minutos evita a virada do dia, onde o spread explode. |
| `VelasAvaliacao` | 5 | Deve refletir quanto tempo você segura a operação. |
| `MaxBarras` | 1500 | Reduza para 600 se o gráfico ficar pesado em M1. |

## Limite honesto

O MetaTrader **não** roda a IA de otimização nem o registro de calibração do
app web — isso continua sendo função do app. A vantagem do MT4 é o alerta que
dispara com o gráfico minimizado, o push no celular e o cálculo de lote com os
dados reais da sua conta.
