# QUANT OPS v2 — MetaTrader 4 (Pepperstone e outras corretoras)

⚠️ **Ferramenta de ESTUDO. Não é recomendação de investimento.** Operações
alavancadas (CFD/forex) são de risco altíssimo — spread, swap e comissão
corroem qualquer vantagem estatística. Valide em **conta DEMO** por tempo
suficiente antes de qualquer uso com dinheiro real.

## O que é

Porte do QUANT OPS (app web + indicador Pine) para o MetaTrader 4, no arquivo
`QUANT_OPS_v2.mq4`. Já abre com **todos os parâmetros ligados**:

- **8 fatores de confluência**: tendência (EMA 9×21), EMA 200, RSI, ATR,
  estrutura, MACD, Bandas de Bollinger e padrão de vela
- **4 portões de contexto**: multi-timeframe, sessão forte, distância de S/R e
  Price Action (só entra no *teste* da zona)
- **Zonas de S/R**: 2 por lado, com força medida pelo nº de toques
- **Fibonacci automático** da última perna (38.2 / 50 / 61.8)
- **LTA / LTB** automáticas por pivôs
- **Divergências RSI × preço**
- **Entradas nível A e B**: seta grande (A) e seta pequena (B)
- **Painel semáforo**: ENTRAR / ESPERAR / EVITAR com o motivo
- **Alerta na tela + push no celular** (MetaTrader mobile)

## Instalação

1. No MT4: **Arquivo → Abrir pasta de dados**
2. Entre em `MQL4\Indicators\` e copie o `QUANT_OPS_v2.mq4` para lá
3. No MT4: **Ver → Navegador** (Ctrl+N) → clique com o botão direito em
   *Indicadores* → **Atualizar**
4. Arraste **QUANT_OPS_v2** para o gráfico
5. Na aba *Parâmetros*, confira o grupo **(3) PORTÕES** — as horas de sessão
   são em **hora do servidor** da corretora (na Pepperstone costuma ser GMT+2
   no inverno e GMT+3 no verão; ajuste `SessaoInicio` / `SessaoFim`)

Se o MetaEditor abrir, é só apertar **F7** para compilar (gera o `.ex4`).

## Push no celular

1. Instale o MetaTrader 4 mobile e pegue o **MetaQuotes ID** em
   *Configurações → Mensagens*
2. No MT4 do PC: **Ferramentas → Opções → Notificações** → marque *Ativar
   notificações push* e cole o MetaQuotes ID
3. No indicador, `AlertaPush = true` (padrão)

## Parâmetro que mais muda o resultado

`MinimoFatores` (padrão **4**): quantos fatores precisam apontar na mesma
direção. Subir para 5–6 dá menos sinais e mais seletivos; descer para 3 dá
muito mais sinal e muito mais ruído.

## Desempenho

`MaxBarras` (padrão 600) limita quantas velas de histórico são calculadas —
se o gráfico ficar lento em timeframes pequenos, reduza para 300.

## Limite honesto

O MetaTrader **não** roda a IA de otimização nem o registro de calibração do
app web — isso continua sendo função do app. O que o MT4 traz de vantagem é o
alerta que dispara mesmo com o gráfico minimizado e o push no celular.
