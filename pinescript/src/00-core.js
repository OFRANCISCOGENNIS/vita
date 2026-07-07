// ============================================================================
// SIMULADOR CONFLUÊNCIA MULTI-FATOR — CANDLES estilo TradingView + TEMPO REAL
// Dados reais ao vivo da Binance (domínio público data.binance.vision, sem API
// key) via REST (histórico) + WebSocket (streaming). Fallback simulado offline.
// Gráficos com TradingView Lightweight Charts. Avisos de entrada com expiração.
// ============================================================================

// ---- Endpoints públicos oficiais da Binance (sem cadastro, com CORS) ----
// Podem ser sobrescritos por query param (?rest=...&ws=...) caso o usuário
// precise de outro espelho/proxy compatível com a API da Binance.
const _params = new URLSearchParams(location.search);
const BINANCE_REST = _params.get('rest') || 'https://data-api.binance.vision';
const BINANCE_WS   = _params.get('ws')   || 'wss://data-stream.binance.vision';

// ---- Forex / Índices / Ouro via Yahoo Finance (keyless, sem CORS -> via proxy) ----
// Yahoo não libera CORS; passamos por proxies CORS públicos. Como cada um é
// instável (allorigins às vezes cai com 500/522), tentamos VÁRIOS em sequência.
// ?yproxy= força um único proxy no formato {contents:...} (usado nos testes).
const YAHOO_PROXY_OVERRIDE = _params.get('yproxy');
const YAHOO_PROXIES = YAHOO_PROXY_OVERRIDE
    ? [{ nome: 'override', montar: u => YAHOO_PROXY_OVERRIDE + encodeURIComponent(u), texto: async r => JSON.parse(await r.text()).contents }]
    : [
        { nome: 'allorigins-raw', montar: u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u), texto: r => r.text() },
        { nome: 'codetabs', montar: u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u), texto: r => r.text() },
        { nome: 'allorigins-get', montar: u => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u), texto: async r => JSON.parse(await r.text()).contents }
    ];
const PARES_YAHOO = {
    EURUSD: { yahoo: 'EURUSD=X', td: 'EUR/USD', tv: 'FX:EURUSD', label: 'EUR/USD' },
    USDJPY: { yahoo: 'USDJPY=X', td: 'USD/JPY', tv: 'FX:USDJPY', label: 'USD/JPY' },
    GBPUSD: { yahoo: 'GBPUSD=X', td: 'GBP/USD', tv: 'FX:GBPUSD', label: 'GBP/USD' },
    AUDUSD: { yahoo: 'AUDUSD=X', td: 'AUD/USD', tv: 'FX:AUDUSD', label: 'AUD/USD' },
    USDCAD: { yahoo: 'USDCAD=X', td: 'USD/CAD', tv: 'FX:USDCAD', label: 'USD/CAD' },
    USDCHF: { yahoo: 'USDCHF=X', td: 'USD/CHF', tv: 'FX:USDCHF', label: 'USD/CHF' },
    EURJPY: { yahoo: 'EURJPY=X', td: 'EUR/JPY', tv: 'FX:EURJPY', label: 'EUR/JPY' },
    GBPJPY: { yahoo: 'GBPJPY=X', td: 'GBP/JPY', tv: 'FX:GBPJPY', label: 'GBP/JPY' },
    EURGBP: { yahoo: 'EURGBP=X', td: 'EUR/GBP', tv: 'FX:EURGBP', label: 'EUR/GBP' },
    NZDUSD: { yahoo: 'NZDUSD=X', td: 'NZD/USD', tv: 'FX:NZDUSD', label: 'NZD/USD' },
    AUDJPY: { yahoo: 'AUDJPY=X', td: 'AUD/JPY', tv: 'FX:AUDJPY', label: 'AUD/JPY' },
    CADJPY: { yahoo: 'CADJPY=X', td: 'CAD/JPY', tv: 'FX:CADJPY', label: 'CAD/JPY' },
    CHFJPY: { yahoo: 'CHFJPY=X', td: 'CHF/JPY', tv: 'FX:CHFJPY', label: 'CHF/JPY' },
    EURAUD: { yahoo: 'EURAUD=X', td: 'EUR/AUD', tv: 'FX:EURAUD', label: 'EUR/AUD' },
    EURCHF: { yahoo: 'EURCHF=X', td: 'EUR/CHF', tv: 'FX:EURCHF', label: 'EUR/CHF' },
    GBPAUD: { yahoo: 'GBPAUD=X', td: 'GBP/AUD', tv: 'FX:GBPAUD', label: 'GBP/AUD' },
    NZDJPY: { yahoo: 'NZDJPY=X', td: 'NZD/JPY', tv: 'FX:NZDJPY', label: 'NZD/JPY' },
    USDBRL: { yahoo: 'USDBRL=X', td: 'USD/BRL', tv: 'FX_IDC:USDBRL', label: 'USD/BRL (Dólar/Real)' },
    USDMXN: { yahoo: 'USDMXN=X', td: 'USD/MXN', tv: 'FX_IDC:USDMXN', label: 'USD/MXN' },
    XAGUSD: { yahoo: 'XAGUSD=X', td: 'XAG/USD', tv: 'TVC:SILVER', label: 'XAG/USD (Prata)' },
    XAUUSD: { yahoo: 'XAUUSD=X', td: 'XAU/USD', tv: 'TVC:GOLD', label: 'XAU/USD (Ouro)' },
    NAS100: { yahoo: '^NDX', td: 'NDX', tv: 'TVC:NDX', label: 'NAS100 (Índice Nasdaq)' },
    US30: { yahoo: '^DJI', td: 'DJI', tv: 'TVC:DJI', label: 'US30 (Dow Jones)' },
    GER40: { yahoo: '^GDAXI', td: 'DAX', tv: 'TVC:DEU40', label: 'GER40 (DAX)' }
};
const TWELVEDATA_BASE = _params.get('tdbase') || 'https://api.twelvedata.com';
let yahooPollTimer = null;
let fluxoStateAntesYahoo = null;   // guarda os toggles de Fluxo/Correlação ao entrar em Yahoo

// ---- Estado global ----
let dados = [];              // candles: {time(seg), open, high, low, close, volume}
let sinaisLong = [];         // [{index, preco}]
let sinaisShort = [];
let entradas = [];           // avisos de entrada com expiração
let computed = {};           // indicadores calculados (emaR, emaL, ema200, rsi, atr, atrMedia)

// Instâncias dos gráficos (Lightweight Charts) — criadas UMA vez
let chartPreco = null, chartRsi = null, chartAtr = null;
let serieVelas = null, serieEma9 = null, serieEma21 = null, serieEma200 = null;
let serieRsi = null, serieAtr = null, serieAtrMedia = null;
let chartEquity = null, serieEquity = null;
let chartFluxo = null, serieFluxo = null;
let graficosMontados = false;

// Fluxo de volume entre pares: [{ symbol, dados:[{time,volume,buyVol,close,open}], mapa: Map(time->idx) }]
let refPares = [];
let refTimer = null;

// WebSocket ao vivo
let ws = null;
let conexaoAtual = '';       // "SYMBOL@interval" da conexão vigente

