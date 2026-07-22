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
        { nome: 'thingproxy', montar: u => 'https://thingproxy.freeboard.io/fetch/' + u, texto: r => r.text() },
        { nome: 'allorigins-get', montar: u => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u), texto: async r => JSON.parse(await r.text()).contents }
    ];
let _yahooProxyBom = 0;   // índice do último proxy que funcionou — tentado primeiro
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
let serieVelas = null, serieEma9 = null, serieEma21 = null, serieEma200 = null, serieVolume = null;
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
let wsTent = 0, idxTent = 0; // tentativas de reconexão (backoff exponencial)

// ============================================================================
// UTILITÁRIOS DE ROBUSTEZ (logger central, leitura numérica segura, validação)
// ============================================================================

// Logger com nível: ?log=debug liga tudo; padrão só warn/erro. Evita console solto.
const QLOG = {
    nivel: _params.get('log') === 'debug' ? 3 : (_params.get('log') === 'off' ? 0 : 1),
    warn(...a) { if (this.nivel >= 1) console.warn('[QO]', ...a); },
    info(...a) { if (this.nivel >= 2) console.info('[QO]', ...a); },
    debug(...a) { if (this.nivel >= 3) console.debug('[QO]', ...a); },
    erro(...a) { if (this.nivel >= 1) console.error('[QO]', ...a); }
};

// Faixas válidas dos inputs numéricos (espelham os atributos min/max do HTML).
const NUM_RANGES = {
    emaRapida: { min: 1, max: 50 }, emaLenta: { min: 1, max: 50 }, rsiLen: { min: 1, max: 50 },
    atrLen: { min: 1, max: 50 }, atrMediaLen: { min: 1, max: 100 },
    rsiSobrevenda: { min: 1, max: 50 }, rsiSobrecompra: { min: 50, max: 99 },
    estruturaLookback: { min: 2, max: 100 }, cooldownVelas: { min: 0, max: 50 },
    minScore: { min: 1, max: 7 }, confJanela: { min: 1, max: 20 }, fluxoJanela: { min: 2, max: 100 },
    srAtr: { min: 0.1, max: 3, float: 1 }, paAtr: { min: 0.1, max: 3, float: 1 }, numCandles: { min: 20, max: 1000 },
    volatility: { min: 0.5, max: 10, float: 1 }, payout: { min: 1, max: 500 },
    newsJanela: { min: 1, max: 240 }, iaMinVal: { min: 3, max: 30 }
};

// Leitura numérica robusta: clamp na faixa + guarda de NaN/vazio + realce visual
// no campo quando o valor foi corrigido. Nunca devolve NaN — usa o default/min.
function lerNum(id, over) {
    const el = document.getElementById(id);
    const r = Object.assign({}, NUM_RANGES[id] || {}, over || {});
    if (!el) return r.def != null ? r.def : (r.min != null ? r.min : 0);
    const bruto = r.float ? parseFloat(el.value) : parseInt(el.value, 10);
    const def = r.def != null ? r.def : (r.min != null ? r.min : 0);
    let v = isFinite(bruto) ? bruto : def;
    if (r.min != null && v < r.min) v = r.min;
    if (r.max != null && v > r.max) v = r.max;
    const corrigido = el.value !== '' && (!isFinite(bruto) || v !== bruto);
    el.classList.toggle('input-invalido', corrigido);
    return v;
}

// Combinações incoerentes que geram "lixo" — devolve lista de problemas (vazia = ok).
// Usada para bloquear a geração de SINAIS/alertas (o gráfico ainda desenha).
function configProblemas() {
    const p = [];
    if (lerNum('emaRapida') >= lerNum('emaLenta')) p.push('EMA rápida ≥ EMA lenta');
    if (lerNum('rsiSobrevenda') >= lerNum('rsiSobrecompra')) p.push('RSI sobrevenda ≥ sobrecompra');
    const nv = (typeof dados !== 'undefined' && dados) ? dados.length : 0;
    if (nv && lerNum('confJanela') > nv) p.push('janela de confluência > nº de velas');
    return p;
}

// Rede de segurança: um erro não tratado NÃO derruba a tela — loga e mostra um
// aviso discreto (com throttle p/ não spammar). O app segue vivo.
window.addEventListener('error', (e) => {
    QLOG.erro('erro:', e.message, (e.filename || '') + ':' + (e.lineno || ''));
    if (typeof showToast === 'function' && !window._qoErroToast) {
        window._qoErroToast = 1; setTimeout(() => { window._qoErroToast = 0; }, 8000);
        showToast('⚠ Erro interno contornado — o app continua funcionando.', 'err');
    }
});
window.addEventListener('unhandledrejection', (e) => {
    QLOG.erro('promessa rejeitada:', (e.reason && (e.reason.message || e.reason)) || e.reason);
});


// ---- FLUIDEZ: com a aba oculta, TODA animação CSS pausa (economiza CPU/GPU;
// os dados continuam atualizando — só o desenho decorativo dorme) ----
document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('anim-pausa', document.hidden);
});
