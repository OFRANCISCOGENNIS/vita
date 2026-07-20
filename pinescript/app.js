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
// ============================================================================
// BLOCO 1 — INDICADORES
// ============================================================================

function sma(a, p) {
    const r = [];
    for (let i = 0; i < a.length; i++) {
        if (i < p - 1) { r.push(null); continue; }
        let s = 0; for (let j = i - p + 1; j <= i; j++) s += a[j];
        r.push(s / p);
    }
    return r;
}
function ema(a, p) {
    const r = []; const m = 2 / (p + 1); let prev = null;
    for (let i = 0; i < a.length; i++) {
        if (i < p - 1) { r.push(null); continue; }
        if (i === p - 1) { let s = 0; for (let j = 0; j < p; j++) s += a[j]; prev = s / p; r.push(prev); }
        else { prev = (a[i] - prev) * m + prev; r.push(prev); }
    }
    return r;
}
function rsi(a, p) {
    const r = [null]; const ch = [];
    for (let i = 1; i < a.length; i++) ch.push(a[i] - a[i - 1]);
    for (let i = 0; i < ch.length; i++) {
        if (i < p - 1) { r.push(null); continue; }
        let g = 0, l = 0;
        for (let j = i - p + 1; j <= i; j++) { if (ch[j] > 0) g += ch[j]; else l += Math.abs(ch[j]); }
        const ag = g / p, al = l / p; const rs = al === 0 ? 100 : ag / al;
        r.push(100 - (100 / (1 + rs)));
    }
    return r;
}
function atr(h, l, c, p) {
    const tr = [];
    for (let i = 0; i < c.length; i++) {
        if (i === 0) { tr.push(h[i] - l[i]); continue; }
        tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    }
    return sma(tr, p);
}
function crossover(cur, prev, nivel) { return prev !== null && cur !== null && prev <= nivel && cur > nivel; }
function crossunder(cur, prev, nivel) { return prev !== null && cur !== null && prev >= nivel && cur < nivel; }

// ============================================================================
// BLOCO 1.5 — ESTATÍSTICA DE ASSERTIVIDADE (intervalo de confiança + expectativa)
// ============================================================================
// Win rate cru MENTE em amostra pequena: 5/6 (83%) parece melhor que 55/80
// (69%), mas tem muito menos evidência. Estas métricas corrigem isso — são a
// base para a IA e o selo A/B/C deixarem de premiar sorte de amostra pequena.

// Limite inferior de Wilson (~95%, z=1.96): estimativa CONSERVADORA da taxa real
// de acerto, dado w vitórias em n operações. Quanto menor a amostra, mais o
// limite puxa para baixo — é o antídoto contra "deu certo em 5 de 6, então é 83%".
function wilsonLB(w, n, z) {
    if (!n) return 0;
    z = z || 1.96;
    const p = w / n, z2 = z * z;
    const centro = p + z2 / (2 * n);
    const margem = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return Math.max(0, (centro - margem) / (1 + z2 / n));
}
// Expectativa por operação numa binária de payout p (fração): quanto se ganha,
// em média, por R$1 arriscado. wr·payout − (1−wr). >0 = lucrativo no longo prazo.
function expectancia(wr, payout) { return wr * payout - (1 - wr); }
// Break-even (win rate mínimo para empatar) dado o payout.
function breakEven(payout) { return 1 / (1 + payout); }
// Formata percentual inteiro (0.69 → "69%") — usado nas métricas de acerto.
function pctTxt(x) { return (x * 100).toFixed(0) + '%'; }
// Escapa texto do usuário antes de ir para innerHTML (nomes de filtro etc.)
function escHTML(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ============================================================================
// BLOCO 2 — LEITURA DE CONTROLES
// ============================================================================

function tfMinutes() { return parseInt(document.getElementById('timeframe').value); }
let expOverride = null;   // usado pela IA para backtestar horizontes de expiração
function expMinutes() { return expOverride || parseInt(document.getElementById('expiracao').value); }
function fonte() { return document.getElementById('fonte').value; }
function symbolAtual() { return (document.getElementById('symbol').value || 'BTCUSDT').trim().toUpperCase(); }
function binanceInterval() { const v = tfMinutes(); return v === 60 ? '1h' : v + 'm'; }

// ---- Carregamento genérico por timeframe (reutilizado por IA multi-TF e filtro HTF) ----
const TFS_IA = [1, 5, 15, 30, 60];   // timeframes que a IA testa
function loaderPorFonte(f) {
    return f === 'binance' ? carregarHistoricoBinance : f === 'twelvedata' ? carregarHistoricoTwelveData : carregarHistoricoYahoo;
}
function intervalPorFonte(f, tfMin) {
    return f === 'binance' ? (tfMin === 60 ? '1h' : tfMin + 'm') : tfMin;
}
async function carregarHistoricoTF(symbol, tfMin, limit) {
    const f = fonteDe(symbol);   // no modo combinado, cada símbolo vai p/ sua fonte
    const chave = f + '|' + symbol + '|' + tfMin + '|' + limit;   // cache TTL 60s (IA em lote reusa)
    if (symbol === 'CRYPTOIDX') return comCache(chave, () => carregarHistoricoCryptoIDX(intervalPorFonte('binance', tfMin), limit));
    // forex3: tenta Twelve Data e, se falhar (sem chave/limite), cai no Yahoo keyless
    if (f === 'forex3') return comCache(chave, async () => {
        try { return await carregarHistoricoTwelveData(symbol, tfMin, limit); }
        catch (e) { return await carregarHistoricoYahoo(symbol, tfMin, limit); }
    });
    return comCache(chave, () => loaderPorFonte(f)(symbol, intervalPorFonte(f, tfMin), limit));
}
// TF maior correspondente ao TF de trabalho (para o filtro Multi-Timeframe)
function htfDeTf(tfMin) {
    return tfMin <= 5 ? 15 : tfMin <= 15 ? 60 : 60;
}

// ============================================================================
// BLOCO 3 — GERAÇÃO SIMULADA (fallback offline)
// ============================================================================

function gerarDadosSim(numCandles, volatilidade) {
    const out = []; let preco = 100;
    const stepSec = tfMinutes() * 60;
    const agora = Math.floor(Date.now() / 1000);
    const baseTime = agora - (agora % stepSec);
    for (let i = 0; i < numCandles; i++) {
        const open = preco;
        const close = open + (Math.random() - 0.5) * volatilidade;
        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);
        const volume = Math.floor(Math.random() * 1e6) + 1e5;
        // Compra agressora simulada: velas de alta tendem a ter mais compra
        const vies = (close > open ? 1 : -1) * (0.10 + Math.random() * 0.15);
        const fracaoCompra = Math.min(0.95, Math.max(0.05, 0.5 + vies + (Math.random() - 0.5) * 0.1));
        out.push({
            time: baseTime - (numCandles - 1 - i) * stepSec,
            open: +open.toFixed(4), high: +high.toFixed(4),
            low: +low.toFixed(4), close: +close.toFixed(4),
            volume, buyVol: Math.floor(volume * fracaoCompra)
        });
        preco = close;
    }
    return out;
}

// Pares de referência simulados: seguem parcialmente o par principal (correlação ~0.6)
function gerarRefParesSim(principal) {
    const nomes = paresReferencia();
    return nomes.map(symbol => {
        let preco = 100;
        const serie = principal.map(c => {
            const mainChange = c.close - c.open;
            const open = preco;
            const close = open + mainChange * 0.6 + (Math.random() - 0.5) * Math.abs(mainChange || 0.5) * 0.8;
            const volume = Math.floor(Math.random() * 1e6) + 1e5;
            const vies = (close > open ? 1 : -1) * (0.10 + Math.random() * 0.15);
            const fracaoCompra = Math.min(0.95, Math.max(0.05, 0.5 + vies));
            preco = close;
            return { time: c.time, open, close, volume, buyVol: Math.floor(volume * fracaoCompra) };
        });
        return montarRefPar(symbol, serie);
    });
}

function montarRefPar(symbol, serie) {
    const mapa = new Map();
    serie.forEach((c, i) => mapa.set(c.time, i));
    return { symbol, dados: serie, mapa };
}

function paresReferencia() {
    const atual = symbolAtual();
    return (document.getElementById('refPairs').value || '')
        .split(',').map(s => s.trim().toUpperCase()).filter(s => s && s !== atual).slice(0, 4);
}

// ============================================================================
// BLOCO 4 — CÁLCULO DOS INDICADORES E SINAIS
// ============================================================================

function recomputarIndicadores() {
    const emaRapidaLen = lerNum('emaRapida');
    const emaLentaLen = lerNum('emaLenta');
    const rsiLen = lerNum('rsiLen');
    const atrLen = lerNum('atrLen');
    const atrMediaLen = lerNum('atrMediaLen');

    const closes = dados.map(d => d.close);
    const highs = dados.map(d => d.high);
    const lows = dados.map(d => d.low);

    computed = {
        closes,
        emaR: ema(closes, emaRapidaLen),
        emaL: ema(closes, emaLentaLen),
        ema200: ema(closes, 200),
        rsiValues: rsi(closes, rsiLen),
        atrValues: atr(highs, lows, closes, atrLen),
        atrMedia: null,
        highs, lows
    };
    computed.atrMedia = sma(computed.atrValues, atrMediaLen);

    // MACD (12/26/9) e Bandas de Bollinger (20, 2σ) — fatores extras de confluência
    const e12 = ema(closes, 12), e26 = ema(closes, 26);
    const macdLine = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
    const sig = new Array(closes.length).fill(null);
    const kSig = 2 / 10; let s9 = null;
    for (let i = 0; i < macdLine.length; i++) {
        if (macdLine[i] == null) continue;
        s9 = s9 == null ? macdLine[i] : macdLine[i] * kSig + s9 * (1 - kSig);
        sig[i] = s9;
    }
    computed.macdHist = macdLine.map((v, i) => (v != null && sig[i] != null) ? v - sig[i] : null);
    const bbMid = sma(closes, 20);
    computed.bbUp = new Array(closes.length).fill(null);
    computed.bbDn = new Array(closes.length).fill(null);
    for (let i = 19; i < closes.length; i++) {
        if (bbMid[i] == null) continue;
        let v = 0; for (let j = i - 19; j <= i; j++) v += (closes[j] - bbMid[i]) ** 2;
        const sd = Math.sqrt(v / 20);
        computed.bbUp[i] = bbMid[i] + 2 * sd;
        computed.bbDn[i] = bbMid[i] - 2 * sd;
    }
}

let confLive = { long: 0, short: 0, enabled: 0 };  // pontuação de confluência na última vela
let htfTrend = [];   // tendência do TF maior alinhada a cada vela (1/-1/0) — filtro multi-timeframe

// ---- Fluxo de volume (delta compra×venda) ----

function deltaPorVela(c) { return (c.buyVol || 0) * 2 - (c.volume || 0); }   // compra − venda

// Delta acumulado nas últimas n velas terminando em endIdx.
// dir: 1 compra dominante, -1 venda dominante, 0 equilibrado (<5% do volume)
function deltaNaJanela(arr, endIdx, n) {
    let buy = 0, tot = 0;
    for (let j = Math.max(0, endIdx - n + 1); j <= endIdx; j++) {
        buy += arr[j].buyVol || 0;
        tot += arr[j].volume || 0;
    }
    const delta = buy * 2 - tot;
    const dir = (tot <= 0 || Math.abs(delta) < tot * 0.05) ? 0 : (delta > 0 ? 1 : -1);
    return { dir, delta, buy, sell: tot - buy, tot };
}

// Voto de correlação no timestamp t: maioria dos pares de referência com o
// delta na mesma direção na mesma janela. 0 = sem maioria / sem dados.
function votoCorrelacao(t, janela) {
    let soma = 0, votos = 0;
    refPares.forEach(par => {
        const j = par.mapa.get(t);
        if (j === undefined) return;
        const d = deltaNaJanela(par.dados, j, janela).dir;
        if (d !== 0) { soma += d; votos++; }
    });
    if (!votos) return 0;
    return soma > 0 ? 1 : soma < 0 ? -1 : 0;
}

function rotuloFatores(fat) {
    const ok = fat.filter(f => f.on && f.ok).map(f => f.k);
    return ok.length ? ok.join('·') : '—';
}

// ---- CANDLE ANALYZER 2.0 (confirmação de preço na vela do sinal) ----
// Mede anatomia (corpo %, pavios %) e detecta padrões com nível de convicção:
// engolfo/marubozu = alta convicção (2), martelo/estrela = média (1),
// inside bar = compressão (indecisão → não confirma nenhum lado).
function padraoVela(i) {
    if (i < 1) return { up: false, down: false, forca: 0, inside: false };
    const c = dados[i], p = dados[i - 1];
    const corpo = Math.abs(c.close - c.open);
    const range = (c.high - c.low) || 1e-9;
    const bodyPct = corpo / range;
    const wickUp = c.high - Math.max(c.close, c.open);
    const wickDn = Math.min(c.close, c.open) - c.low;
    const inside = c.high <= p.high && c.low >= p.low;              // compressão
    const engAlta = c.close > c.open && p.close < p.open && c.close >= p.open && c.open <= p.close;
    const engBaixa = c.close < c.open && p.close > p.open && c.open >= p.close && c.close <= p.open;
    const maruAlta = c.close > c.open && bodyPct >= 0.85;           // marubozu
    const maruBaixa = c.close < c.open && bodyPct >= 0.85;
    const martelo = wickDn >= corpo * 2 && wickUp <= corpo && bodyPct <= 0.4;
    const estrela = wickUp >= corpo * 2 && wickDn <= corpo && bodyPct <= 0.4;
    const up = !inside && (engAlta || maruAlta || martelo);
    const down = !inside && (engBaixa || maruBaixa || estrela);
    const forca = (engAlta || engBaixa || maruAlta || maruBaixa) ? 2 : (martelo || estrela) ? 1 : 0;
    return { up, down, forca, inside };
}

// ---- MARKET REGIME ENGINE ----
// Classifica cada vela em um regime: 'trend' (tendencial), 'vol' (expansão de
// volatilidade) ou 'range' (lateral/compressão). Cada regime redistribui os
// pesos dos fatores na pontuação dinâmica.
function regimePorBarra() {
    const { closes, emaR, emaL, ema200, atrValues, atrMedia } = computed;
    const out = new Array(closes.length).fill('range');
    for (let i = 0; i < closes.length; i++) {
        const atrOk = atrValues[i] != null && atrMedia[i] != null;
        if (atrOk && atrValues[i] > atrMedia[i] * 1.3) { out[i] = 'vol'; continue; }
        if (emaR[i] != null && emaL[i] != null && ema200[i] != null && atrOk) {
            const sep = Math.abs(emaR[i] - emaL[i]);
            const dist = Math.abs(closes[i] - ema200[i]);
            if (sep > atrValues[i] * 0.15 && dist > atrValues[i] * 0.5) out[i] = 'trend';
        }
    }
    return out;
}
const REGIME_ROTULO = { trend: '📈 Tendencial', vol: '🔥 Volátil', range: '↔ Lateral' };
// Pesos-base por regime (Engine de Pontuação Dinâmica). Média ≈ 1 para manter
// a semântica do "mín. de fatores": tendencial premia Estrutura/Tendência,
// lateral premia reversão (RSI/Padrão/Fluxo), volátil premia ATR/Fluxo.
const PESOS_REGIME = {
    trend: { T: 1.4, Ma: 1.3, Mo: 0.7, V: 1.0, E: 1.4, F: 1.1, C: 1.0, P: 0.9, X: 1.3, B: 0.6 },
    range: { T: 0.7, Ma: 0.7, Mo: 1.4, V: 0.8, E: 0.8, F: 1.2, C: 1.0, P: 1.4, X: 0.7, B: 1.4 },
    vol:   { T: 1.0, Ma: 1.0, Mo: 0.9, V: 1.4, E: 1.1, F: 1.3, C: 1.0, P: 1.1, X: 1.0, B: 1.0 }
};

// ---- Sessões de mercado (por hora UTC) ----
function sessaoDe(t) {
    const h = new Date(t * 1000).getUTCHours();
    if (h >= 13 && h < 16) return 'Londres+NY';
    if (h >= 7 && h < 13) return 'Londres';
    if (h >= 16 && h < 22) return 'Nova York';
    return 'Ásia';
}
function sessaoForte(t) { return sessaoDe(t) !== 'Ásia'; }

// ---- Suporte/Resistência: pivôs (topos/fundos locais) da janela SR_W ----
// FLUIDEZ: memoizado por (nº de barras + tempo da última vela) — vários painéis
// pedem os pivôs na mesma atualização; a vela em formação não muda pivôs
// confirmados, então o cache vale até nascer vela nova ou recarregar dados.
const SR_W = 5;
let _pivKey = '', _pivMemo = null;
function acharPivotsSR() {
    const { highs, lows } = computed;
    const chave = highs.length + '|' + (dados.length ? dados[dados.length - 1].time : 0);
    if (_pivMemo && chave === _pivKey) return _pivMemo;
    const res = [], sup = [];
    for (let j = SR_W; j < highs.length - SR_W; j++) {
        let ph = true, pl = true;
        for (let k = j - SR_W; k <= j + SR_W; k++) {
            if (highs[k] > highs[j]) ph = false;
            if (lows[k] < lows[j]) pl = false;
        }
        if (ph) res.push({ i: j, price: highs[j] });
        if (pl) sup.push({ i: j, price: lows[j] });
    }
    _pivKey = chave; _pivMemo = { res, sup };
    return _pivMemo;
}
// Veta long colado numa resistência acima / short colado num suporte abaixo.
// Só usa pivôs já confirmados (i + SR_W <= barra) — sem olhar o futuro.
function vetoSR(piv, i, close, atrV, k) {
    if (!atrV) return { vetoLong: false, vetoShort: false };
    let resAbove = Infinity, supBelow = -Infinity;
    for (const p of piv.res) if (p.i + SR_W <= i && p.price > close && p.price < resAbove) resAbove = p.price;
    for (const p of piv.sup) if (p.i + SR_W <= i && p.price < close && p.price > supBelow) supBelow = p.price;
    return {
        vetoLong: resAbove !== Infinity && (resAbove - close) < k * atrV,
        vetoShort: supBelow !== -Infinity && (close - supBelow) < k * atrV
    };
}

// ---- Peso por fator (IA): win rate histórico de cada fator vira peso no score ----
let pesoFatores = JSON.parse(localStorage.getItem('pesoFatores') || '{}');
function atualizarPesosFatores() {
    const av = entradas.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    if (av.length < 10) return;
    const acc = {};
    av.forEach(e => (e.fatores || '').split('·').forEach(kk => {
        if (!FATORES_NOMES[kk]) return;
        (acc[kk] = acc[kk] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') acc[kk].w++;
    }));
    const m = {};
    Object.keys(acc).forEach(kk => { if (acc[kk].t >= 5) m[kk] = acc[kk].w / acc[kk].t; });
    if (Object.keys(m).length) { pesoFatores[symbolAtual()] = m; localStorage.setItem('pesoFatores', JSON.stringify(pesoFatores)); }
}
function pesoDe(mapa, k) { const wr = mapa && mapa[k]; return wr == null ? 1 : Math.max(0.3, Math.min(1.8, wr / 0.5)); }

function recomputarSinais() {
    const useTendencia = document.getElementById('useTendencia').checked;
    const useEma200 = document.getElementById('useEma200').checked;
    const useMomentum = document.getElementById('useMomentum').checked;
    const rsiSobrevenda = lerNum('rsiSobrevenda');
    const rsiSobrecompra = lerNum('rsiSobrecompra');
    const useVolatilidade = document.getElementById('useVolatilidade').checked;
    const useEstrutura = document.getElementById('useEstrutura').checked;
    const estruturaLookback = lerNum('estruturaLookback');
    const cooldownVelas = lerNum('cooldownVelas');
    const confMode = document.getElementById('confMode').value;              // 'score' | 'estrita'
    const minScore = lerNum('minScore');
    const janela = lerNum('confJanela');
    const useFluxo = document.getElementById('useFluxo').checked;
    const useCorrelacao = document.getElementById('useCorrelacao').checked;
    const fluxoJanela = lerNum('fluxoJanela');
    // Filtro Multi-Timeframe: htfTrend[i] = 1 (alta) / -1 (baixa) / 0 no TF maior
    const useHtf = document.getElementById('useHtf').checked && htfTrend.length === computed.closes.length;
    const usePadrao = document.getElementById('usePadrao').checked;
    const useSessao = document.getElementById('useSessao').checked;
    const useSR = document.getElementById('useSR').checked;
    const srK = lerNum('srAtr');
    const usePA = document.getElementById('usePA').checked;
    const paK = lerNum('paAtr');
    const useMacd = document.getElementById('useMacd').checked;
    const useBollinger = document.getElementById('useBollinger').checked;
    const usePeso = document.getElementById('usePesoIA').checked;
    const pesos = usePeso ? (pesoFatores[symbolAtual()] || {}) : null;
    const piv = useSR ? acharPivotsSR() : null;
    const regimes = usePeso ? regimePorBarra() : null;   // pesos dinâmicos por regime

    const { closes, emaR, emaL, ema200, rsiValues, atrValues, atrMedia, highs, lows, macdHist, bbUp, bbDn } = computed;

    const maxRec = [], minRec = [];
    for (let i = 0; i < closes.length; i++) {
        if (i === 0) { maxRec.push(highs[0]); minRec.push(lows[0]); continue; }
        let mx = -Infinity, mn = Infinity;
        const start = Math.max(0, i - estruturaLookback);
        for (let j = start; j < i; j++) { mx = Math.max(mx, highs[j]); mn = Math.min(mn, lows[j]); }
        maxRec.push(mx); minRec.push(mn);
    }

    // Cruzamentos de RSI por vela — usados com JANELA de confluência, para que o
    // momentum (reversão da sobrevenda/sobrecompra) possa alinhar com o rompimento
    // de estrutura dentro de N velas (antes só valia na MESMA vela = quase nunca).
    const momLongBar = [], momShortBar = [];
    for (let i = 0; i < closes.length; i++) {
        momLongBar.push(i >= 1 && crossover(rsiValues[i], rsiValues[i - 1], rsiSobrevenda));
        momShortBar.push(i >= 1 && crossunder(rsiValues[i], rsiValues[i - 1], rsiSobrecompra));
    }
    const recente = (arr, i) => { for (let j = Math.max(0, i - janela + 1); j <= i; j++) if (arr[j]) return true; return false; };

    const enabledCount = [useTendencia, useEma200, useMomentum, useVolatilidade, useEstrutura, useFluxo, useCorrelacao, usePadrao, useMacd, useBollinger].filter(Boolean).length;

    sinaisLong = []; sinaisShort = [];
    let barras = 999999;
    for (let i = 1; i < closes.length; i++) {
        barras++;
        const tL = emaR[i] !== null && emaL[i] !== null && emaR[i] > emaL[i];
        const tS = emaR[i] !== null && emaL[i] !== null && emaR[i] < emaL[i];
        const maL = ema200[i] !== null && closes[i] > ema200[i];
        const maS = ema200[i] !== null && closes[i] < ema200[i];
        const moL = recente(momLongBar, i);
        const moS = recente(momShortBar, i);
        const vo = atrValues[i] !== null && atrMedia[i] !== null && atrValues[i] > atrMedia[i];
        // maxRec[i]/minRec[i] já excluem a própria vela i (janela [i-lookback, i-1])
        const eL = closes[i] > maxRec[i];
        const eS = closes[i] < minRec[i];

        // Fluxo de volume: delta compra×venda do par na janela
        const fluxoDir = useFluxo ? deltaNaJanela(dados, i, fluxoJanela).dir : 0;
        // Correlação: maioria dos pares de referência na mesma direção
        const corrDir = useCorrelacao ? votoCorrelacao(dados[i].time, fluxoJanela) : 0;

        const pat = usePadrao ? padraoVela(i) : { up: false, down: false };

        // MACD: histograma positivo e subindo = CALL; negativo e caindo = PUT
        const mh = macdHist[i], mhp = macdHist[i - 1];
        const xL = useMacd && mh != null && mhp != null && mh > 0 && mh >= mhp;
        const xS = useMacd && mh != null && mhp != null && mh < 0 && mh <= mhp;
        // Bollinger (reversão): fechou fora da banda inferior = CALL; fora da superior = PUT
        const bL = useBollinger && bbDn[i] != null && closes[i] < bbDn[i];
        const bS = useBollinger && bbUp[i] != null && closes[i] > bbUp[i];

        const fatL = [
            { k: 'T', on: useTendencia, ok: tL }, { k: 'Ma', on: useEma200, ok: maL },
            { k: 'Mo', on: useMomentum, ok: moL }, { k: 'V', on: useVolatilidade, ok: vo },
            { k: 'E', on: useEstrutura, ok: eL },
            { k: 'F', on: useFluxo, ok: fluxoDir === 1 }, { k: 'C', on: useCorrelacao, ok: corrDir === 1 },
            { k: 'P', on: usePadrao, ok: pat.up },
            { k: 'X', on: useMacd, ok: xL }, { k: 'B', on: useBollinger, ok: bL }
        ];
        const fatS = [
            { k: 'T', on: useTendencia, ok: tS }, { k: 'Ma', on: useEma200, ok: maS },
            { k: 'Mo', on: useMomentum, ok: moS }, { k: 'V', on: useVolatilidade, ok: vo },
            { k: 'E', on: useEstrutura, ok: eS },
            { k: 'F', on: useFluxo, ok: fluxoDir === -1 }, { k: 'C', on: useCorrelacao, ok: corrDir === -1 },
            { k: 'P', on: usePadrao, ok: pat.down },
            { k: 'X', on: useMacd, ok: xS }, { k: 'B', on: useBollinger, ok: bS }
        ];
        const longScore = fatL.filter(f => f.on && f.ok).length;
        const shortScore = fatS.filter(f => f.on && f.ok).length;
        // Pontuação dinâmica: peso do fator = (acerto histórico IA) × (peso do
        // regime de mercado da vela) × (acerto REAL do fator no Registro, bloco
        // 23 — o backtest propõe, o resultado real confirma ou demite).
        const wReg = regimes ? PESOS_REGIME[regimes[i]] : null;
        const pReal = usePeso && typeof pesosReaisMapa === 'function' ? pesosReaisMapa() : null;
        const pesoTotal = f => pesoDe(pesos, f.k) * (wReg ? wReg[f.k] : 1) * (pReal ? pesoRealFator(pReal, f.k) : 1);
        const longW = fatL.reduce((s, f) => s + (f.on && f.ok ? pesoTotal(f) : 0), 0);
        const shortW = fatS.reduce((s, f) => s + (f.on && f.ok ? pesoTotal(f) : 0), 0);

        let longSig, shortSig;
        if (confMode === 'estrita') {
            longSig = enabledCount > 0 && longScore === enabledCount;
            shortSig = enabledCount > 0 && shortScore === enabledCount;
        } else if (usePeso) {
            longSig = longW >= minScore && longScore > shortScore;
            shortSig = shortW >= minScore && shortScore > longScore;
        } else {
            longSig = longScore >= minScore && longScore > shortScore;
            shortSig = shortScore >= minScore && shortScore > longScore;
        }

        // Gate de sessão: fora das sessões fortes (Ásia) não opera
        if (useSessao && !sessaoForte(dados[i].time)) { longSig = false; shortSig = false; }
        // Gate de Suporte/Resistência: veta entrada colada no nível contrário
        if (useSR && (longSig || shortSig)) {
            const vs = vetoSR(piv, i, closes[i], atrValues[i], srK);
            if (vs.vetoLong) longSig = false;
            if (vs.vetoShort) shortSig = false;
        }

        // Multi-Timeframe: só permite entrada a favor da tendência do TF maior
        if (useHtf) {
            if (htfTrend[i] !== 1) longSig = false;
            if (htfTrend[i] !== -1) shortSig = false;
        }

        const cool = barras >= cooldownVelas;
        if (longSig && cool) {
            sinaisLong.push({ index: i, preco: closes[i], score: longScore, enabled: enabledCount, fatores: rotuloFatores(fatL) });
            barras = 0;
        } else if (shortSig && cool) {
            sinaisShort.push({ index: i, preco: closes[i], score: shortScore, enabled: enabledCount, fatores: rotuloFatores(fatS) });
            barras = 0;
        }

        if (i === closes.length - 1) {
            const vsLast = useSR ? vetoSR(piv, i, closes[i], atrValues[i], srK) : { vetoLong: false, vetoShort: false };
            // Filtro Price Action: a entrada só vale no TESTE de uma zona — CALL
            // perto de suporte/LTA, PUT perto de resistência/LTB (≤ paK × ATR).
            let paOkLong = true, paOkShort = true;
            if (usePA && typeof calcularLT === 'function') {
                const pv = piv || acharPivotsSR();
                const atrV = atrValues[i] || closes[i] * 0.002;
                const tol = atrV * paK;
                const lta = calcularLT(pv.sup, closes.length, 'LTA', 0.35, atrV);
                const ltb = calcularLT(pv.res, closes.length, 'LTB', 0.35, atrV);
                const nivSup = pv.sup.map(p => p.price); if (lta) nivSup.push(lta.atual);
                const nivRes = pv.res.map(p => p.price); if (ltb) nivRes.push(ltb.atual);
                paOkLong = nivSup.some(pr => Math.abs(closes[i] - pr) <= tol);
                paOkShort = nivRes.some(pr => Math.abs(closes[i] - pr) <= tol);
            }
            confLive = {
                long: longScore, short: shortScore, enabled: enabledCount,
                longW, shortW, usePeso,
                regime: regimes ? regimes[i] : null,
                minScore, confMode,
                htfDir: useHtf ? htfTrend[i] : 0, useHtf,
                srVetoLong: vsLast.vetoLong, srVetoShort: vsLast.vetoShort, useSR,
                usePA, paOkLong, paOkShort,
                sessao: sessaoDe(dados[i].time), sessaoForte: sessaoForte(dados[i].time), useSessao,
                fatores: [
                    { nome: 'Tendência', on: useTendencia, dir: tL ? 1 : tS ? -1 : 0 },
                    { nome: 'EMA 200', on: useEma200, dir: maL ? 1 : maS ? -1 : 0 },
                    { nome: 'RSI', on: useMomentum, dir: moL ? 1 : moS ? -1 : 0 },
                    { nome: 'ATR', on: useVolatilidade, dir: vo ? 2 : 0 },   // 2 = ok (não direcional)
                    { nome: 'Estrutura', on: useEstrutura, dir: eL ? 1 : eS ? -1 : 0 },
                    { nome: 'Fluxo', on: useFluxo, dir: fluxoDir },
                    { nome: 'Correlação', on: useCorrelacao, dir: corrDir },
                    { nome: 'Padrão', on: usePadrao, dir: pat.up ? 1 : pat.down ? -1 : 0 },
                    { nome: 'MACD', on: useMacd, dir: xL ? 1 : xS ? -1 : 0 },
                    { nome: 'Bollinger', on: useBollinger, dir: bL ? 1 : bS ? -1 : 0 },
                    // chip informativo do filtro PA (portão, não entra na pontuação):
                    // ▲ = zona de suporte/LTA perto · ▼ = resistência/LTB · — = longe
                    { nome: 'PA zona', on: usePA, dir: (paOkLong && paOkShort) ? 2 : paOkLong ? 1 : paOkShort ? -1 : 0 }
                ]
            };
        }
    }
}

// Filtro Multi-Timeframe: carrega o TF maior, calcula a tendência por barra dele
// (EMA rápida×lenta + posição vs EMA200) e alinha por tempo a cada vela do TF de
// trabalho, preenchendo htfTrend[]. Sem rede (sim) ou desligado → htfTrend vazio.
async function carregarHtf() {
    const info = document.getElementById('htfInfo');
    htfTrend = [];
    if (!document.getElementById('useHtf').checked || fonte() === 'sim' || !dados.length) {
        info.style.display = 'none';
        return;
    }
    const htfMin = htfDeTf(tfMinutes());
    if (htfMin <= tfMinutes()) { info.style.display = 'none'; return; }
    try {
        const hd = await carregarHistoricoTF(symbolAtual(), htfMin, 300);
        if (!hd || hd.length < 210) throw new Error('histórico curto');
        const c = hd.map(d => d.close);
        const eR = ema(c, parseInt(document.getElementById('emaRapida').value));
        const eL = ema(c, parseInt(document.getElementById('emaLenta').value));
        const e2 = ema(c, 200);
        const trend = hd.map((d, j) => {
            if (eR[j] == null || eL[j] == null || e2[j] == null) return 0;
            if (eR[j] > eL[j] && c[j] > e2[j]) return 1;
            if (eR[j] < eL[j] && c[j] < e2[j]) return -1;
            return 0;
        });
        // alinhamento por tempo (ambos ascendentes): cada vela usa a última barra HTF fechada
        let j = 0;
        htfTrend = dados.map(d => {
            while (j + 1 < hd.length && hd[j + 1].time <= d.time) j++;
            return hd[j].time <= d.time ? trend[j] : 0;
        });
        const rot = htfMin === 60 ? 'H1' : 'M' + htfMin;
        const ult = htfTrend[htfTrend.length - 1];
        info.textContent = `TF maior: ${rot} · tendência atual ${ult === 1 ? '📈 ALTA' : ult === -1 ? '📉 BAIXA' : '↔ neutra'}`;
        info.style.display = 'block';
    } catch (e) {
        info.textContent = 'TF maior indisponível — filtro inativo nesta carga.';
        info.style.display = 'block';
    }
}

// ============================================================================
// BLOCO 5 — AVISOS DE ENTRADA COM EXPIRAÇÃO (WIN/LOSS)
// ============================================================================

function recomputarEntradas() {
    const tf = tfMinutes(), exp = expMinutes();
    const N = Math.max(1, Math.round(exp / tf));
    const brutos = [
        ...sinaisLong.map(s => ({ index: s.index, dir: 'CALL', score: s.score, enabled: s.enabled, fatores: s.fatores })),
        ...sinaisShort.map(s => ({ index: s.index, dir: 'PUT', score: s.score, enabled: s.enabled, fatores: s.fatores }))
    ].sort((a, b) => a.index - b.index);

    entradas = brutos.map(s => {
        const c = dados[s.index];
        const entryPrice = c.close;
        const expIdx = s.index + N;
        const expTime = c.time + exp * 60;
        let resultado = 'pendente', expPrice = null;
        if (expIdx < dados.length) {
            expPrice = dados[expIdx].close;
            if (expPrice === entryPrice) resultado = 'EMPATE';
            else if (s.dir === 'CALL') resultado = expPrice > entryPrice ? 'WIN' : 'LOSS';
            else resultado = expPrice < entryPrice ? 'WIN' : 'LOSS';
        }
        return { index: s.index, dir: s.dir, entryTime: c.time, entryPrice, expMin: exp, expTime, resultado, expPrice, score: s.score, enabled: s.enabled, fatores: s.fatores };
    });
    if (document.getElementById('usePesoIA').checked) atualizarPesosFatores();
}

function fmtHora(sec) {
    const d = new Date(sec * 1000), p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============================================================================
// BLOCO 6 — GRÁFICOS (montados uma vez; atualizados de forma incremental)
// ============================================================================

function opcoesBase() {
    // Tema QUANT OPS: cores vêm de CORES_TEMA (respeita o toggle claro/escuro)
    const c = CORES_TEMA[temaAtual()];
    return {
        layout: { background: { color: c.bg }, textColor: c.text },
        grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
        rightPriceScale: { borderColor: c.border },
        timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, tickMarkFormatter: t => fmtHora(t) },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        localization: { timeFormatter: t => fmtHora(t) }
    };
}

// Altura do gráfico principal: 500px padrão; no modo ampliado (⛶, persistido)
// ocupa ~72% da janela — leitura confortável das zonas/LTs/rótulos.
function alturaChartPreco() {
    // padrão 1200px; ⛶ alterna para o modo compacto (500px)
    let h = localStorage.getItem('chartAlto') === '0' ? 500 : 1200;
    // No celular 1200px rola demais: limita a ~60% da altura da tela.
    if (window.innerWidth <= 760) h = Math.max(320, Math.round(window.innerHeight * 0.6));
    document.documentElement.style.setProperty('--chart-h', h + 'px');   // container acompanha
    return h;
}

function montarGraficos() {
    if (graficosMontados) return;

    chartPreco = LightweightCharts.createChart(document.getElementById('chartPreco'), { ...opcoesBase(), height: alturaChartPreco() });
    serieVelas = chartPreco.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a',
        borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350'
    });
    // Volume no rodapé do gráfico (estilo TradingView): histograma verde/vermelho
    // num eixo próprio invisível, comprimido no 1/4 inferior (não atrapalha as velas).
    serieVolume = chartPreco.addHistogramSeries({
        priceFormat: { type: 'volume' }, priceScaleId: 'vol',
        priceLineVisible: false, lastValueVisible: false
    });
    chartPreco.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    // Séries EMA — paleta escura validada (dataviz): azul, amarelo, violeta
    serieEma9 = chartPreco.addLineSeries({ color: '#3987e5', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    serieEma21 = chartPreco.addLineSeries({ color: '#c98500', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    serieEma200 = chartPreco.addLineSeries({ color: '#9085e9', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });

    chartRsi = LightweightCharts.createChart(document.getElementById('chartRsi'), { ...opcoesBase(), height: 190 });
    serieRsi = chartRsi.addLineSeries({ color: '#e66767', lineWidth: 2, priceLineVisible: false });
    const sobrec = parseInt(document.getElementById('rsiSobrecompra').value);
    const sobrev = parseInt(document.getElementById('rsiSobrevenda').value);
    serieRsi.createPriceLine({ price: sobrec, color: 'rgba(255,255,255,0.25)', lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: String(sobrec) });
    serieRsi.createPriceLine({ price: sobrev, color: 'rgba(255,255,255,0.25)', lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: String(sobrev) });

    chartAtr = LightweightCharts.createChart(document.getElementById('chartAtr'), { ...opcoesBase(), height: 190 });
    serieAtr = chartAtr.addLineSeries({ color: '#199e70', lineWidth: 2, priceLineVisible: false });
    serieAtrMedia = chartAtr.addLineSeries({ color: '#86b6ef', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });

    // Curva de capital (baseline em 0: verde acima, vermelho abaixo)
    chartEquity = LightweightCharts.createChart(document.getElementById('chartEquity'), { ...opcoesBase(), height: 200 });
    serieEquity = chartEquity.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topLineColor: '#0ca30c', topFillColor1: 'rgba(12,163,12,0.28)', topFillColor2: 'rgba(12,163,12,0.05)',
        bottomLineColor: '#d03b3b', bottomFillColor1: 'rgba(208,59,59,0.05)', bottomFillColor2: 'rgba(208,59,59,0.28)',
        priceLineVisible: false
    });

    // Fluxo de volume: histograma do delta compra−venda por vela
    chartFluxo = LightweightCharts.createChart(document.getElementById('chartFluxo'), { ...opcoesBase(), height: 190 });
    serieFluxo = chartFluxo.addHistogramSeries({ priceFormat: { type: 'volume' }, priceLineVisible: false });

    sincronizarTempo([chartPreco, chartRsi, chartAtr, chartFluxo]);
    graficosMontados = true;
}

function barraFluxo(c) {
    const d = deltaPorVela(c);
    return { time: c.time, value: d, color: d >= 0 ? 'rgba(38,166,154,0.75)' : 'rgba(239,83,80,0.75)' };
}

// Barra de volume no rodapé do gráfico (verde = vela de alta · vermelho = baixa),
// como no TradingView. Usa o volume real da vela; sem volume, cai p/ o range.
function barraVolume(c) {
    const alta = c.close >= c.open;
    const v = c.volume != null && c.volume > 0 ? c.volume : Math.abs(c.high - c.low);
    return { time: c.time, value: v, color: alta ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)' };
}

let sincronizando = false;
function sincronizarTempo(charts) {
    // FLUIDEZ: o arrasto dispara dezenas de eventos/s e cada um redesenhava os
    // 4 gráficos. Coalesce em rAF: aplica só o range mais recente, 1×/frame.
    let syncPend = null, syncRaf = false;
    charts.forEach(src => {
        src.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (sincronizando || !range) return;
            syncPend = { src, range };
            if (syncRaf) return;
            syncRaf = true;
            requestAnimationFrame(() => {
                syncRaf = false;
                if (!syncPend) return;
                const { src: s, range: r } = syncPend; syncPend = null;
                sincronizando = true;
                charts.forEach(t => { if (t !== s) t.timeScale().setVisibleLogicalRange(r); });
                sincronizando = false;
            });
        });
    });
}

function toLine(times, vals) {
    const out = [];
    for (let i = 0; i < vals.length; i++)
        if (vals[i] !== null && vals[i] !== undefined) out.push({ time: times[i], value: vals[i] });
    return out;
}

// Redesenho completo (carga histórica ou troca de símbolo/timeframe/fonte)
function redesenharTudo(ajustarZoom) {
    montarGraficos();
    recomputarIndicadores();
    recomputarSinais();
    recomputarEntradas();

    const times = dados.map(d => d.time);
    serieVelas.setData(dados.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })));
    serieEma9.setData(toLine(times, computed.emaR));
    serieEma21.setData(toLine(times, computed.emaL));
    serieEma200.setData(document.getElementById('useEma200').checked ? toLine(times, computed.ema200) : []);
    serieRsi.setData(toLine(times, computed.rsiValues));
    serieAtr.setData(toLine(times, computed.atrValues));
    serieAtrMedia.setData(toLine(times, computed.atrMedia));
    serieVolume.setData(dados.map(barraVolume));
    serieFluxo.setData(dados.map(barraFluxo));

    atualizarMarcadores();
    atualizarPaineis();
    atualizarLegenda();
    // alertas de preço do símbolo aberto voltam ao gráfico (bloco 30)
    try { if (typeof alertasRedesenhar === 'function') alertasRedesenhar(); } catch (e) { }

    if (ajustarZoom) {
        chartPreco.timeScale().fitContent();
        chartRsi.timeScale().fitContent();
        chartAtr.timeScale().fitContent();
        chartFluxo.timeScale().fitContent();
        // Carga completa: (re)carrega a tendência do TF maior e reavalia os sinais
        if (document.getElementById('useHtf').checked) carregarHtf().then(recalcularSinaisApenas);
    }
}

// Atualização incremental de UM candle (streaming ao vivo)
// Coalescência de ticks: em rajada (WS manda vários ticks por segundo, ainda
// mais no Crypto IDX que combina 5 streams), fazer a recomputação completa em
// cada um desperdiça CPU e trava a UI. Agrupamos por FRAME (requestAnimationFrame)
// e recomputamos no máximo 1×/frame. O fechamento de vela nunca é perdido: o
// flag "fechou" é acumulado (OR) até o flush.
let _tickPend = false, _tickFechou = false, _tickUltimoT = 0, _paineisPesadosT = 0;
function agendarTick(fechou) {
    _tickFechou = _tickFechou || fechou;
    if (_tickPend) return;
    _tickPend = true;
    // FLUIDEZ: tick intra-vela coalescido a ≤4/s (recomputar indicadores a cada
    // frame engasgava a tela); fechamento de vela continua imediato.
    const espera = _tickFechou ? 0 : Math.max(0, 250 - (Date.now() - _tickUltimoT));
    setTimeout(() => requestAnimationFrame(() => {
        _tickPend = false; _tickUltimoT = Date.now();
        const f = _tickFechou; _tickFechou = false;
        // Aba oculta: tick intra-vela nem desenha (os dados já estão em `dados`;
        // ao voltar, o listener abaixo redesenha). Fechamento de vela SEMPRE roda
        // (registro/alertas dependem dele).
        if (document.hidden && !f) return;
        // Guarda: um erro no tick não pode derrubar o gráfico ao vivo.
        try { atualizarUltimoCandle(f); } catch (e) { QLOG.erro('tick:', e); }
    }), espera);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && dados && dados.length) agendarTick(false); });
// Título do gráfico reflete par/TF/fonte na hora que qualquer um deles muda
document.addEventListener('DOMContentLoaded', function () {
    ['symbol', 'timeframe', 'fonte', 'parPopular'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { try { atualizarTituloGrafico(); } catch (e) { } });
    });
    try { atualizarTituloGrafico(); } catch (e) { }
});

function atualizarUltimoCandle(fechou) {
    if (!dados || !dados.length || !serieVelas) return;   // feed vazio: nada a atualizar
    recomputarIndicadores();
    const last = dados.length - 1;
    const t = dados[last].time;
    serieVelas.update({ time: t, open: dados[last].open, high: dados[last].high, low: dados[last].low, close: dados[last].close });
    if (serieVolume) serieVolume.update(barraVolume(dados[last]));
    const upd = (serie, val) => { if (val !== null && val !== undefined) serie.update({ time: t, value: val }); };
    upd(serieEma9, computed.emaR[last]);
    upd(serieEma21, computed.emaL[last]);
    if (document.getElementById('useEma200').checked) upd(serieEma200, computed.ema200[last]);
    upd(serieRsi, computed.rsiValues[last]);
    upd(serieAtr, computed.atrValues[last]);
    upd(serieAtrMedia, computed.atrMedia[last]);
    serieFluxo.update(barraFluxo(dados[last]));
    atualizarLegenda();
    // alertas de preço: dispara quando o preço cruza um nível marcado (bloco 30)
    try { if (typeof alertasVerificar === 'function') alertasVerificar(); } catch (e) { }

    if (fechou) {
        recomputarSinais();
        recomputarEntradas();
        atualizarMarcadores();
        atualizarPaineis();
    }
}

function atualizarMarcadores() {
    // FLUIDEZ: o gráfico redesenha TODOS os marcadores a cada frame (tick, zoom,
    // crosshair). Centenas de textos deixavam tudo lento e ilegível: mantemos os
    // 150 sinais mais recentes e SÓ os últimos 40 carregam texto (os antigos
    // ficam como setas — a tabela 🔔 Avisos continua com o histórico completo).
    // LIMPEZA: os textos "CALL 3/6 • 5m" espalhados poluíam o gráfico. Agora só
    // SETAS pequenas (últimos 80 sinais) e texto SÓ no mais recente (o acionável);
    // o histórico completo com detalhes fica na tabela 🔔 Avisos de Entrada.
    const rec = entradas.slice(-80);
    const marc = rec.map((e, i) => ({
        time: dados[e.index].time,
        position: e.dir === 'CALL' ? 'belowBar' : 'aboveBar',
        color: e.dir === 'CALL' ? 'rgba(38,166,154,0.9)' : 'rgba(239,83,80,0.9)',
        shape: e.dir === 'CALL' ? 'arrowUp' : 'arrowDown',
        size: 1,
        text: i === rec.length - 1 ? `${e.dir} ${e.score}/${e.enabled}` : undefined
    }));
    // Zonas S/R ligadas (bloco 28): rótulos HH/HL/LH/LL nos pivôs + reposiciona as faixas
    try {
        if (typeof zonasSRAtivas !== 'undefined' && zonasSRAtivas) {
            marc.push(...marcadoresEstrutura());
            reposicionarZonas();
        }
    } catch (e) { }
    serieVelas.setMarkers(marc.sort((a, b) => a.time - b.time));
}

// Título do gráfico: QUAL par/TF/fonte está sendo analisado (atualiza no topo)
function atualizarTituloGrafico() {
    const el = document.getElementById('chartTitulo');
    if (!el) return;
    const sym = symbolAtual();
    const lbl = sym === 'CRYPTOIDX' ? 'Crypto IDX (proxy Binomo)' : PARES_YAHOO[sym] ? PARES_YAHOO[sym].label : sym;
    const tf = typeof rotTf === 'function' ? rotTf(tfMinutes()) : 'M' + tfMinutes();
    const fMap = { binance: 'Binance', twelvedata: 'Twelve Data', yahoo: 'Yahoo', ambos: 'Binance+TD', ambos3: 'Binance+TD+Yahoo', sim: 'Simulado' };
    const src = fMap[fonte()] || fonte();
    const txt = `${lbl} · ${tf} · ${src}`;
    if (el.dataset.txt === txt) return;   // evita reescrever a cada tick
    el.dataset.txt = txt;
    el.innerHTML = `<strong class="ct-par">${lbl}</strong><span class="ct-meta">${tf} · ${src}</span>`;
}

function atualizarLegenda() {
    atualizarTituloGrafico();
    const last = dados.length - 1;
    if (last < 0) return;
    const fmt = v => (v === null || v === undefined) ? '–' : (+v).toFixed(4);
    const d = dados[last];
    document.getElementById('legendPreco').innerHTML =
        `<span class="lg lg-close">O ${d.open} · H ${d.high} · L ${d.low} · C ${d.close}</span>` +
        `<span class="lg lg-ema9">EMA ${document.getElementById('emaRapida').value}: ${fmt(computed.emaR[last])}</span>` +
        `<span class="lg lg-ema21">EMA ${document.getElementById('emaLenta').value}: ${fmt(computed.emaL[last])}</span>` +
        (document.getElementById('useEma200').checked ? `<span class="lg lg-ema200">EMA 200: ${fmt(computed.ema200[last])}</span>` : '');
}

// ============================================================================
// BLOCO 7 — PAINÉIS (status + tabela de entradas)
// ============================================================================

// Micro-interações: reanima uma classe CSS (remove → reflow → adiciona) para o
// efeito disparar de novo mesmo quando o elemento já a tinha.
function reanimar(el, cls) {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}
// Atualiza um texto numérico e pisca verde/vermelho conforme subiu/caiu.
function setTextoFlash(el, valor) {
    if (!el) return;
    const antigo = el.textContent, novo = String(valor);
    if (antigo === novo) return;
    el.textContent = novo;
    if (!antigo) return;   // primeira pintura não pisca
    const na = parseFloat(antigo), nv = parseFloat(novo);
    if (isNaN(na) || isNaN(nv) || na === nv) return;
    reanimar(el, nv > na ? 'val-up' : 'val-down');
}

function atualizarPaineis() {
    if (!computed || !computed.closes || !computed.closes.length) return;
    document.getElementById('countLong').textContent = sinaisLong.length;
    document.getElementById('countShort').textContent = sinaisShort.length;

    const last = computed.closes.length - 1;
    let bias = 'NEUTRO';
    const er = computed.emaR[last], el = computed.emaL[last], e2 = computed.ema200[last], cl = computed.closes[last];
    if (er !== null && el !== null && e2 !== null) {
        if (er > el && cl > e2) bias = '🟢 ALTA';
        else if (er < el && cl < e2) bias = '🔴 BAIXA';
    }
    document.getElementById('currentBias').textContent = bias;

    // Estudos de Mercado acompanha os recálculos quando já está aberto
    if (document.getElementById('estudoPanel').style.display === 'block') renderEstudo();

    // Medidor de confluência ao vivo (pontuação na última vela)
    const en = confLive.enabled || 1;
    document.getElementById('confBarCall').style.width = Math.round(confLive.long / en * 100) + '%';
    document.getElementById('confBarPut').style.width = Math.round(confLive.short / en * 100) + '%';
    setTextoFlash(document.getElementById('confScoreCall'), confLive.long + '/' + confLive.enabled);
    setTextoFlash(document.getElementById('confScorePut'), confLive.short + '/' + confLive.enabled);

    const fs = document.getElementById('filtersStatus');
    fs.innerHTML = '';
    [
        { n: 'Tendência (EMA)', e: document.getElementById('useTendencia').checked },
        { n: 'Macro (EMA200)', e: document.getElementById('useEma200').checked },
        { n: 'Momentum (RSI)', e: document.getElementById('useMomentum').checked },
        { n: 'Volatilidade (ATR)', e: document.getElementById('useVolatilidade').checked },
        { n: 'Estrutura', e: document.getElementById('useEstrutura').checked }
    ].forEach(f => {
        const div = document.createElement('div');
        div.className = 'filter-item';
        div.innerHTML = `<span>${f.n}</span><span class="filter-status-icon ${f.e ? 'filter-status-ok' : 'filter-status-disabled'}">${f.e ? '✓' : '–'}</span>`;
        fs.appendChild(div);
    });

    // Filtro de notícias: bloqueia/avisa entradas perto de notícia da moeda
    const useNewsFilter = document.getElementById('useNewsFilter').checked;
    const newsJanela = parseInt(document.getElementById('newsJanela').value);
    const bloqueada = e => useNewsFilter && noticiaProxima(e.entryTime, newsJanela);

    // Banner de risco de notícia (sobre a vela mais recente)
    const banner = document.getElementById('newsRiskBanner');
    const lastT = dados.length ? dados[dados.length - 1].time : 0;
    if (useNewsFilter && lastT && noticiaProxima(lastT, newsJanela)) {
        banner.style.display = 'block';
        banner.innerHTML = '⚠️ <strong>Notícia recente sobre ' + baseAsset() + '</strong> — evite novas entradas agora (filtro de notícias ativo).';
    } else {
        banner.style.display = 'none';
    }

    const tbody = document.getElementById('entryTableBody');
    tbody.innerHTML = '';
    [...entradas].reverse().slice(0, 30).forEach((e, idx) => {
        const tr = document.createElement('tr');
        const dc = e.dir === 'CALL' ? 'dir-call' : 'dir-put';
        const bloq = bloqueada(e);
        const rc = bloq ? 'res-block' : e.resultado === 'WIN' ? 'res-win' : e.resultado === 'LOSS' ? 'res-loss' : 'res-pend';
        if (bloq) tr.className = 'row-blocked';
        tr.innerHTML =
            `<td>${entradas.length - idx}</td><td>${fmtHora(e.entryTime)}</td>` +
            `<td class="${dc}">${e.dir === 'CALL' ? '▲ CALL' : '▼ PUT'}</td>` +
            `<td>${e.entryPrice}</td>` +
            `<td class="cell-fatores">${e.fatores} <b>(${e.score}/${e.enabled})</b></td>` +
            `<td>${e.expMin} min</td><td>${fmtHora(e.expTime)}</td>` +
            `<td class="${rc}">${bloq ? '⚠ EVITAR' : e.resultado}</td>`;
        tbody.appendChild(tr);
    });

    // Win rate ignora entradas bloqueadas por notícia
    const validas = entradas.filter(e => !bloqueada(e));
    const aval = validas.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    const wins = validas.filter(e => e.resultado === 'WIN').length;
    const losses = validas.filter(e => e.resultado === 'LOSS').length;
    const pend = validas.filter(e => e.resultado === 'pendente').length;
    const bloqueadas = entradas.length - validas.length;
    const wr = aval.length ? ((wins / aval.length) * 100).toFixed(1) : '–';
    document.getElementById('entrySummary').innerHTML =
        `<span class="sum-item">Total entradas: <strong>${entradas.length}</strong></span>` +
        `<span class="sum-item sum-win">WIN: <strong>${wins}</strong></span>` +
        `<span class="sum-item sum-loss">LOSS: <strong>${losses}</strong></span>` +
        `<span class="sum-item sum-pend">Pendentes: <strong>${pend}</strong></span>` +
        (bloqueadas ? `<span class="sum-item sum-block">Evitadas (notícia): <strong>${bloqueadas}</strong></span>` : '') +
        `<span class="sum-item sum-rate">Win rate: <strong>${wr}${wr === '–' ? '' : '%'}</strong></span>`;

    // Métricas de análise (backtest) sobre as entradas não bloqueadas
    calcularMetricas(validas);

    // Painel de Decisão (depende de confLive + byScoreGlobal recém-calculados)
    atualizarDecisao();

    // QUANT OPS: barra executiva + painéis de inteligência
    atualizarQuantOps();

    // Pressão de compra×venda por par (janela do fluxo)
    atualizarPressaoPares();
}

// ============================================================================
// QUANT OPS — barra executiva + Price Action + Volume/Delta + Análise da Operação
// ============================================================================

function kv(nome, valor, cls) { return `<div class="kv ${cls || ''}"><span>${nome}</span><b>${valor}</b></div>`; }

// ---- LIQUIDITY ENGINE (aproximação via OHLC) ----
// Pools de liquidez = clusters de topos/fundos quase iguais (equal highs/lows):
// é onde os stops se acumulam. Sweep = pavio que varre o pool e fecha de volta.
function analisarLiquidez() {
    const { highs, lows, closes, atrValues } = computed;
    const last = closes.length - 1;
    const atr = atrValues[last] || (highs[last] - lows[last]) || 1e-9;
    const tol = atr * 0.25;
    const piv = acharPivotsSR();
    const cluster = arr => {
        const pools = []; let cur = [];
        arr.slice().sort((a, b) => a.price - b.price).forEach(p => {
            if (!cur.length || Math.abs(p.price - cur[cur.length - 1].price) <= tol) cur.push(p);
            else { pools.push(cur); cur = [p]; }
        });
        if (cur.length) pools.push(cur);
        return pools.map(c => ({
            price: c.reduce((s, p) => s + p.price, 0) / c.length,
            touches: c.length, lastIdx: Math.max(...c.map(p => p.i))
        })).filter(p => p.touches >= 2);
    };
    const poolsHigh = cluster(piv.res), poolsLow = cluster(piv.sup);
    const preco = closes[last];
    const acima = poolsHigh.filter(p => p.price > preco);
    const abaixo = poolsLow.filter(p => p.price < preco);
    // sweep nas últimas 12 velas: rompe o pool no pavio e fecha de volta
    let sweep = null;
    for (let i = Math.max(1, last - 12); i <= last; i++) {
        for (const p of poolsHigh)
            if (p.lastIdx + SR_W <= i && highs[i] > p.price + tol * 0.2 && closes[i] < p.price) sweep = { dir: -1, i, price: p.price };
        for (const p of poolsLow)
            if (p.lastIdx + SR_W <= i && lows[i] < p.price - tol * 0.2 && closes[i] > p.price) sweep = { dir: 1, i, price: p.price };
    }
    let mitig = null;
    if (sweep) {
        mitig = 'Pendente';
        for (let j = sweep.i + 1; j <= last; j++)
            if ((sweep.dir === 1 && closes[j] > sweep.price + atr * 0.5) ||
                (sweep.dir === -1 && closes[j] < sweep.price - atr * 0.5)) { mitig = 'Concluída'; break; }
    }
    return { acima, abaixo, sweep, mitig };
}

// ---- SMART MONEY ENGINE (aproximação via OHLC) ----
// Order Block = última vela contrária antes de um impulso ≥1.2 ATR; ativo
// enquanto o preço não voltar à zona. FVG = gap de 3 velas ainda não preenchido.
function analisarSmartMoney() {
    const { highs, lows, closes, atrValues } = computed;
    const last = closes.length - 1;
    const ini = Math.max(3, last - 150);
    const obs = [], fvgs = [];
    for (let i = ini; i <= last; i++) {
        if (i >= 2) {
            if (lows[i] > highs[i - 2]) fvgs.push({ dir: 1, top: lows[i], bot: highs[i - 2], i });
            if (highs[i] < lows[i - 2]) fvgs.push({ dir: -1, top: lows[i - 2], bot: highs[i], i });
        }
        const atr = atrValues[i];
        if (atr && i + 3 <= last) {
            const o = dados[i].open;
            if (closes[i] < o && Math.max(closes[i + 1], closes[i + 2], closes[i + 3]) - closes[i] > atr * 1.2)
                obs.push({ dir: 1, top: Math.max(o, closes[i]), bot: lows[i], i });       // OB de demanda
            if (closes[i] > o && closes[i] - Math.min(closes[i + 1], closes[i + 2], closes[i + 3]) > atr * 1.2)
                obs.push({ dir: -1, top: highs[i], bot: Math.min(o, closes[i]), i });     // OB de oferta
        }
    }
    const naoMitigado = z => { for (let j = z.i + 4; j <= last; j++) if (lows[j] <= z.top && highs[j] >= z.bot) return false; return true; };
    const fvgAberto = z => {
        for (let j = z.i + 1; j <= last; j++) {
            if (z.dir === 1 && lows[j] <= z.bot) return false;
            if (z.dir === -1 && highs[j] >= z.top) return false;
        }
        return true;
    };
    return { obsAtivos: obs.filter(naoMitigado).slice(-8), fvgAbertos: fvgs.filter(fvgAberto).slice(-8) };
}

// Rotula os últimos swings (HH/HL/LH/LL) a partir dos pivôs confirmados
function estruturaSwings() {
    const piv = acharPivotsSR();
    const todos = [
        ...piv.res.map(p => ({ i: p.i, price: p.price, tipo: 'H' })),
        ...piv.sup.map(p => ({ i: p.i, price: p.price, tipo: 'L' }))
    ].sort((a, b) => a.i - b.i).slice(-6);
    const rotulos = [];
    let prevH = null, prevL = null, uH = null, uL = null;
    todos.forEach(p => {
        if (p.tipo === 'H') { uH = prevH == null ? null : p.price > prevH ? 'HH' : 'LH'; if (uH) rotulos.push(uH); prevH = p.price; }
        else { uL = prevL == null ? null : p.price > prevL ? 'HL' : 'LL'; if (uL) rotulos.push(uL); prevL = p.price; }
    });
    // uH/uL = rótulo do ÚLTIMO topo e do ÚLTIMO fundo — quem define a estrutura
    return { rotulos: rotulos.slice(-4), todos, uH, uL };
}

// ---- Definição da ESTRUTURA de price action (Dow/SMC) ----
// Mandam os rótulos MAIS RECENTES de topo (uH) e fundo (uL):
//   HH + HL = Alta · LH + LL = Baixa · LH + HL = Compressão · HH + LL = Expansão.
// Se o swing mais novo CONTRADIZ a maioria anterior, é virada em curso (CHoCH):
// ex.: HL·HH (alta) seguidos de LH·LL = "Virando p/ baixa", não "indefinida".
function definirEstrutura(sw) {
    let nome = 'Indefinida', dir = 0;
    if (sw.uH && sw.uL) {
        if (sw.uH === 'HH' && sw.uL === 'HL') { nome = 'Alta (HH+HL)'; dir = 1; }
        else if (sw.uH === 'LH' && sw.uL === 'LL') { nome = 'Baixa (LH+LL)'; dir = -1; }
        else if (sw.uH === 'LH' && sw.uL === 'HL') { nome = 'Compressão (LH+HL)'; dir = 0; }
        else if (sw.uH === 'HH' && sw.uL === 'LL') { nome = 'Expansão (HH+LL)'; dir = 0; }
    }
    const rots = sw.rotulos;
    if (rots.length >= 3) {
        const novo = rots[rots.length - 1], antes = rots.slice(0, -1);
        const bullAntes = antes.filter(r => r === 'HH' || r === 'HL').length;
        const bearAntes = antes.filter(r => r === 'LH' || r === 'LL').length;
        if ((novo === 'LH' || novo === 'LL') && bullAntes > bearAntes) { nome = 'Virando p/ baixa (CHoCH)'; dir = -1; }
        else if ((novo === 'HH' || novo === 'HL') && bearAntes > bullAntes) { nome = 'Virando p/ alta (CHoCH)'; dir = 1; }
    }
    return { nome, dir };
}

// Escreve o texto e pisca sutilmente quando o VALOR mudou (feedback "vivo" da
// topbar; transform+brightness num span minúsculo = custo desprezível)
function _setFlash(el, txt) {
    if (!el || el.textContent === txt) return;
    el.textContent = txt;
    el.classList.remove('qo-flash');
    void el.offsetWidth;   // reinicia a animação
    el.classList.add('qo-flash');
}

function atualizarQuantOps() {
    if (!computed || !computed.closes || !computed.closes.length) return;
    const last = computed.closes.length - 1;
    const cl = confLive, en = cl.enabled || 1;
    const dom = Math.max(cl.long, cl.short);
    const dirDom = cl.long >= cl.short ? 1 : -1;
    const conf = Math.round(dom / en * 100);

    // ---- topbar ----
    const mercado = document.getElementById('qoMercado');
    const biasTxt = cl.long > cl.short ? 'BULLISH' : cl.short > cl.long ? 'BEARISH' : 'NEUTRO';
    _setFlash(mercado, biasTxt);
    mercado.className = 'qo-big ' + (biasTxt === 'BULLISH' ? 'qo-good' : biasTxt === 'BEARISH' ? 'qo-bad' : '');
    _setFlash(document.getElementById('qoConf'), conf + '%');
    document.getElementById('qoRing').style.background =
        `conic-gradient(${dirDom === 1 ? 'var(--call)' : 'var(--put)'} ${conf * 3.6}deg, var(--grid) 0deg)`;
    const regs = regimePorBarra();
    _setFlash(document.getElementById('qoRegime'), REGIME_ROTULO[regs[last]] || '—');
    const atrR = (computed.atrValues[last] != null && computed.atrMedia[last] != null)
        ? computed.atrValues[last] / computed.atrMedia[last] : null;
    _setFlash(document.getElementById('qoVolat'), atrR == null ? '—' : atrR >= 1.3 ? 'Alta' : atrR <= 0.75 ? 'Baixa' : 'Média');
    _setFlash(document.getElementById('qoSessao'), dados.length ? sessaoDe(dados[last].time) : '—');
    // aprovadas/bloqueadas: entradas do histórico fora/dentro da janela de notícia
    const newsOn = document.getElementById('useNewsFilter').checked;
    const newsJan = lerNum('newsJanela');
    const bloqueadas = newsOn ? entradas.filter(e => noticiaProxima(e.entryTime, newsJan)).length : 0;
    _setFlash(document.getElementById('qoAprov'), String(entradas.length - bloqueadas));
    _setFlash(document.getElementById('qoBloq'), String(bloqueadas));
    const exEl = document.getElementById('qoExpect');
    if (metricasAtuais) {
        const v = parseFloat(metricasAtuais.expect);
        exEl.textContent = (v >= 0 ? '+' : '') + v.toFixed(2) + 'R';
        exEl.className = v >= 0 ? 'qo-good' : 'qo-bad';
    } else { exEl.textContent = '—'; exEl.className = ''; }

    // ---- PRICE ACTION ----
    const sw = estruturaSwings();
    const seq = sw.rotulos.join(' · ') || '—';
    const ed = definirEstrutura(sw);
    const estrut = ed.nome;
    // BOS: rompimento de estrutura nas últimas 5 velas (sinal E presente)
    const bosRecente = [...sinaisLong, ...sinaisShort].some(s => s.index >= last - 5 && /E/.test(s.fatores));
    // correção: retração desde o último extremo relevante
    let correcao = null;
    const ultH = sw.todos.filter(p => p.tipo === 'H').slice(-1)[0];
    const ultL = sw.todos.filter(p => p.tipo === 'L').slice(-1)[0];
    if (ultH && ultL && ultH.price !== ultL.price) {
        const c = computed.closes[last];
        correcao = ed.dir === 1
            ? Math.round((ultH.price - c) / (ultH.price - ultL.price) * 100)
            : Math.round((c - ultL.price) / (ultH.price - ultL.price) * 100);
        correcao = Math.max(0, Math.min(100, correcao));
    }
    const pullOk = ed.dir !== 0 && correcao != null && correcao >= 20 && correcao <= 62;
    document.getElementById('qoPA').innerHTML =
        kv('Estrutura', estrut, ed.dir === 1 ? 'kv-good' : ed.dir === -1 ? 'kv-bad' : /Compressão|Expansão/.test(estrut) ? 'kv-warn' : '') +
        kv('Últimos swings', seq) +
        kv('BOS', bosRecente ? 'Confirmado' : '—', bosRecente ? 'kv-good' : '') +
        kv('Força da tendência', conf + '%', conf >= 70 ? 'kv-good' : conf >= 50 ? 'kv-warn' : 'kv-bad') +
        kv('Correção', correcao == null ? '—' : correcao + '%') +
        kv('Pullback saudável', correcao == null ? '—' : pullOk ? 'SIM' : 'NÃO', pullOk ? 'kv-good' : '');

    // ---- LIQUIDEZ ----
    const liq = analisarLiquidez();
    const fmtP = v => v.toFixed(computed.closes[last] < 10 ? 5 : 2);
    const proxAcima = liq.acima.length ? liq.acima.sort((a, b) => a.price - b.price)[0] : null;
    const proxAbaixo = liq.abaixo.length ? liq.abaixo.sort((a, b) => b.price - a.price)[0] : null;
    document.getElementById('qoLiq').innerHTML =
        kv('Pools acima (stops de venda)', liq.acima.length + (proxAcima ? ' · próx ' + fmtP(proxAcima.price) : '')) +
        kv('Pools abaixo (stops de compra)', liq.abaixo.length + (proxAbaixo ? ' · próx ' + fmtP(proxAbaixo.price) : '')) +
        kv('Sweep detectado', liq.sweep ? (liq.sweep.dir === 1 ? 'SIM · fundo varrido ▲' : 'SIM · topo varrido ▼') : 'Não',
            liq.sweep ? (liq.sweep.dir === 1 ? 'kv-good' : 'kv-bad') : '') +
        kv('Mitigação', liq.mitig || '—', liq.mitig === 'Pendente' ? 'kv-warn' : '');

    // ---- SMART MONEY ----
    const sm = analisarSmartMoney();
    const obComp = sm.obsAtivos.filter(z => z.dir === 1).length;
    const obVend = sm.obsAtivos.filter(z => z.dir === -1).length;
    const fvgComp = sm.fvgAbertos.filter(z => z.dir === 1).length;
    const fvgVend = sm.fvgAbertos.filter(z => z.dir === -1).length;
    // direção institucional: voto entre OBs ativos, FVGs abertos e sweep
    let votos = (obComp - obVend) + (fvgComp - fvgVend) + (liq.sweep ? liq.sweep.dir * 2 : 0);
    const dirInst = votos > 0 ? 'Compra' : votos < 0 ? 'Venda' : '—';
    document.getElementById('qoSM').innerHTML =
        kv('Order Blocks ativos', sm.obsAtivos.length + ' (▲' + obComp + ' · ▼' + obVend + ')') +
        kv('FVGs abertos', sm.fvgAbertos.length + ' (▲' + fvgComp + ' · ▼' + fvgVend + ')') +
        kv('Direção Institucional', dirInst, dirInst === 'Compra' ? 'kv-good' : dirInst === 'Venda' ? 'kv-bad' : '') +
        kv('Confluência', conf + '%', conf >= 70 ? 'kv-good' : '');

    // ---- VOLUME / DELTA ----
    const janF = Math.max(2, parseInt(document.getElementById('fluxoJanela').value));
    const dj = deltaNaJanela(dados, last, janF);
    const temVol = dj.tot > 0;
    const volMed = dados.slice(Math.max(0, last - 20), last).reduce((s, d) => s + (d.volume || 0), 0) / Math.min(20, last || 1);
    const volNivel = !temVol ? '—' : (dados[last].volume || 0) > volMed * 1.3 ? 'Alto' : (dados[last].volume || 0) < volMed * 0.7 ? 'Baixo' : 'Normal';
    const forcaCompra = temVol ? Math.round(dj.buy / dj.tot * 100) : null;
    const pat = padraoVela(last);
    document.getElementById('qoVol').innerHTML =
        kv('Volume', volNivel, volNivel === 'Alto' ? 'kv-good' : '') +
        kv('Delta', !temVol ? '—' : dj.dir === 1 ? 'Comprador' : dj.dir === -1 ? 'Vendedor' : 'Equilibrado', dj.dir === 1 ? 'kv-good' : dj.dir === -1 ? 'kv-bad' : '') +
        kv('Força compradora', forcaCompra == null ? '—' : forcaCompra + '%', forcaCompra >= 55 ? 'kv-good' : forcaCompra <= 45 && forcaCompra != null ? 'kv-bad' : '') +
        kv('Padrão de vela', pat.up ? 'Reversão de ALTA' : pat.down ? 'Reversão de BAIXA' : pat.inside ? 'Inside (compressão)' : '—',
            pat.up ? 'kv-good' : pat.down ? 'kv-bad' : pat.inside ? 'kv-warn' : '') +
        kv('Convicção do padrão', pat.forca === 2 ? 'Alta' : pat.forca === 1 ? 'Média' : '—');

    // ---- ANÁLISE DA OPERAÇÃO ----
    const alvo = cl.confMode === 'estrita' ? en : Math.min(cl.minScore, en);
    const temSinal = dom >= alvo && cl.long !== cl.short;
    const banner = document.getElementById('qoBanner');
    if (temSinal) {
        const g = calcularGrade(dirDom);
        const expectOp = g.expOp;
        document.getElementById('qoOp').innerHTML =
            kv('Direção', dirDom === 1 ? '▲ COMPRA (CALL)' : '▼ VENDA (PUT)', dirDom === 1 ? 'kv-good' : 'kv-bad') +
            kv('Score', g.score + '/100 ' + '⭐'.repeat(g.estrelas)) +
            kv('Probabilidade', g.pEst == null ? '—' : Math.round(g.pEst * 100) + '%' + (g.pLB != null ? ' (LB ' + pctTxt(g.pLB) + ')' : ''), g.pLB != null && g.pLB >= 0.55 ? 'kv-good' : '') +
            kv('Amostra', g.pN ? g.pN + ' ops' + (g.pN < 10 ? ' ⚠ pequena' : '') : '—', g.pN >= 10 ? 'kv-good' : '') +
            kv('Expectancy', expectOp == null ? '—' : (expectOp >= 0 ? '+' : '') + expectOp.toFixed(2) + 'R' + (g.expOpLB != null ? ' (LB ' + (g.expOpLB >= 0 ? '+' : '') + g.expOpLB.toFixed(2) + ')' : ''), g.expOpLB != null && g.expOpLB >= 0 ? 'kv-good' : 'kv-bad') +
            kv('Risco sugerido (½ Kelly)', g.kelly == null ? '—' : (g.kelly * 100).toFixed(2) + '%') +
            kv('Expiração', expMinutes() + 'm');
        // Aprova só com expectativa positiva no LIMITE INFERIOR (evidência, não sorte)
        const aprovada = g.grade !== 'C' && (g.expOpLB == null || g.expOpLB >= 0);
        banner.style.display = 'block';
        banner.className = 'qo-banner ' + (aprovada ? 'ok' : 'no');
        banner.textContent = aprovada ? '✓ OPERAÇÃO APROVADA' : '✕ OPERAÇÃO BLOQUEADA';
    } else {
        document.getElementById('qoOp').innerHTML =
            kv('Direção', '— aguardando confluência') +
            kv('CALL', cl.long + '/' + en) + kv('PUT', cl.short + '/' + en) +
            kv('Mínimo p/ sinal', alvo + ' fatores');
        banner.style.display = 'none';
    }
}

// ---- HEATMAP DE ATIVOS (alimentado pelo scanner) ----
let heatData = [];
function renderHeat() {
    const panel = document.getElementById('heatPanel');
    if (!heatData.length) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    if (typeof railMostrar === 'function') railMostrar('heatPanel');
    document.getElementById('heatMeta').textContent = heatData.length + ' ativos · ' + fmtHora(Math.floor(Date.now() / 1000));
    const corDe = s => s >= 70 ? 'var(--call)' : s >= 50 ? 'var(--warning)' : 'var(--put)';
    document.getElementById('heatList').innerHTML = heatData
        .slice().sort((a, b) => b.score - a.score)
        .map(h => `<div class="hrow" data-s="${h.s}">` +
            `<span>${h.label}</span>` +
            `<span class="hbar"><span class="hfill" style="width:${h.score}%;background:${corDe(h.score)}"></span></span>` +
            `<span class="hnum">${h.score}</span>` +
            `<span class="${h.dir === 1 ? 'chip-dir-up' : h.dir === -1 ? 'chip-dir-down' : ''}">${h.dir === 1 ? '▲' : h.dir === -1 ? '▼' : '—'}</span></div>`)
        .join('');
    document.getElementById('heatList').querySelectorAll('.hrow').forEach(x => x.addEventListener('click', () => {
        const s = x.getAttribute('data-s');
        document.getElementById('fonte').value = PARES_YAHOO[s] ? (ehForex() ? fonte() : 'twelvedata') : 'binance';
        document.getElementById('symbol').value = s;
        montarWidgetTV(); carregar();
    }));
}

// ============================================================================
// PRESSÃO POR PAR — compra×venda do par atual e dos pares de referência
// ============================================================================

function atualizarPressaoPares() {
    const el = document.getElementById('pressaoPares');
    if (!el) return;
    const jan = Math.max(2, parseInt(document.getElementById('fluxoJanela').value));
    document.getElementById('pressaoJanelaLbl').textContent = `(últimas ${jan} velas)`;

    const linhas = [];
    const render = (symbol, arr, endIdx) => {
        const d = deltaNaJanela(arr, endIdx, jan);
        if (d.tot <= 0) return;
        const pctBuy = Math.round(d.buy / d.tot * 100);
        const seta = d.dir === 1 ? '<span class="chip-dir-up">▲ compra</span>'
                   : d.dir === -1 ? '<span class="chip-dir-down">▼ venda</span>'
                   : '<span class="chip-dir-none">— equilíbrio</span>';
        linhas.push(
            `<div class="pressao-item">` +
            `<span class="pressao-sym">${symbol}</span>` +
            `<div class="pressao-bar"><div class="pressao-buy" style="width:${pctBuy}%"></div></div>` +
            `<span class="pressao-pct">C ${pctBuy}% · V ${100 - pctBuy}%</span>` +
            `<span class="pressao-dir">${seta}</span></div>`
        );
    };

    if (dados.length) render(symbolAtual() + ' (atual)', dados, dados.length - 1);
    refPares.forEach(par => { if (par.dados.length) render(par.symbol, par.dados, par.dados.length - 1); });

    el.innerHTML = linhas.length ? linhas.join('') :
        '<div class="news-empty">Sem dados de fluxo ainda. Ative a Correlação e informe pares de referência para comparar.</div>';
}

// Carrega klines dos pares de referência (Binance) para o fator Correlação
async function carregarRefPares() {
    if (fonte() === 'sim') { refPares = gerarRefParesSim(dados); return; }
    const interval = binanceInterval();
    const limit = Math.min(1000, Math.max(50, parseInt(document.getElementById('numCandles').value) || 300));
    const nomes = paresReferencia();
    const out = [];
    for (const symbol of nomes) {
        try {
            const serie = await carregarHistoricoBinance(symbol, interval, limit);
            out.push(montarRefPar(symbol, serie));
        } catch (e) { /* par inválido/indisponível: ignora */ }
    }
    refPares = out;
}

// ============================================================================
// SOM DE ALERTA (Web Audio — sem arquivos externos, funciona offline)
// ============================================================================

let audioCtx = null;
let ultimoVerdictSom = '';   // evita repetir o som enquanto o veredito não muda

function garantirAudio() {
    // Navegadores exigem gesto do usuário antes de tocar áudio; o clique em
    // qualquer controle (ou no botão Testar) desbloqueia o contexto.
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

// dir: 1 = CALL (tons subindo), -1 = PUT (tons descendo)
function tocarSom(dir) {
    const ctx = garantirAudio();
    if (!ctx) return;
    const freqs = dir === 1 ? [660, 880] : [660, 440];
    freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const t0 = ctx.currentTime + i * 0.18;
        // Envelope curto (sem clique): sobe rápido, decai em ~160ms
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.2);
    });
}

// ============================================================================
// TREINO DE LEITURA (replay) — esconde o futuro, pontua sua leitura vs indicador
// ============================================================================

let treino = null;   // { full, pos, user:{ok,err}, ind:{ok,err}, streak, melhorStreak }

// Veredito do indicador na última vela visível (mesma regra do Painel de Decisão)
function verdictDoIndicador() {
    const { long, short, enabled, minScore, confMode } = confLive;
    if (!enabled) return 'WAIT';
    const alvo = confMode === 'estrita' ? enabled : Math.min(minScore, enabled);
    if (long >= alvo && long > short) return 'CALL';
    if (short >= alvo && short > long) return 'PUT';
    return 'WAIT';
}

// Leitor de padrões da última vela — educa a leitura (martelo, engolfo, doji…)
function lerVela() {
    if (dados.length < 2) return [];
    const c = dados[dados.length - 1], p = dados[dados.length - 2];
    const corpo = Math.abs(c.close - c.open);
    const range = Math.max(c.high - c.low, 1e-9);
    const sombraSup = c.high - Math.max(c.open, c.close);
    const sombraInf = Math.min(c.open, c.close) - c.low;
    const alta = c.close > c.open, baixa = c.close < c.open;
    const pAlta = p.close > p.open, pBaixa = p.close < p.open;
    const padroes = [];

    if (corpo < range * 0.1) padroes.push('Doji (indecisão)');
    if (sombraInf > corpo * 2 && sombraSup < corpo) padroes.push('Martelo (rejeição de baixa)');
    if (sombraSup > corpo * 2 && sombraInf < corpo) padroes.push('Estrela cadente (rejeição de alta)');
    if (alta && pBaixa && c.close > p.open && c.open < p.close) padroes.push('Engolfo de ALTA');
    if (baixa && pAlta && c.close < p.open && c.open > p.close) padroes.push('Engolfo de BAIXA');
    if (corpo > range * 0.7) padroes.push(alta ? 'Corpo cheio de alta (força compradora)' : 'Corpo cheio de baixa (força vendedora)');
    return padroes;
}

// Contexto de mercado em texto (a "leitura" que o trader deveria fazer)
function lerContexto() {
    const last = computed.closes.length - 1;
    if (last < 0) return '';
    const partes = [];
    const e2 = computed.ema200[last];
    if (e2 !== null) partes.push(computed.closes[last] > e2 ? 'preço ACIMA da EMA200 (viés de alta)' : 'preço ABAIXO da EMA200 (viés de baixa)');
    const rsiV = computed.rsiValues[last];
    if (rsiV !== null) {
        const zona = rsiV >= 70 ? 'sobrecomprado' : rsiV <= 30 ? 'sobrevendido' : 'neutro';
        partes.push(`RSI ${rsiV.toFixed(0)} (${zona})`);
    }
    if (computed.atrValues[last] !== null && computed.atrMedia[last] !== null)
        partes.push(computed.atrValues[last] > computed.atrMedia[last] ? 'ATR acima da média (mercado com força)' : 'ATR abaixo da média (lateralização)');
    return partes.join(' · ');
}

function atualizarPainelTreino(feedback) {
    if (!treino) return;
    const N = Math.max(1, Math.round(expMinutes() / tfMinutes()));
    document.getElementById('trainPos').textContent =
        `vela ${treino.pos} de ${treino.full.length} · expiração ${expMinutes()} min (${N} vela${N > 1 ? 's' : ''} à frente)`;

    const padroes = lerVela();
    document.getElementById('trainReading').innerHTML =
        `<strong>Leitura da vela:</strong> ${padroes.length ? padroes.join(' · ') : 'sem padrão clássico'} ` +
        `<br><strong>Contexto:</strong> ${lerContexto() || '—'}`;

    if (feedback !== undefined) document.getElementById('trainFeedback').innerHTML = feedback;

    const u = treino.user, ind = treino.ind;
    const pct = o => (o.ok + o.err) ? (o.ok / (o.ok + o.err) * 100).toFixed(0) + '%' : '–';
    document.getElementById('trainStats').innerHTML =
        `<span class="train-stat">Você: <strong>${u.ok}/${u.ok + u.err}</strong> (${pct(u)})</span>` +
        `<span class="train-stat">Indicador: <strong>${ind.ok}/${ind.ok + ind.err}</strong> (${pct(ind)})</span>` +
        `<span class="train-stat">Sequência: <strong>${treino.streak}</strong> (melhor ${treino.melhorStreak})</span>`;
}

function iniciarTreino() {
    if (dados.length < 120) { showToast('Carregue pelo menos 120 velas para treinar (aumente o Nº de velas).', 'err'); return; }
    fecharWS();                       // pausa o ao-vivo durante o treino
    pararPollYahoo();
    conexaoAtual = '';
    setStatus('off', 'Treino de leitura (replay)');
    const full = dados.slice();
    // Corte aleatório: começa entre 100 velas e (fim − 40) p/ sobrar futuro
    const N = Math.max(1, Math.round(expMinutes() / tfMinutes()));
    const minPos = Math.max(100, Math.floor(full.length * 0.4));
    const maxPos = full.length - Math.max(40, N + 5);
    const pos = minPos + Math.floor(Math.random() * Math.max(1, maxPos - minPos));
    treino = { full, pos, user: { ok: 0, err: 0 }, ind: { ok: 0, err: 0 }, streak: 0, melhorStreak: 0 };
    dados = full.slice(0, pos);
    redesenharTudo(true);
    document.getElementById('trainPanel').style.display = 'block';
    document.getElementById('btnTreinar').textContent = 'Treinando…';
    atualizarPainelTreino('Leia a vela atual e decida: o preço estará mais alto ou mais baixo na expiração?');
}

function encerrarTreino(restaurar) {
    if (!treino) return;
    const full = treino.full;
    treino = null;
    document.getElementById('trainPanel').style.display = 'none';
    document.getElementById('btnTreinar').textContent = 'Treinar leitura (replay)';
    if (restaurar) { dados = full; carregar(); }   // recarrega e reconecta o ao-vivo
}

function responderTreino(dir) {   // dir: 1 CALL, -1 PUT, 0 pular
    if (!treino) return;
    const N = Math.max(1, Math.round(expMinutes() / tfMinutes()));

    if (treino.pos + N >= treino.full.length) {
        atualizarPainelTreino('🏁 Fim do histórico! Veja seu placar acima — clique em Encerrar treino.');
        return;
    }

    if (dir === 0) {   // pular: revela 1 vela e segue
        treino.pos += 1;
        dados = treino.full.slice(0, treino.pos);
        redesenharTudo(false);
        atualizarPainelTreino('Vela pulada. Leia a nova vela e decida.');
        return;
    }

    // Previsão do indicador ANTES de revelar o futuro
    const indPrev = verdictDoIndicador();

    const entry = treino.full[treino.pos - 1].close;
    const alvo = treino.full[treino.pos - 1 + N].close;
    const varPct = ((alvo - entry) / entry * 100).toFixed(3);
    const subiu = alvo > entry, caiu = alvo < entry;

    let fb;
    if (!subiu && !caiu) {
        fb = `➖ Empate: o preço fechou igual (${entry}). Ninguém pontua.`;
    } else {
        const userOk = (dir === 1 && subiu) || (dir === -1 && caiu);
        if (userOk) { treino.user.ok++; treino.streak++; treino.melhorStreak = Math.max(treino.melhorStreak, treino.streak); }
        else { treino.user.err++; treino.streak = 0; }

        let indTxt = 'AGUARDAR (não pontua)';
        if (indPrev === 'CALL' || indPrev === 'PUT') {
            const indOk = (indPrev === 'CALL' && subiu) || (indPrev === 'PUT' && caiu);
            if (indOk) treino.ind.ok++; else treino.ind.err++;
            indTxt = `${indPrev} (${indOk ? 'acertou' : 'errou'})`;
        }
        fb = `${userOk ? '✅ <strong>Acertou!</strong>' : '❌ <strong>Errou.</strong>'} ` +
             `O preço ${subiu ? 'subiu' : 'caiu'} de ${entry} para ${alvo} (${varPct}%) em ${expMinutes()} min. ` +
             `Indicador dizia: ${indTxt}.`;
    }

    // Revela as N velas da expiração e segue o replay
    treino.pos += N;
    dados = treino.full.slice(0, treino.pos);
    redesenharTudo(false);
    atualizarPainelTreino(fb);
}

// ============================================================================
// PAINEL DE DECISÃO — o veredito de assertividade da vela atual
// ============================================================================

// SCORE INSTITUCIONAL — qualidade da operação em 0–100, agregando os módulos:
// confluência (40), assertividade histórica do score vs break-even (20),
// alinhamento com TF maior (10), distância de S/R (10), sessão (10) e
// histórico walk-forward do par (10). Deriva selo A/B/C, estrelas e Kelly.
function calcularGrade(dir) {
    const cl = confLive, enabled = cl.enabled || 1;
    const scoreRatio = (dir === 1 ? cl.long : cl.short) / enabled;
    const htfOk = !cl.useHtf || cl.htfDir === dir;
    const srOk = dir === 1 ? !cl.srVetoLong : !cl.srVetoShort;
    const sessOk = cl.sessaoForte;
    const cache = iaCache[symbolAtual()];
    const pairWr = cache && cache.wr != null ? cache.wr : null;
    const forte = scoreRatio >= 0.7;
    const pairOk = pairWr == null || pairWr >= 0.55;

    // probabilidade estimada: histórico do score atual neste gráfico > WF do par.
    // pEst = estimativa pontual (mostrada ao usuário); pLB = limite inferior de
    // Wilson (usado para PONTUAR/decidir — não confia em amostra pequena); pN = nº
    // de operações que sustentam a estimativa.
    const payout = Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100);
    const beWR = 1 / (1 + payout);
    let pEst = null, pLB = null, pN = 0;
    const key = Math.max(cl.long, cl.short) + '/' + enabled;
    if (byScoreGlobal && byScoreGlobal.scores[key] && byScoreGlobal.scores[key].t >= 5) {
        const o = byScoreGlobal.scores[key];
        pEst = o.w / o.t; pLB = wilsonLB(o.w, o.t); pN = o.t;
    } else if (pairWr != null) {
        pEst = pairWr;
        pLB = cache && cache.wrLB != null ? cache.wrLB : pairWr;   // LB do backtest da IA, se houver
        pN = cache && cache.ops != null ? cache.ops : 0;
    }

    let score = Math.round(scoreRatio * 40);
    // pontua pela borda CONSERVADORA (limite inferior), não pela estimativa cheia
    if (pLB != null) score += Math.round(Math.max(0, Math.min(1, (pLB - beWR) / 0.15)) * 20);
    else score += 10;   // sem histórico: meio-termo
    if (htfOk) score += 10;
    if (srOk) score += 10;
    if (sessOk) score += 10;
    if (pairOk && pairWr != null) score += 10; else if (pairWr == null) score += 5;
    score = Math.max(0, Math.min(100, score));

    // Expectativa por operação (payout-aware): ponto e limite inferior.
    const expOp = pEst != null ? expectancia(pEst, payout) : null;
    const expOpLB = pLB != null ? expectancia(pLB, payout) : null;
    // Kelly fracionário (½) na borda conservadora — dimensiona risco sem otimismo.
    let kelly = null;
    if (pLB != null) kelly = Math.max(0, Math.min(0.05, ((pLB * (1 + payout) - 1) / payout) / 2));

    let grade;
    if (forte && htfOk && srOk && sessOk && pairOk) grade = 'A';
    else if (scoreRatio >= 0.5 && srOk && htfOk) grade = 'B';
    else grade = 'C';
    // amostra insuficiente rebaixa A→B: não há evidência estatística para "ENTRAR"
    if (grade === 'A' && pN > 0 && pN < 10) grade = 'B';
    const motivos = [];
    if (!forte) motivos.push('score baixo');
    if (!htfOk) motivos.push('contra o TF maior');
    if (!srOk) motivos.push('colado em S/R');
    if (!sessOk) motivos.push('sessão fraca (' + cl.sessao + ')');
    if (pairWr != null && pairWr < 0.55) motivos.push('par com histórico fraco (' + pctTxt(pairWr) + ')');
    if (expOpLB != null && expOpLB < 0) motivos.push('sem edge estatístico (LB ' + pctTxt(pLB) + ' < break-even ' + pctTxt(beWR) + ')');
    if (pN > 0 && pN < 10) motivos.push('amostra pequena (' + pN + ' ops) — pouca confiança');
    return { grade, motivos, score, estrelas: Math.max(1, Math.round(score / 20)), pEst, pLB, pN, expOp, expOpLB, kelly, regime: cl.regime };
}

// ---- FUNIL DE QUALIDADE ----
// Materializa a cadeia de assertividade: 6 elos que precisam fechar juntos para
// o sinal atual merecer dinheiro. avaliarFunil devolve os dados (usados também
// pelo Registro e pelo Modo Sniper); renderFunilQualidade desenha os chips.
function avaliarFunil(riscoNoticia) {
    const cl = confLive;
    const dir = cl.long >= cl.short ? 1 : -1;
    const dom = Math.max(cl.long, cl.short), en = cl.enabled || 1;
    const g = calcularGrade(dir);

    // 1. Regime × fatores: os toggles atuais casam com o preset do regime detectado?
    let reg = null, regimeOk = null;
    try { reg = regimeUltimo(); } catch (e) {}
    if (reg && typeof PRESETS_REGIME !== 'undefined' && PRESETS_REGIME[reg]) {
        const f = PRESETS_REGIME[reg].fatores;
        const iguais = Object.keys(f).filter(id => { const el = document.getElementById(id); return el && el.checked === !!f[id]; }).length;
        regimeOk = iguais >= 7;   // 7 de 10 toggles alinhados = estratégia compatível
    }
    // 2. Confluência de verdade (≥4 fatores ou ≥70% do habilitado, com lado dominante)
    const confOk = cl.long !== cl.short && (dom >= 4 || dom / en >= 0.7);
    // 3. Portões de contexto: HTF, S/R, sessão e notícia
    const htfOk = !cl.useHtf || cl.htfDir === dir;
    const srOk = dir === 1 ? !cl.srVetoLong : !cl.srVetoShort;
    const portoesOk = htfOk && srOk && cl.sessaoForte && !riscoNoticia;
    // 4. Evidência estatística: amostra ≥10 e expectativa positiva no limite inferior
    const evidOk = g.pN >= 10 && g.expOpLB != null && g.expOpLB >= 0;
    // 5. Calibração ao vivo: previsão da IA sustentada pelo placar real
    const res = registro.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS');
    let calibOk = null;
    if (res.length >= 3) {
        const wins = res.filter(r => r.resultado === 'WIN').length;
        const cc = iaCache[symbolAtual() + '|' + (reg || '')] || iaCache[symbolAtual()];
        calibOk = !cc || cc.wr == null || cc.wr >= wilsonLB(wins, res.length) - 0.02;
    }
    // 6. Execução coerente: expiração 1–6× o TF e payout viável (≥80%)
    const razao = expMinutes() / tfMinutes();
    const payout = Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100);
    const execOk = razao >= 1 && razao <= 6 && payout >= 0.8;

    const okCount = [regimeOk, confOk, portoesOk, evidOk, calibOk, execOk].filter(x => x === true).length;
    return { okCount, dir, dom, en, g, reg, regimeOk, confOk, htfOk, srOk, portoesOk, evidOk, calibOk, execOk, razao, payout, riscoNoticia, sessaoForte: cl.sessaoForte, sessao: cl.sessao };
}

function renderFunilQualidade(riscoNoticia) {
    const box = document.getElementById('qualityFunnel');
    if (!box || !confLive.fatores || !dados.length) return;
    const f = avaliarFunil(riscoNoticia);
    const elo = (ok, rot, dica) => {
        const cls = ok === null ? 'funil-nd' : ok ? 'funil-ok' : 'funil-no';
        const ico = ok === null ? '·' : ok ? '✓' : '✕';
        return `<span class="funil-elo ${cls}" title="${dica}">${ico} ${rot}</span>`;
    };
    const faltasPortoes = (f.htfOk ? '' : 'contra o TF maior · ') + (f.srOk ? '' : 'colado em S/R · ')
        + (f.sessaoForte ? '' : 'sessão fraca (' + f.sessao + ') · ') + (f.riscoNoticia ? 'notícia próxima · ' : '');
    box.innerHTML = `<span class="funil-titulo">Funil de qualidade <strong>${f.okCount}/6</strong></span>` +
        elo(f.regimeOk, 'Regime', f.reg ? (f.regimeOk ? 'fatores casam com o regime ' + (REGIME_ROTULO[f.reg] || f.reg) : 'fatores não casam com o regime ' + (REGIME_ROTULO[f.reg] || f.reg) + ' — clique no preset 🎯 Auto') : 'regime indisponível') +
        elo(f.confOk, 'Confluência', f.confOk ? f.dom + '/' + f.en + ' fatores a favor' : 'score fraco (' + f.dom + '/' + f.en + ') — espere ≥4 fatores ou 70%') +
        elo(f.portoesOk, 'Portões', f.portoesOk ? 'HTF · S/R · sessão · notícia OK' : faltasPortoes) +
        elo(f.evidOk, 'Evidência', f.g.pN >= 10 ? (f.evidOk ? 'edge LB ≥ 0 com ' + f.g.pN + ' ops' : 'sem edge no limite inferior (95%)') : 'amostra ' + (f.g.pN || 0) + ' ops — precisa ≥10 (rode a 🤖 IA)') +
        elo(f.calibOk, 'Calibração', f.calibOk === null ? 'aguardando 3+ resultados reais no Registro' : f.calibOk ? 'previsão da IA dentro do placar real' : 'IA otimista vs placar real — reotimize') +
        elo(f.execOk, 'Execução', 'expiração ' + expMinutes() + 'm ÷ TF ' + tfMinutes() + 'm = ' + f.razao.toFixed(1) + '× (ideal 1–6×) · payout ' + Math.round(f.payout * 100) + '% (mín. 80%)');
}

function atualizarDecisao() {
    const v = document.getElementById('decisionVerdict');
    const r = document.getElementById('decisionReason');
    const chips = document.getElementById('decisionChips');
    const ctx = document.getElementById('decisionContext');
    const painel = document.querySelector('.decision-panel');
    if (!v || !confLive.fatores) return;

    // Guarda de configuração incoerente: não gera veredito/alerta sobre "lixo".
    const probs = configProblemas();
    if (probs.length) {
        v.textContent = 'CONFIG INVÁLIDA';
        v.className = 'decision-verdict verdict-wait';
        r.textContent = '⚠ ' + probs.join(' · ') + ' — corrija para gerar sinais.';
        chips.innerHTML = '';
        if (painel) painel.style.borderLeftColor = 'var(--warning)';
        ultimoVerdictSom = 'CONFIG';   // impede alerta na volta ao estado válido
        const fEl = document.getElementById('qualityFunnel'); if (fEl) fEl.innerHTML = '';
        return;
    }

    // Chips: para onde cada fator aponta AGORA (▲ CALL, ▼ PUT, ✓ ok, — neutro)
    chips.innerHTML = confLive.fatores.map(f => {
        let dirHtml;
        if (!f.on) dirHtml = '<span class="chip-dir-none">off</span>';
        else if (f.dir === 1) dirHtml = '<span class="chip-dir-up">▲</span>';
        else if (f.dir === -1) dirHtml = '<span class="chip-dir-down">▼</span>';
        else if (f.dir === 2) dirHtml = '<span class="chip-dir-up">✓</span>';
        else dirHtml = '<span class="chip-dir-none">—</span>';
        return `<span class="decision-chip${f.on ? '' : ' chip-off'}">${f.nome} ${dirHtml}</span>`;
    }).join('');

    const { long, short, enabled, minScore, confMode } = confLive;
    const alvo = confMode === 'estrita' ? enabled : Math.min(minScore, enabled);

    // Risco de notícia tem prioridade sobre qualquer confluência
    const newsOn = document.getElementById('useNewsFilter').checked;
    const newsJan = lerNum('newsJanela');
    const lastT = dados.length ? dados[dados.length - 1].time : 0;
    const riscoNoticia = newsOn && lastT && noticiaProxima(lastT, newsJan);

    // Texto do motivo OBJETIVO: só dados, sem prosa (detalhe fica no funil/❔)
    let cor, verdictKey = 'WAIT';
    if (riscoNoticia) {
        v.textContent = 'AGUARDAR ⚠';
        v.className = 'decision-verdict verdict-news';
        r.textContent = `⚠ notícia · ${baseAsset()} · janela ${newsJan}m`;
        cor = 'var(--warning)';
        verdictKey = 'NEWS';
    } else if (enabled > 0 && long >= alvo && long > short) {
        v.textContent = 'ENTRAR CALL ▲';
        v.className = 'decision-verdict verdict-call';
        r.textContent = `▲ ${long}/${enabled} fatores · mín. ${alvo}`;
        cor = 'var(--call)';
        verdictKey = 'CALL';
    } else if (enabled > 0 && short >= alvo && short > long) {
        v.textContent = 'ENTRAR PUT ▼';
        v.className = 'decision-verdict verdict-put';
        r.textContent = `▼ ${short}/${enabled} fatores · mín. ${alvo}`;
        cor = 'var(--put)';
        verdictKey = 'PUT';
    } else {
        v.textContent = 'AGUARDAR';
        v.className = 'decision-verdict verdict-wait';
        r.textContent = `CALL ${long}/${enabled} · PUT ${short}/${enabled} · mín. ${alvo}`;
        cor = 'var(--ink-muted)';
    }

    // Filtro Price Action (LTA/LTB + S/R): a entrada só vale no TESTE de uma
    // zona — CALL perto de suporte/LTA, PUT perto de resistência/LTB. Longe da
    // zona, o veredito vira AGUARDAR (sem som, notificação ou registro).
    if (confLive.usePA && (verdictKey === 'CALL' || verdictKey === 'PUT')) {
        const paOk = verdictKey === 'CALL' ? confLive.paOkLong : confLive.paOkShort;
        if (!paOk) {
            v.textContent = 'AGUARDAR 📐';
            v.className = 'decision-verdict verdict-wait';
            r.textContent = `📐 PA: preço longe de ${verdictKey === 'CALL' ? 'suporte/LTA' : 'resistência/LTB'} — espere o teste da zona (≤ ${lerNum('paAtr')} ATR)`;
            cor = 'var(--ink-muted)';
            verdictKey = 'PA';
        }
    }
    if (painel) painel.style.borderLeftColor = cor;

    // Selo de qualidade A/B/C — amarra confluência + IA + HTF + S/R + sessão.
    // Extras em formato de DADO (curto); as ressalvas ficam nos elos do funil.
    const grEl = document.getElementById('decisionGrade');
    const usaGrade = document.getElementById('useGrade').checked;
    if (usaGrade && (verdictKey === 'CALL' || verdictKey === 'PUT')) {
        const g = calcularGrade(verdictKey === 'CALL' ? 1 : -1);
        const stars = '⭐'.repeat(g.estrelas);
        grEl.textContent = `${g.grade === 'A' ? 'A · ENTRAR' : g.grade === 'B' ? 'B · OBSERVAR' : 'C · EVITAR'} · ${g.score}/100 ${stars}`;
        grEl.className = 'decision-grade grade-' + g.grade;
        grEl.style.display = 'inline-flex';
        const extras = [];
        if (g.regime) extras.push(REGIME_ROTULO[g.regime]);
        if (g.pEst != null) extras.push('WR ' + pctTxt(g.pEst) + (g.pLB != null ? ' · LB ' + pctTxt(g.pLB) + (g.pN ? ' (' + g.pN + ' ops)' : '') : ''));
        if (g.expOp != null) extras.push((g.expOp >= 0 ? '+' : '') + g.expOp.toFixed(2) + '/op');
        if (g.kelly != null) extras.push('Kelly ' + (g.kelly * 100).toFixed(1) + '%');
        if (extras.length) r.textContent += '  ·  ' + extras.join(' · ');
    } else {
        grEl.style.display = 'none';
    }

    // Som apenas na TRANSIÇÃO para CALL/PUT (não repete enquanto o veredito se
    // mantém; silenciado durante o treino de leitura para não apitar no replay)
    if (verdictKey !== ultimoVerdictSom) {
        // Não registra/alerta sobre DADO VELADO: forex com mercado fechado (fim de
        // semana) tem velas congeladas de sexta — sinal seria falso.
        const dadoVelado = typeof forexFechado === 'function' && PARES_YAHOO[symbolAtual()] && forexFechado();
        const ehEntrada = (verdictKey === 'CALL' || verdictKey === 'PUT') && !treino && !dadoVelado;
        const dirN = verdictKey === 'CALL' ? 1 : -1;
        if (ehEntrada) reanimar(v, 'v-flash');   // pulse do veredito na virada p/ CALL/PUT
        // Selo A/B/C e FUNIL da virada — calculados uma vez; o funil fica gravado
        // na entrada para o placar por funil provar (ou desmentir) a qualidade.
        const gFull = ehEntrada && dados.length ? calcularGrade(dirN) : null;
        const gGrade = gFull ? gFull.grade : null;
        let fn = null;
        if (ehEntrada && dados.length) { try { fn = avaliarFunil(riscoNoticia); } catch (e) { } }
        // Registro em tempo real: a virada do veredito para CALL/PUT entra na
        // timeline do Registro de Entradas com o selo A/B/C e o funil do momento
        if (ehEntrada && dados.length) {
            const lbl = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
            const funilN = fn ? fn.okCount : null;
            const extra = { grade: gGrade, funil: funilN, live: 1, exp: parseInt(document.getElementById('expiracao').value) || 5, sym: symbolAtual(), fonte: fonte() };
            // Retrato da entrada (motivos + mini-gráfico) p/ abrir no clique da notificação/linha
            try { extra.det = snapshotEntrada(verdictKey, gFull, fn); } catch (e) { }
            // Piloto Automático: se a virada passa no gatilho, vira operação paper (conta demo)
            if (typeof pilotoQualifica === 'function' && pilotoQualifica(gGrade, funilN)) {
                extra.paper = 1; extra.stake = pilotoStakeAtual(); extra.payout = pilotoPayout();
            }
            registrarEntrada(lbl, dirN, Math.max(long, short), enabled, extra);
            _ultimaEntradaIdx = registro.length - 1;
            renderRegistro();
        }
        if (document.getElementById('somAtivo').checked && !treino) {
            if (verdictKey === 'CALL') tocarSom(1);
            else if (verdictKey === 'PUT') tocarSom(-1);
        }
        // Notificação de navegador — SÓ nível A; no 🎯 Modo Sniper, exige também
        // funil ≥5 (o topo do topo — pouquíssimas, mas as melhores).
        // A NOTIFICAÇÃO de navegador passou a ser disparada pelo SEMÁFORO (bloco
        // 37) quando ele abre no 🟢 ENTRAR — gatilho mais confiável, pois já
        // exige selo A + funil ≥5 + MTF não-contra + guardião OK. Aqui fica só o
        // som na virada do veredito (acima).
        ultimoVerdictSom = verdictKey;
    }

    // Funil de qualidade: mostra quais dos 6 elos de assertividade estão fechados
    try { renderFunilQualidade(riscoNoticia); } catch (e) { }
    // Semáforo único (bloco 37): funde tudo em ENTRAR/ESPERAR/EVITAR
    try { if (typeof renderSemaforo === 'function') renderSemaforo(riscoNoticia); } catch (e) { }
    // Ferramentas Pro (VP/níveis/book) e Price Action acompanham os recálculos.
    // FLUIDEZ: são painéis informativos pesados (pivôs+LTs+volume profile) —
    // no máximo 1 render a cada 600ms; recálculos em rajada não os re-renderizam.
    const _agoraPaineis = Date.now();
    if (_agoraPaineis - _paineisPesadosT >= 600) {
        _paineisPesadosT = _agoraPaineis;
        try { if (typeof proAtualizar === 'function') proAtualizar(); } catch (e) { }
        try { if (typeof renderPriceAction === 'function') renderPriceAction(); } catch (e) { }
    }

    // Contexto histórico: o score atual costuma acertar quanto? (assertividade medida)
    const scoreAtivo = Math.max(long, short);
    const key = scoreAtivo + '/' + enabled;
    if (byScoreGlobal && byScoreGlobal.scores[key]) {
        const o = byScoreGlobal.scores[key];
        const wrK = (o.w / o.t * 100).toFixed(0);
        ctx.innerHTML = `Score <strong>${key}</strong>: <strong>${wrK}%</strong> em ${o.t} ops · break-even <strong>${byScoreGlobal.beWR.toFixed(1)}%</strong>`;
    } else if (byScoreGlobal) {
        ctx.innerHTML = `Score <strong>${key}</strong>: sem histórico · break-even <strong>${byScoreGlobal.beWR.toFixed(1)}%</strong>`;
    } else {
        ctx.textContent = 'Aguardando operações avaliadas.';
    }

    const hint = document.getElementById('entryHint');
    if (entradas.length === 0) {
        const poucas = dados.length < 200 && document.getElementById('useEma200').checked;
        hint.textContent = poucas
            ? '💡 EMA 200 exige 200+ velas — aumente o histórico ou desligue-a.'
            : '💡 Nenhuma entrada — afrouxe um filtro (ex.: Estrutura ou RSI).';
        hint.style.display = 'block';
    } else { hint.style.display = 'none'; }
}

// ============================================================================
// BLOCO 7.5 — MÉTRICAS DE ANÁLISE (backtest das entradas)
// ============================================================================

let entradasValidas = [];   // entradas não bloqueadas por notícia (para exportar)
let metricasAtuais = null;  // resumo das métricas atuais (para exportar)
let byScoreGlobal = null;   // win rate por score (para o Painel de Decisão)

function calcularMetricas(validas) {
    entradasValidas = validas;
    const payout = Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100);
    const evaluated = validas.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    const grid = document.getElementById('metricsGrid');
    const scoreBody = document.getElementById('scoreTableBody');

    if (!evaluated.length) {
        grid.innerHTML = '<div class="metric-empty">Sem operações avaliadas ainda — aguardando a expiração das entradas.</div>';
        scoreBody.innerHTML = '';
        metricasAtuais = null;
        byScoreGlobal = null;
        if (serieEquity) serieEquity.setData([]);
        return;
    }

    const wins = evaluated.filter(e => e.resultado === 'WIN');
    const losses = evaluated.filter(e => e.resultado === 'LOSS');
    const wr = wins.length / evaluated.length * 100;

    const wrDir = arr => arr.length ? (arr.filter(e => e.resultado === 'WIN').length / arr.length * 100).toFixed(1) + '%' : '–';
    const call = evaluated.filter(e => e.dir === 'CALL');
    const put = evaluated.filter(e => e.dir === 'PUT');

    // P&L em unidades de aposta: WIN = +payout, LOSS = -1
    const pnl = wins.length * payout - losses.length;
    const expect = pnl / evaluated.length;
    const grossWin = wins.length * payout, grossLoss = losses.length;
    const pf = grossLoss > 0 ? grossWin / grossLoss : Infinity;
    const beWR = 1 / (1 + payout) * 100;   // win rate necessário para empatar

    // Sequências (streaks) em ordem cronológica
    const chron = [...evaluated].sort((a, b) => a.entryTime - b.entryTime);
    let maxW = 0, maxL = 0, curW = 0, curL = 0;
    chron.forEach(e => {
        if (e.resultado === 'WIN') { curW++; curL = 0; maxW = Math.max(maxW, curW); }
        else { curL++; curW = 0; maxL = Math.max(maxL, curL); }
    });

    // Janelas recentes: o desempenho ATUAL importa mais que o histórico completo
    const wrJanela = n => {
        const j = chron.slice(-n);
        if (j.length < Math.min(n, 10)) return null;
        return j.filter(e => e.resultado === 'WIN').length / j.length * 100;
    };
    const cardsRecentes = [20, 50, 100].map(n => {
        const v = wrJanela(n);
        return v == null ? null : ['WR últimos ' + n, v.toFixed(0) + '%', v >= beWR ? 'good' : 'bad'];
    }).filter(Boolean);

    const wrLBpct = wilsonLB(wins.length, evaluated.length) * 100;   // WR "garantido" (95%)
    const cards = [
        ['Win rate geral', wr.toFixed(1) + '%', wr >= beWR ? 'good' : 'bad'],
        ['Win rate (LB 95%)', wrLBpct.toFixed(1) + '%', wrLBpct >= beWR ? 'good' : 'bad'],
        ['Win rate p/ empatar', beWR.toFixed(1) + '%', ''],
        ...cardsRecentes,
        ['P&L acumulado', (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + 'u', pnl >= 0 ? 'good' : 'bad'],
        ['Expectativa/op', (expect >= 0 ? '+' : '') + expect.toFixed(3) + 'u', expect >= 0 ? 'good' : 'bad'],
        ['Profit factor', pf === Infinity ? '∞' : pf.toFixed(2), pf >= 1 ? 'good' : 'bad'],
        ['Win rate CALL', wrDir(call), ''],
        ['Win rate PUT', wrDir(put), ''],
        ['Maior seq. WIN', String(maxW), 'good'],
        ['Maior seq. LOSS', String(maxL), 'bad'],
        ['Operações avaliadas', String(evaluated.length), '']
    ];
    grid.innerHTML = cards.map(c =>
        `<div class="metric-card"><span class="metric-val ${c[2]}">${c[1]}</span><span class="metric-lbl">${c[0]}</span></div>`
    ).join('');

    // Win rate por score de confluência (valida a tese: mais fatores = mais acerto?)
    const byScore = {};
    evaluated.forEach(e => {
        const k = e.score + '/' + e.enabled;
        (byScore[k] = byScore[k] || { t: 0, w: 0 });
        byScore[k].t++; if (e.resultado === 'WIN') byScore[k].w++;
    });
    byScoreGlobal = { scores: byScore, beWR };
    scoreBody.innerHTML = Object.keys(byScore).sort().reverse().map(k => {
        const o = byScore[k], r = o.w / o.t * 100, lb = wilsonLB(o.w, o.t) * 100;
        // acerto cru + limite inferior: um score com poucas amostras mostra LB baixo
        return `<tr><td>${k}</td><td>${o.t}</td><td>${o.w}</td><td class="${lb >= beWR ? 'res-win' : 'res-loss'}">${r.toFixed(0)}% <span class="ia-params">(LB ${lb.toFixed(0)}%)</span></td></tr>`;
    }).join('');

    // Curva de capital acumulada
    let acc = 0;
    const eq = chron.map(e => { acc += e.resultado === 'WIN' ? payout : -1; return { time: e.entryTime, value: +acc.toFixed(4) }; });
    if (serieEquity) serieEquity.setData(eq);
    if (chartEquity) chartEquity.timeScale().fitContent();

    // Guarda resumo para exportação
    metricasAtuais = {
        payoutPct: (payout * 100).toFixed(0), wr: wr.toFixed(1), beWR: beWR.toFixed(1),
        pnl: pnl.toFixed(2), expect: expect.toFixed(3), pf: pf === Infinity ? 'inf' : pf.toFixed(2),
        wrCall: wrDir(call), wrPut: wrDir(put), maxW, maxL, ops: evaluated.length
    };
}

// ============================================================================
// EXPORTAÇÃO CSV (entradas + resumo de métricas)
// ============================================================================

function csvEscape(v) {
    const s = String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportarCSV() {
    if (!entradasValidas.length && !entradas.length) { showToast('Sem entradas para exportar. Gere/carregue dados primeiro.', 'err'); return; }
    const sym = symbolAtual();
    const tf = tfMinutes() === 60 ? 'H1' : 'M' + tfMinutes();
    const agora = new Date();
    const p = n => String(n).padStart(2, '0');
    const stamp = `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}_${p(agora.getHours())}${p(agora.getMinutes())}`;

    const L = [];
    L.push('# Simulador Confluencia Multi-Fator - Exportacao');
    L.push(`# Par: ${sym} | Timeframe: ${tf} | Expiracao: ${expMinutes()}min | Fonte: ${fonte()}`);
    L.push(`# Gerado: ${agora.toLocaleString()}`);
    L.push('#');
    L.push('# METRICAS (sobre entradas nao bloqueadas por noticia)');
    if (metricasAtuais) {
        const m = metricasAtuais;
        L.push(`# Payout: ${m.payoutPct}%`);
        L.push(`# Win rate geral: ${m.wr}% | Win rate p/ empatar: ${m.beWR}%`);
        L.push(`# P&L: ${m.pnl}u | Expectativa/op: ${m.expect}u | Profit factor: ${m.pf}`);
        L.push(`# Win rate CALL: ${m.wrCall} | Win rate PUT: ${m.wrPut}`);
        L.push(`# Maior seq WIN: ${m.maxW} | Maior seq LOSS: ${m.maxL} | Operacoes avaliadas: ${m.ops}`);
    } else {
        L.push('# (sem operacoes avaliadas ainda)');
    }
    L.push('#');
    L.push('# ENTRADAS');
    L.push(['n', 'hora_vela', 'direcao', 'preco_entrada', 'fatores', 'score', 'total_filtros', 'expiracao_min', 'hora_expiracao', 'resultado'].join(';'));

    entradas.forEach((e, i) => {
        L.push([
            i + 1, fmtHora(e.entryTime), e.dir, e.entryPrice, csvEscape(e.fatores),
            e.score, e.enabled, e.expMin, fmtHora(e.expTime), e.resultado
        ].join(';'));
    });

    const csv = '﻿' + L.join('\n');   // BOM p/ Excel reconhecer UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulador_${sym}_${tf}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================================
// BLOCO 8 — CONEXÃO BINANCE (REST histórico + WebSocket ao vivo)
// ============================================================================

function setStatus(estado, texto) {
    const dot = document.getElementById('connDot');
    const txt = document.getElementById('connText');
    dot.className = 'conn-dot conn-' + estado;   // on | connecting | off | err
    txt.textContent = texto;
    document.getElementById('liveBadge').style.display = estado === 'on' ? 'inline-block' : 'none';
    // Skeleton loader: shimmer no gráfico enquanto conecta/carrega
    document.body.classList.toggle('carregando', estado === 'connecting');
}

// fetch com TIMEOUT (AbortController): um servidor que aceita mas não responde
// não pendura mais a requisição para sempre. Padrão 10s.
function fetchTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 10000);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(t));
}

// Retry com backoff p/ REST transitório (rede caindo, 429 de limite, 5xx do
// servidor, timeout). Erros 4xx de dados (par inexistente etc.) não são
// repetidos — não adianta insistir. Backoff: 0.5s, 1s, 2s.
async function fetchRetry(url, opts, tentativas) {
    tentativas = tentativas || 3;
    let err;
    for (let i = 0; i < tentativas; i++) {
        try {
            const r = await fetchTimeout(url, opts);
            if (r.ok) return r;
            if (r.status >= 400 && r.status < 500 && r.status !== 429) return r;   // erro de dados: devolve p/ tratar
            err = new Error('HTTP ' + r.status);
        } catch (e) { err = e; }   // falha de rede/DNS/CORS/timeout (abort)
        if (i < tentativas - 1) await new Promise(res => setTimeout(res, 500 * Math.pow(2, i)));
    }
    throw err || new Error('falha de rede');
}

async function carregarHistoricoBinance(symbol, interval, limit) {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const resp = await fetchRetry(url);
    if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error('HTTP ' + resp.status + ' ' + t.slice(0, 120));
    }
    const arr = await resp.json();
    // Binance kline: [openTime, open, high, low, close, volume, closeTime,
    //  quoteVol, nTrades, takerBuyBaseVol, ...] — k[9] é o volume COMPRADO a
    // mercado (agressor); venda = volume total − k[9].
    return arr.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: +k[1], high: +k[2], low: +k[3], close: +k[4],
        volume: +k[5], buyVol: +k[9]
    }));
}

// Proxy do "Crypto IDX" da Binomo (índice sintético proprietário, sem feed
// público). Aproximação: cesta de criptos reais da Binance, cada uma normalizada
// em base 100 no primeiro fechamento; o índice é a média das velas normalizadas.
// NÃO reproduz os valores exatos da Binomo — é uma referência de comportamento.
const CRYPTOIDX_CESTA = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
// Carrega a cesta e devolve as velas do índice + fatores de normalização e a
// última vela de cada ativo (para o WebSocket combinar tick a tick ao vivo).
async function carregarCestaIDX(interval, limit) {
    const series = await Promise.all(CRYPTOIDX_CESTA.map(s =>
        carregarHistoricoBinance(s, interval, limit).then(d => ({ s, d })).catch(() => null)));
    const ok = series.filter(x => x && x.d && x.d.length);
    if (!ok.length) throw new Error('cesta Crypto IDX indisponível');
    const factors = {}; ok.forEach(x => factors[x.s] = 100 / x.d[0].close);   // base 100 por ativo
    const mapa = new Map();
    ok.forEach(x => {
        const f = factors[x.s];
        x.d.forEach(c => {
            let a = mapa.get(c.time);
            if (!a) { a = { o: 0, h: 0, l: 0, cl: 0, v: 0, bv: 0, n: 0 }; mapa.set(c.time, a); }
            a.o += c.open * f; a.h += c.high * f; a.l += c.low * f; a.cl += c.close * f;
            a.v += c.volume || 0; a.bv += c.buyVol || 0; a.n++;
        });
    });
    const candles = [...mapa.keys()].sort((x, y) => x - y)
        .filter(t => mapa.get(t).n === ok.length)   // só buckets com toda a cesta
        .map(t => { const a = mapa.get(t); return { time: t, open: a.o / a.n, high: a.h / a.n, low: a.l / a.n, close: a.cl / a.n, volume: a.v, buyVol: a.bv }; });
    const ultimos = {};
    ok.forEach(x => { const c = x.d[x.d.length - 1]; ultimos[x.s] = { time: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, V: c.buyVol }; });
    return { candles: candles.slice(Math.max(0, candles.length - limit)), factors, ultimos, syms: ok.map(x => x.s) };
}
async function carregarHistoricoCryptoIDX(interval, limit) { return (await carregarCestaIDX(interval, limit)).candles; }

// ---- WebSocket combinado do Crypto IDX (tick a tick, como os pares normais) ----
let idxWS = null, idxFactors = {}, idxLast = {}, idxSyms = [], idxConn = '';
function fecharIdxWS() { if (idxWS) { try { idxWS.onclose = null; idxWS.close(); } catch (e) {} idxWS = null; } idxConn = ''; }

// Monta a vela do índice no tempo t exigindo que todos os ativos já tenham
// reportado esse bucket (senão devolve null e espera os que faltam).
function idxCombinar(t) {
    let o = 0, h = 0, l = 0, c = 0, v = 0, bv = 0, n = 0;
    for (const s of idxSyms) {
        const b = idxLast[s];
        if (!b || b.time !== t) return null;
        const f = idxFactors[s];
        o += b.o * f; h += b.h * f; l += b.l * f; c += b.c * f; v += b.v || 0; bv += b.V || 0; n++;
    }
    return n ? { time: t, open: o / n, high: h / n, low: l / n, close: c / n, volume: v, buyVol: bv } : null;
}

function onIdxBar(bar, fechou) {
    const last = dados.length ? dados[dados.length - 1] : null;
    if (last && bar.time === last.time) { dados[dados.length - 1] = bar; agendarTick(fechou); }
    else if (!last || bar.time > last.time) { dados.push(bar); agendarTick(fechou); }
}

function conectarIdxWS(interval) {
    fecharIdxWS();
    const streams = idxSyms.map(s => s.toLowerCase() + '@kline_' + interval).join('/');
    const conn = 'IDX@' + interval; idxConn = conn;
    const sock = new WebSocket(`${BINANCE_WS}/stream?streams=${streams}`);
    idxWS = sock;
    const abriuTimer = setTimeout(() => { if (idxConn === conn && sock.readyState !== 1) { try { sock.close(); } catch (e) {} } }, 12000);
    sock.onopen = () => { clearTimeout(abriuTimer); if (idxConn === conn) { idxTent = 0; setStatus('on', 'AO VIVO (tick a tick) • Crypto IDX ≈ cesta Binance'); } };
    sock.onmessage = (ev) => {
        if (idxConn !== conn) return;
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        const k = msg.data && msg.data.k; if (!k) return;
        const sym = msg.data.s || k.s;
        if (idxFactors[sym] == null) return;
        const t = Math.floor(k.t / 1000);
        idxLast[sym] = { time: t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, V: +(k.V || 0) };
        const bar = idxCombinar(t);
        if (bar) onIdxBar(bar, k.x === true);
    };
    sock.onerror = () => { if (idxConn === conn) setStatus('err', 'Erro de conexão (Crypto IDX)'); };
    sock.onclose = () => {
        if (idxConn !== conn) return;
        if (navigator.onLine === false) { setStatus('err', '📴 Sem internet — reconecta ao voltar'); return; }
        const espera = Math.min(15000, 1000 * Math.pow(2, idxTent++));
        setStatus('connecting', `Reconectando Crypto IDX… (${Math.round(espera / 1000)}s)`);
        setTimeout(() => { if (idxConn === conn && fonteEfetiva() === 'binance' && symbolAtual() === 'CRYPTOIDX') conectarIdxWS(interval); }, espera);
    };
}

function fecharWS() {
    if (ws) {
        try { ws.onclose = null; ws.close(); } catch (e) {}
        ws = null;
    }
    fecharIdxWS();
}

function conectarWS(symbol, interval) {
    fecharWS();
    const stream = symbol.toLowerCase() + '@kline_' + interval;
    conexaoAtual = stream;
    setStatus('connecting', 'Conectando ao vivo…');
    const sock = new WebSocket(`${BINANCE_WS}/ws/${stream}`);
    ws = sock;
    // Timeout de "conectando": se o onopen não chegar em 12s, força fechar
    // (o onclose agenda a reconexão com backoff) — não fica preso em "Conectando…"
    const abriuTimer = setTimeout(() => { if (conexaoAtual === stream && sock.readyState !== 1) { try { sock.close(); } catch (e) {} } }, 12000);

    sock.onopen = () => { clearTimeout(abriuTimer); if (conexaoAtual === stream) { wsTent = 0; setStatus('on', `AO VIVO • ${symbol} ${interval}`); } };
    sock.onmessage = (ev) => {
        if (conexaoAtual !== stream) return;
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg.k) return;
        onKline(msg.k);
    };
    sock.onerror = () => { if (conexaoAtual === stream) setStatus('err', 'Erro de conexão'); };
    sock.onclose = () => {
        if (conexaoAtual !== stream) return;              // troca de par/tf: ignore
        if (navigator.onLine === false) { setStatus('err', '📴 Sem internet — reconecta ao voltar'); return; }
        const espera = Math.min(15000, 1000 * Math.pow(2, wsTent++));   // backoff: 1s,2s,4s… até 15s
        setStatus('connecting', `Reconectando… (${Math.round(espera / 1000)}s)`);
        setTimeout(() => { if (conexaoAtual === stream && fonteEfetiva() === 'binance') conectarWS(symbol, interval); }, espera);
    };
}

// Trata cada mensagem de kline do WebSocket
function onKline(k) {
    const t = Math.floor(k.t / 1000);
    // k.V = taker buy base volume (compra agressora) do stream de klines
    const bar = { time: t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, buyVol: +(k.V || 0) };
    const last = dados.length ? dados[dados.length - 1] : null;

    if (last && t === last.time) {
        dados[dados.length - 1] = bar;              // atualiza vela em formação
        agendarTick(k.x === true);
    } else if (!last || t > last.time) {
        dados.push(bar);                            // nova vela
        agendarTick(k.x === true);
    }
}

// ============================================================================
// BLOCO 9 — ORQUESTRAÇÃO / CARGA
// ============================================================================

// ============================================================================
// FOREX / ÍNDICES / OURO — Yahoo Finance (keyless, sem CORS -> via proxy)
// ============================================================================

function pararPollYahoo() { if (yahooPollTimer) { clearInterval(yahooPollTimer); yahooPollTimer = null; } }

// Yahoo não tem CORS liberado nem WS público: usamos um proxy que embrulha a
// resposta em {contents:"..."} (mesmo mecanismo das notícias), com retry —
// esse proxy público é instável e às vezes devolve 500/522 transitórios.
async function fetchYahooJson(url, rodadas) {
    rodadas = rodadas || 3;
    let ultimoErro;
    // ordem dos proxies: o que funcionou por último vai PRIMEIRO (evita ficar
    // ciclando os que estão fora do ar a cada requisição → keyless mais estável)
    const ordem = YAHOO_PROXIES
        .map((p, i) => ({ p, i }))
        .sort((a, b) => (a.i === _yahooProxyBom ? -1 : b.i === _yahooProxyBom ? 1 : 0));
    for (let r = 0; r < rodadas; r++) {
        for (const { p, i } of ordem) {
            try {
                const resp = await fetchTimeout(p.montar(url));
                if (!resp.ok) throw new Error(p.nome + ' HTTP ' + resp.status);
                const inner = JSON.parse(await p.texto(resp));
                if (inner.chart && inner.chart.error) throw new Error(inner.chart.error.description || 'erro Yahoo');
                if (!inner.chart || !inner.chart.result || !inner.chart.result[0]) throw new Error('resposta vazia');
                _yahooProxyBom = i;   // memoriza o proxy que respondeu
                return inner.chart.result[0];
            } catch (e) {
                ultimoErro = e;   // tenta o próximo proxy
            }
        }
        if (r < rodadas - 1) await new Promise(res => setTimeout(res, 600 * (r + 1)));  // backoff entre rodadas
    }
    throw ultimoErro || new Error('nenhum proxy respondeu');
}

function yahooIntervalStr(min) { return (min === 60 ? '60' : String(min)) + 'm'; }
function yahooRangeFor(min) {
    if (min <= 1) return '5d';
    if (min <= 15) return '1mo';
    if (min <= 30) return '3mo';
    return '6mo';
}

function parseYahooResult(r) {
    const ts = r.timestamp || [];
    const q = (r.indicators.quote || [{}])[0] || {};
    const out = [];
    for (let i = 0; i < ts.length; i++) {
        const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
        if (o == null || h == null || l == null || c == null) continue;   // vela sem pregão (mercado fechado)
        // Forex/índices via Yahoo não têm volume agressor real: sem dado -> 0
        // e buyVol = metade (neutro), para não simular fluxo inexistente.
        const vol = (q.volume && q.volume[i] != null) ? q.volume[i] : 0;
        out.push({ time: ts[i], open: +o, high: +h, low: +l, close: +c, volume: vol, buyVol: vol / 2 });
    }
    return out;
}

async function carregarHistoricoYahoo(codigo, intervalMin, limit) {
    const par = PARES_YAHOO[codigo];
    if (!par) throw new Error('par não suportado nesta fonte: ' + codigo);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(par.yahoo)}` +
        `?interval=${yahooIntervalStr(intervalMin)}&range=${yahooRangeFor(intervalMin)}`;
    const r = await fetchYahooJson(url);
    const candles = parseYahooResult(r);
    return candles.slice(Math.max(0, candles.length - limit));
}

// ---- MODOS COMBINADOS: várias fontes rodando juntas, roteadas por símbolo ----
//  'ambos'  = Binance (cripto) + Twelve Data (forex)
//  'ambos3' = Binance (cripto) + forex via Twelve Data COM fallback keyless p/ Yahoo
// Scanner e IA varrem cripto + forex numa passada só, cada símbolo na sua fonte.
function modoCombinado() { const f = fonte(); return f === 'ambos' || f === 'ambos3'; }
// Fonte para CARREGAR dados de um símbolo (scanner/IA). 'forex3' = TD→Yahoo.
function fonteDe(symbol) {
    if (!modoCombinado()) return fonte();
    if (!PARES_YAHOO[symbol]) return 'binance';
    return fonte() === 'ambos3' ? 'forex3' : 'twelvedata';
}
// Fonte efetiva do gráfico AO VIVO. Para forex devolve 'twelvedata' — a branch
// desse loader em carregar() já cai para o Yahoo sozinha se a TD falhar.
function fonteEfetiva() {
    if (!modoCombinado()) return fonte();
    return PARES_YAHOO[symbolAtual()] ? 'twelvedata' : 'binance';
}

// Fonte "Forex-like" (Forex/índices/ouro): sem volume agressor real
function ehForex() { const f = fonteEfetiva(); return f === 'yahoo' || f === 'twelvedata'; }

// ---- MERCADO FECHADO (fim de semana) ----
// Forex real fecha sex ~21h UTC e reabre dom ~21h UTC. Nesse vão, o "OTC" das
// corretoras (Binomo etc.) é feed PROPRIETÁRIO — não existe espelho público.
// Analisar as velas congeladas de sexta geraria sinais falsos; por isso o app
// avisa e pula os pares de forex até o mercado reabrir. Cripto segue 24/7.
function forexFechado(ms) {
    const d = new Date(ms || Date.now());
    const dia = d.getUTCDay(), h = d.getUTCHours();
    return dia === 6 || (dia === 5 && h >= 21) || (dia === 0 && h < 21);
}
// Remove os pares de forex de uma lista quando o mercado real está fechado.
function filtrarMercadoAberto(lista) {
    if (!forexFechado()) return { lista, puladas: 0 };
    const aberta = lista.filter(s => !PARES_YAHOO[s]);
    return { lista: aberta, puladas: lista.length - aberta.length };
}

// ---- Twelve Data (Forex/Índices/Ouro com chave grátis; tem CORS próprio) ----
function tdIntervalStr(min) { return min === 60 ? '1h' : min + 'min'; }
function tdKey() { return (document.getElementById('tdKey').value || 'demo').trim(); }

function parseTwelveData(json) {
    if (!json.values) return [];
    const out = [];
    // values vêm do mais recente p/ o mais antigo: percorremos de trás p/ frente
    for (let i = json.values.length - 1; i >= 0; i--) {
        const v = json.values[i];
        const t = Math.floor(Date.parse(v.datetime.replace(' ', 'T') + 'Z') / 1000);
        if (isNaN(t)) continue;
        const vol = v.volume != null ? +v.volume : 0;
        out.push({ time: t, open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: vol, buyVol: vol / 2 });
    }
    return out;
}

async function carregarHistoricoTwelveData(codigo, intervalMin, limit) {
    const par = PARES_YAHOO[codigo];
    if (!par || !par.td) throw new Error('par não suportado nesta fonte: ' + codigo);
    const url = `${TWELVEDATA_BASE}/time_series?symbol=${encodeURIComponent(par.td)}` +
        `&interval=${tdIntervalStr(intervalMin)}&outputsize=${Math.min(5000, limit)}&timezone=UTC&apikey=${encodeURIComponent(tdKey())}`;
    const resp = await fetchRetry(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (json.status === 'error' || (json.code && json.code >= 400)) throw new Error(json.message || 'erro Twelve Data');
    const candles = parseTwelveData(json);
    if (!candles.length) throw new Error('sem dados para ' + codigo);
    return candles;
}

// Nem Yahoo nem Twelve Data (free) têm WebSocket público: aproximamos "tempo
// real" reconsultando as últimas velas por polling (REST) a cada 15s.
function iniciarPollForex(codigo, intervalMin, carregador, label) {
    pararPollYahoo();
    yahooPollTimer = setInterval(async () => {
        if (!ehForex() || treino) return;
        try {
            const recentes = await carregador(codigo, intervalMin, 3);
            recentes.forEach(bar => {
                const last = dados.length ? dados[dados.length - 1] : null;
                if (last && bar.time === last.time) {
                    dados[dados.length - 1] = bar;
                    atualizarUltimoCandle(false);
                } else if (!last || bar.time > last.time) {
                    dados.push(bar);
                    atualizarUltimoCandle(true);
                }
            });
            setStatus('on', `AO VIVO (polling 15s) • ${label}`);
        } catch (e) {
            setStatus('err', 'Falha ao atualizar: ' + (e.message || e));
        }
    }, 15000);
}

// Fluxo/Correlação dependem de volume real (indisponível em Forex/índices/ouro).
// Desativa os controles nessas fontes e restaura o estado anterior ao voltar p/ cripto.
function atualizarDisponibilidadeFluxo() {
    const semVol = ehForex();
    const elFluxo = document.getElementById('useFluxo');
    const elCorr = document.getElementById('useCorrelacao');
    if (semVol) {
        if (fluxoStateAntesYahoo === null) fluxoStateAntesYahoo = { fluxo: elFluxo.checked, corr: elCorr.checked };
        elFluxo.checked = false;
        elCorr.checked = false;
    } else if (fluxoStateAntesYahoo) {
        elFluxo.checked = fluxoStateAntesYahoo.fluxo;
        elCorr.checked = fluxoStateAntesYahoo.corr;
        fluxoStateAntesYahoo = null;
    }
    elFluxo.disabled = semVol;
    elCorr.disabled = semVol;
    document.getElementById('fluxoJanela').disabled = semVol;
    document.getElementById('refPairs').disabled = semVol;
}

async function carregar() {
    // Trocar fonte/par/timeframe ou recarregar encerra um treino em andamento
    if (treino) {
        treino = null;
        document.getElementById('trainPanel').style.display = 'none';
        document.getElementById('btnTreinar').textContent = 'Treinar leitura (replay)';
    }
    fecharWS();
    pararPollYahoo();
    atualizarDisponibilidadeFluxo();
    if (refTimer) { clearInterval(refTimer); refTimer = null; }

    if (fonte() === 'sim') {
        conexaoAtual = '';
        setStatus('off', 'Simulado (offline)');
        const numCandles = lerNum('numCandles');
        const volatilidade = lerNum('volatility');
        dados = gerarDadosSim(numCandles, volatilidade);
        refPares = gerarRefParesSim(dados);
        redesenharTudo(true);
        return;
    }

    if (fonteEfetiva() === 'twelvedata') {
        conexaoAtual = '';
        const codigo = symbolAtual();
        if (!PARES_YAHOO[codigo]) {
            setStatus('err', `Par "${codigo}" não está na lista de Forex/Índices/Ouro`);
            return;
        }
        setStatus('connecting', `Carregando ${PARES_YAHOO[codigo].label} (Twelve Data)…`);
        const limit = Math.min(1000, Math.max(50, parseInt(document.getElementById('numCandles').value) || 300));
        try {
            dados = await carregarHistoricoTwelveData(codigo, tfMinutes(), limit);
            refPares = [];
            redesenharTudo(true);
            const label = PARES_YAHOO[codigo].label + ' · Twelve Data';
            setStatus('on', `AO VIVO (polling 15s) • ${label}`);
            iniciarPollForex(codigo, tfMinutes(), carregarHistoricoTwelveData, label);
        } catch (err) {
            console.warn('Twelve Data falhou, tentando Yahoo…', err);
            const dica = /api key|apikey|401|limit|grow|plan/i.test(err.message || '') ? ' (chave demo/limite? pegue a sua em twelvedata.com)' : '';
            setStatus('connecting', `Twelve Data indisponível${dica} — tentando Yahoo…`);
            // Auto-fallback p/ Yahoo (keyless) antes de desistir
            try {
                dados = await carregarHistoricoYahoo(codigo, tfMinutes(), Math.min(500, limit));
                if (!dados.length) throw new Error('vazio');
                refPares = [];
                redesenharTudo(true);
                const label = PARES_YAHOO[codigo].label + ' · Yahoo (fallback)';
                setStatus('on', `AO VIVO (polling 15s) • ${label}`);
                iniciarPollForex(codigo, tfMinutes(), carregarHistoricoYahoo, label);
            } catch (err2) {
                console.error('Yahoo também falhou:', err2);
                setStatus('err', `Twelve Data e Yahoo indisponíveis${dica} — mostrando SIMULADO. Clique em "Recarregar / Gerar".`);
                dados = gerarDadosSim(parseInt(document.getElementById('numCandles').value) || 300, 2);
                refPares = [];
                redesenharTudo(true);
            }
        }
        return;
    }

    if (fonteEfetiva() === 'yahoo') {
        conexaoAtual = '';
        const codigo = symbolAtual();
        if (!PARES_YAHOO[codigo]) {
            setStatus('err', `Par "${codigo}" não está na lista de Forex/Índices/Ouro`);
            return;
        }
        setStatus('connecting', `Carregando ${PARES_YAHOO[codigo].label} (Yahoo, testando proxies)…`);
        const limit = Math.min(500, Math.max(50, parseInt(document.getElementById('numCandles').value) || 300));
        try {
            dados = await carregarHistoricoYahoo(codigo, tfMinutes(), limit);
            if (!dados.length) throw new Error('sem dados para ' + codigo);
            refPares = [];   // correlação não se aplica entre fontes distintas
            redesenharTudo(true);
            setStatus('on', `AO VIVO (polling 15s) • ${PARES_YAHOO[codigo].label}`);
            iniciarPollForex(codigo, tfMinutes(), carregarHistoricoYahoo, PARES_YAHOO[codigo].label);
        } catch (err) {
            console.error('Erro ao carregar Yahoo:', err);
            // Proxies indisponíveis: mostra SIMULADO (deixando claro) e permite retry
            setStatus('err', 'Proxy indisponível — mostrando SIMULADO. Clique em "Recarregar / Gerar" p/ tentar de novo.');
            dados = gerarDadosSim(parseInt(document.getElementById('numCandles').value) || 300, 2);
            refPares = [];
            redesenharTudo(true);
        }
        return;
    }

    // Binance ao vivo
    const symbol = symbolAtual();
    const interval = binanceInterval();
    const limit = Math.min(1000, Math.max(50, parseInt(document.getElementById('numCandles').value) || 300));

    // Crypto IDX (proxy): cesta de criptos combinada tick a tick via WebSocket
    if (symbol === 'CRYPTOIDX') {
        setStatus('connecting', 'Montando Crypto IDX (proxy)…');
        try {
            const cesta = await carregarCestaIDX(interval, limit);
            if (!cesta.candles.length) throw new Error('cesta vazia');
            dados = cesta.candles;
            idxFactors = cesta.factors; idxLast = cesta.ultimos; idxSyms = cesta.syms;
            refPares = [];
            redesenharTudo(true);
            conectarIdxWS(interval);   // stream combinado — atualiza a última vela a cada tick
        } catch (err) {
            setStatus('err', 'Crypto IDX indisponível: ' + (err.message || err));
        }
        return;
    }

    setStatus('connecting', 'Carregando histórico…');
    try {
        dados = await carregarHistoricoBinance(symbol, interval, limit);
        if (!dados.length) throw new Error('sem dados para ' + symbol);
        await carregarRefPares();          // pares de referência p/ fluxo/correlação
        redesenharTudo(true);
        conectarWS(symbol, interval);
        // Pares de referência não têm WS próprio: renova via REST a cada 60s
        refTimer = setInterval(async () => {
            if (fonte() !== 'binance' || treino) return;
            await carregarRefPares();
            recalcularSinaisApenas();
        }, 60000);
    } catch (err) {
        setStatus('err', 'Falha: ' + (err.message || err));
        console.error('Erro ao carregar Binance:', err);
        // fallback visual: gera simulado para não deixar a tela vazia
        // (|| 500: campo vazio/inválido não pode virar NaN → gráfico em branco)
        dados = gerarDadosSim(parseInt(document.getElementById('numCandles').value) || 500, 2);
        refPares = gerarRefParesSim(dados);
        redesenharTudo(true);
    }
}

// Só recalcula sinais/entradas sobre os dados atuais (sem recarregar/reconectar)
function recalcularSinaisApenas() {
    if (!dados.length) { carregar(); return; }
    recomputarIndicadores();
    recomputarSinais();
    recomputarEntradas();
    // Atualiza séries de linha (mudança de parâmetros pode alterar todos os pontos)
    const times = dados.map(d => d.time);
    serieEma9.setData(toLine(times, computed.emaR));
    serieEma21.setData(toLine(times, computed.emaL));
    serieEma200.setData(document.getElementById('useEma200').checked ? toLine(times, computed.ema200) : []);
    serieRsi.setData(toLine(times, computed.rsiValues));
    serieAtr.setData(toLine(times, computed.atrValues));
    serieAtrMedia.setData(toLine(times, computed.atrMedia));
    atualizarMarcadores();
    atualizarPaineis();
    atualizarLegenda();
}

const SCAN_CRIPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT', 'DOTUSDT', 'TRXUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT'];

// Pares de câmbio (moedas fiat contra USDT) que a Binance pode listar. Só os que
// existirem de fato no exchangeInfo entram no checklist — a validação acontece em
// runtime (carregarSimbolos), evitando entradas mortas. A Binance cota tudo em
// USDT, então só há X/USDT (não há cruzados tipo EUR/GBP nessa fonte).
const FOREX_BINANCE_CAND = {
    EURUSDT: 'EUR/USDT (Euro)',
    GBPUSDT: 'GBP/USDT (Libra)',
    AUDUSDT: 'AUD/USDT (Dólar AUS)',
    NZDUSDT: 'NZD/USDT (Dólar NZ)',
    AEURUSDT: 'AEUR/USDT (Euro stable)',
    EURIUSDT: 'EURI/USDT (Euro stable)'
};
let forexBinanceOk = [];   // preenchido após o exchangeInfo (só os pares reais)

// ---- FILTRO DE MOEDAS DO SCANNER (checklist "🎯 Moedas p/ análise") ----
// scanSel guarda só as EXCEÇÕES: uma moeda vale como marcada por padrão;
// só entra aqui quando o usuário desmarca (false) ou marca de volta (true).
let scanSel = JSON.parse(localStorage.getItem('scanSel') || '{}');
function scanChecked(s) { return scanSel[s] !== false; }
function scanUniverse() {
    if (modoCombinado()) return SCAN_CRIPTO.concat(Object.keys(PARES_YAHOO));   // cripto + forex juntos
    return ehForex() ? Object.keys(PARES_YAHOO) : SCAN_CRIPTO.concat(forexBinanceOk);
}
function scanLabel(s) { return PARES_YAHOO[s] ? PARES_YAHOO[s].label : (FOREX_BINANCE_CAND[s] || s); }
function salvarScanSel() { localStorage.setItem('scanSel', JSON.stringify(scanSel)); }
function atualizarScanFiltroMeta() {
    const m = document.getElementById('scanFiltroMeta');
    if (!m) return;
    const uni = scanUniverse();
    m.textContent = uni.filter(scanChecked).length + '/' + uni.length;
}
function renderScanFiltro() {
    const box = document.getElementById('scanFiltro');
    if (!box) return;
    const fxFechado = forexFechado();
    box.innerHTML = scanUniverse().map(s => {
        const fech = fxFechado && PARES_YAHOO[s];   // forex esmaecido no fim de semana
        return `<label class="scan-fil${fech ? ' scan-fil-fechado' : ''}"${fech ? ' title="mercado real fechado (fim de semana) — será pulado"' : ''}><input type="checkbox" data-sym="${s}"${scanChecked(s) ? ' checked' : ''}> <span>${scanLabel(s)}</span></label>`;
    }).join('');
    box.querySelectorAll('input[data-sym]').forEach(cb => cb.addEventListener('change', function () {
        scanSel[this.dataset.sym] = this.checked;
        salvarScanSel();
        atualizarScanFiltroMeta();
    }));
    atualizarScanFiltroMeta();
}

async function escanear() {
    const f = fonte();
    if (f === 'sim') { showToast('Troque a fonte para Binance ou Forex para escanear.', 'err'); return; }
    const btn = document.getElementById('btnScan');
    btn.disabled = true; btn.textContent = 'Escaneando…';
    // Universo do scanner (no modo combinado = cripto + forex); cada símbolo é
    // carregado pela sua fonte via carregarHistoricoTF (roteamento por símbolo).
    let lista = scanUniverse().filter(scanChecked);
    // Fim de semana: pula forex (velas congeladas = sinal falso); cripto segue
    const fmScan = filtrarMercadoAberto(lista);
    if (fmScan.puladas) showToast(`⏸ ${fmScan.puladas} par(es) de forex pulado(s) — mercado real fechado`, 'info');
    lista = fmScan.lista;
    if (!lista.length) { showToast('Sem moedas com mercado aberto — marque pares de cripto (24/7).', 'err'); btn.disabled = false; btn.textContent = '🔎 Escanear melhores entradas'; return; }
    const confMode = document.getElementById('confMode').value;
    const minScoreG = parseInt(document.getElementById('minScore').value);
    const dSave = dados;
    // Salva parâmetros e desliga o filtro HTF (não se aplica a outros símbolos no scan)
    const el = id => document.getElementById(id);
    const pIds = ['minScore', 'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas', 'useHtf', 'usePesoIA'];
    const pSave = {}; pIds.forEach(i => pSave[i] = el(i).type === 'checkbox' ? el(i).checked : el(i).value);
    el('useHtf').checked = false;
    el('usePesoIA').checked = false;   // peso é por par; no scan usamos os params já afinados
    htfTrend = [];
    const res = [];
    heatData = [];   // heatmap é reconstruído a cada varredura
    for (const s of lista) {
        try {
            const d = await carregarHistoricoTF(s, tfMinutes(), 400);   // fonte resolvida por símbolo
            if (!d || d.length < 210) continue;
            // Scanner + IA: aplica os melhores parâmetros já otimizados para este par,
            // preferindo o conjunto afinado para o REGIME atual do próprio ativo
            dados = d; recomputarIndicadores();
            const cc = iaCache[s + '|' + regimeUltimo()] || iaCache[s];
            const tuned = !!cc;
            if (cc) { el('minScore').value = cc.ms; el('rsiSobrevenda').value = cc.sv; el('rsiSobrecompra').value = cc.sc; el('estruturaLookback').value = cc.lk; el('cooldownVelas').value = cc.cd; }
            else { el('minScore').value = pSave.minScore; el('rsiSobrevenda').value = pSave.rsiSobrevenda; el('rsiSobrecompra').value = pSave.rsiSobrecompra; el('estruturaLookback').value = pSave.estruturaLookback; el('cooldownVelas').value = pSave.cooldownVelas; }
            const minScore = cc ? cc.ms : minScoreG;
            recomputarSinais();
            const { long, short, enabled } = confLive;
            const alvo = confMode === 'estrita' ? enabled : Math.min(minScore, enabled);
            const domScore = Math.max(long, short);
            heatData.push({
                s, label: PARES_YAHOO[s] ? PARES_YAHOO[s].label : s,
                score: Math.round(domScore / (enabled || 1) * 100),
                dir: long > short ? 1 : short > long ? -1 : 0
            });
            const wrLB = cc && cc.wrLB != null ? cc.wrLB : null;   // acerto validado (limite inferior 95%)
            if (long >= alvo && long > short) res.push({ s, dir: 1, score: long, enabled, tuned, wrLB });
            else if (short >= alvo && short > long) res.push({ s, dir: -1, score: short, enabled, tuned, wrLB });
        } catch (e) { }
    }
    renderHeat();
    pIds.forEach(i => { if (el(i).type === 'checkbox') el(i).checked = pSave[i]; else el(i).value = pSave[i]; });
    dados = dSave; recomputarIndicadores();
    if (el('useHtf').checked) { await carregarHtf(); }
    recomputarSinais();
    // Ranqueia por EDGE ESTATÍSTICO VALIDADO primeiro (pares cujo acerto no limite
    // inferior supera o break-even), depois pela força da confluência atual.
    const payoutSc = Math.max(0.01, (parseFloat(el('payout').value) || 87) / 100);
    const beWRSc = 1 / (1 + payoutSc);
    res.forEach(r => r.edgeLB = r.wrLB != null ? r.wrLB - beWRSc : null);
    res.sort((a, b) => {
        const va = a.edgeLB != null && a.edgeLB >= 0 ? 1 : 0, vb = b.edgeLB != null && b.edgeLB >= 0 ? 1 : 0;
        return vb - va || (b.edgeLB ?? -1) - (a.edgeLB ?? -1) || b.score - a.score;
    });
    document.getElementById('scanMeta').textContent = res.length + '/' + lista.length;
    const elList = document.getElementById('scanList');
    elList.innerHTML = res.length ? res.map(r => {
        const lbl = PARES_YAHOO[r.s] ? PARES_YAHOO[r.s].label : r.s;
        const tag = r.tuned ? ' <span class="scan-tuned" title="parâmetros otimizados pela IA">✦</span>' : '';
        const lbTag = r.wrLB != null ? ` <span class="${r.edgeLB >= 0 ? 'chip-dir-up' : 'chip-dir-down'}" title="acerto validado no limite inferior (95%) vs break-even ${pctTxt(beWRSc)}">${pctTxt(r.wrLB)}✓</span>` : '';
        return `<span class="decision-chip scan-item" data-s="${r.s}">${lbl}${tag} <span class="${r.dir === 1 ? 'chip-dir-up' : 'chip-dir-down'}">${r.dir === 1 ? '▲ CALL' : '▼ PUT'} ${r.score}/${r.enabled}</span>${lbTag}</span>`;
    }).join('') : '<span class="decision-context">Nenhuma moeda com entrada agora — afrouxe a confluência ou troque o timeframe.</span>';
    elList.querySelectorAll('.scan-item').forEach(x => x.addEventListener('click', () => {
        const s = x.getAttribute('data-s');
        // No modo combinado mantém 'ambos' (o gráfico resolve a fonte pelo símbolo)
        if (!modoCombinado()) document.getElementById('fonte').value = PARES_YAHOO[s] ? (ehForex() ? f : 'twelvedata') : 'binance';
        document.getElementById('symbol').value = s;
        montarWidgetTV(); carregar();
    }));
    document.getElementById('scanPanel').style.display = 'block'; if (typeof railMostrar === 'function') railMostrar('scanPanel');
    res.forEach(r => registrarEntrada(PARES_YAHOO[r.s] ? PARES_YAHOO[r.s].label : r.s, r.dir, r.score, r.enabled,
        { exp: (iaCache[r.s] && iaCache[r.s].exp) || parseInt(el('expiracao').value) || 5, sym: r.s, fonte: fonteDe(r.s) }));
    if (res.length) renderRegistro();
    if (res.length && document.getElementById('somAtivo').checked) tocarSom(res[0].dir);
    btn.disabled = false; btn.textContent = '🔎 Escanear melhores entradas';
}

// ============================================================================
// BLOCO 8.5 — REGISTRO DE ENTRADAS (gráfico timeline: horário + par de moedas)
// ============================================================================

let registro = JSON.parse(localStorage.getItem('registroEntradas') || '[]');
let chartRegistro = null, serieRegistro = null;

function registrarEntrada(par, dir, score, enabled, extra) {
    let t = Math.floor(Date.now() / 1000);
    if (registro.length && t <= registro[registro.length - 1].t) t = registro[registro.length - 1].t + 1;
    registro.push(Object.assign({ t, par, dir, score, enabled }, extra || {}));
    if (registro.length > 200) registro = registro.slice(-200);
    localStorage.setItem('registroEntradas', JSON.stringify(registro));
}

// Alinha o topo do dock fixo à altura real da barra superior (que pode quebrar linha)
function ajustarTopoRegistro() {
    const tb = document.querySelector('.qo-topbar');
    if (tb) document.documentElement.style.setProperty('--reg-top', (tb.offsetHeight + 8) + 'px');
}
window.addEventListener('resize', ajustarTopoRegistro);

let _dockVisivelAntes = null;
function renderRegistro() {
    const panel = document.getElementById('registroPanel');
    const visivel = registro.length > 0;
    document.body.classList.toggle('tem-registro', visivel);
    // Quando o dock entra/sai, a largura útil muda: re-ajusta os gráficos (senão o
    // gráfico transborda por baixo do dock). Reusa o handler de resize da janela.
    if (visivel !== _dockVisivelAntes) {
        _dockVisivelAntes = visivel;
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
    if (!registro.length) { panel.style.display = 'none'; return; }
    ajustarTopoRegistro();
    panel.style.display = 'flex';
    // Filtro de qualidade: mostra só as entradas de selo A e B (esconde as C e
    // as sem selo). Desmarcado, mostra todas.
    const soAB = (document.getElementById('regSoA') || {}).checked;
    const lista = soAB ? registro.filter(r => r.grade === 'A' || r.grade === 'B') : registro;
    // Notícias na janela do registro (contagem exibida no meta)
    const tMin = registro[0].t - 3600, tMax = registro[registro.length - 1].t + 3600;
    const news = noticias
        .map(n => ({ t: Math.floor(n.date.getTime() / 1000), title: n.title }))
        .filter(n => n.t >= tMin && n.t <= tMax);
    // Régua de SETAS NA VERTICAL (mais recentes no topo): direção + resultado WIN/LOSS
    document.getElementById('regArrows').innerHTML = lista.slice().reverse().slice(0, 12).map(r => {
        const up = r.dir === 1;
        const cls = r.resultado === 'WIN' ? 'seta-win' : r.resultado === 'LOSS' ? 'seta-loss' : '';
        return `<span class="reg-seta ${up ? 'seta-up' : 'seta-down'} ${cls}" title="${fmtHora(r.t)} · ${up ? 'CALL' : 'PUT'}${r.resultado ? ' · ' + r.resultado : ''}">${up ? '▲' : '▼'}</span>`;
    }).join('');
    document.getElementById('registroMeta').textContent = soAB
        ? lista.length + ' nível A/B · ' + registro.length + ' no total' + (news.length ? ' · ⚡ ' + news.length : '')
        : registro.length + ' entrada' + (registro.length > 1 ? 's' : '') + (news.length ? ' · ⚡ ' + news.length + ' notícias' : '');
    document.getElementById('registroBody').innerHTML = lista.length ? lista.slice().reverse().map(r => {
        const res = r.resultado === 'WIN' ? '<span class="reg-res reg-win" title="acertou">✓</span>'
            : r.resultado === 'LOSS' ? '<span class="reg-res reg-loss" title="errou">✗</span>'
            : (r.exp && r.t + r.exp * 60 > Math.floor(Date.now() / 1000)) ? '<span class="reg-res reg-open" title="aguardando expiração">⏳</span>' : '';
        return `<div class="reg-row" data-idx="${registro.indexOf(r)}" title="ver motivos, gráfico e horários"><span class="reg-hora">${fmtHora(r.t)}</span>` +
            `<span class="reg-par">${r.par}${r.live ? ' <span class="reg-tag" title="IA ao vivo">IA</span>' : ''}</span>` +
            (r.grade ? `<span class="reg-grade grade-${r.grade}">${r.grade}</span>` : '') +
            (r.funil != null ? `<span class="reg-funil" title="funil de qualidade no momento da entrada">${r.funil}/6</span>` : '') +
            (r.paper ? `<span class="reg-paper" title="operação da conta demo (paper trading) · stake ${_pMoney(r.stake || 0)}">🎮</span>` : '') +
            (r.nota || (r.tags && r.tags.length) ? `<span class="reg-nota" title="tem anotação no diário — clique p/ ver">📝</span>` : '') +
            `<span class="${r.dir === 1 ? 'chip-dir-up' : 'chip-dir-down'}">${r.dir === 1 ? '▲ CALL' : '▼ PUT'} ${r.score}/${r.enabled}</span>${res}</div>`;
    }).join('') : '<div class="metric-empty" style="padding:10px 4px;">Sem entradas A/B ainda · desmarque o filtro p/ ver todas.</div>';
    atualizarCalibracaoIA();
    if (typeof renderPiloto === 'function') renderPiloto();   // conta demo acompanha o registro
    try { if (typeof renderPlacarDia === 'function') renderPlacarDia(); } catch (e) { }   // tile "Hoje"
    try { if (typeof renderRisco === 'function') renderRisco(); } catch (e) { }           // guardião de banca
}

// ---- Verificador automático de WIN/LOSS ----
// Passada a expiração, resolve o desfecho de cada entrada do registro comparando
// o preço na entrada × na expiração. Usa as velas do par aberto (qualquer fonte)
// ou busca uma janela 1m na Binance para pares não abertos. Persiste o resultado.
function _desfechoPelasVelas(r, velas) {
    const alvo = r.t + r.exp * 60;
    if (!velas.length || velas[velas.length - 1].time < alvo) return null;   // ainda não expirou nessas velas
    let iE = -1, iA = -1;
    for (let i = 0; i < velas.length; i++) { if (velas[i].time <= r.t) iE = i; if (velas[i].time <= alvo) iA = i; }
    if (iE < 0 || iA <= iE) return null;
    const dif = velas[iA].close - velas[iE].close;
    if (dif === 0) return null;                            // empate não conta
    return (r.dir === 1) === (dif > 0) ? 'WIN' : 'LOSS';
}
async function klinesBinanceJanela(sym, t0, t1) {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${sym}&interval=1m&startTime=${t0 * 1000}&endTime=${t1 * 1000}&limit=1000`;
    const resp = await fetchRetry(url); if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return (await resp.json()).map(k => ({ time: Math.floor(k[0] / 1000), close: +k[4] }));
}
let verificando = false;
async function verificarEntradasPendentes() {
    if (verificando) return; verificando = true;
    try {
        const agora = Math.floor(Date.now() / 1000);
        const lblAberto = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
        let mudou = false;
        // 1) par aberto (qualquer fonte): resolve com as velas já carregadas
        if (dados.length) for (const r of registro) {
            if (r.resultado || !r.exp || (r.t + r.exp * 60) >= agora - 3 || r.par !== lblAberto) continue;
            const d = _desfechoPelasVelas(r, dados); if (d) { r.resultado = d; mudou = true; }
        }
        // 2) pares Binance não abertos: busca janela 1m (agrupado por símbolo, 1 req cada)
        const pend = registro.filter(r => !r.resultado && r.exp && r.sym && r.fonte === 'binance' && (r.t + r.exp * 60) < agora - 3);
        const porSym = {}; pend.forEach(r => (porSym[r.sym] = porSym[r.sym] || []).push(r));
        for (const sym of Object.keys(porSym)) {
            const ents = porSym[sym];
            const t0 = Math.min(...ents.map(e => e.t)) - 120;
            const t1 = Math.min(agora, Math.max(...ents.map(e => e.t + e.exp * 60)) + 120);
            let velas; try { velas = await klinesBinanceJanela(sym, t0, t1); } catch (e) { continue; }
            if (!velas || !velas.length) continue;
            ents.forEach(r => { const d = _desfechoPelasVelas(r, velas); if (d) { r.resultado = d; mudou = true; } });
        }
        if (mudou) { localStorage.setItem('registroEntradas', JSON.stringify(registro)); renderRegistro(); }
    } finally { verificando = false; }
}

// ---- Calibração da IA: acerto PREVISTO (backtest) × acerto REAL (verificado) ----
function atualizarCalibracaoIA() {
    const cal = document.getElementById('iaCalib');
    if (!cal) return;
    // curva previsto×realizado + acerto real por fator (bloco 23) acompanham o placar
    try { if (typeof renderCalibracaoAvancada === 'function') renderCalibracaoAvancada(); } catch (e) { }
    const cc = iaCache[symbolAtual() + '|' + regimeUltimo()] || iaCache[symbolAtual()];
    const res = registro.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS');
    if (res.length < 3) { cal.style.display = 'none'; return; }
    const wins = res.filter(r => r.resultado === 'WIN').length;
    const real = wins / res.length;
    const lb = wilsonLB(wins, res.length);
    cal.style.display = 'block';
    // Placar real com faixa de confiança: acerto de ponto + limite inferior (95%).
    // A amostra pequena é sinalizada — poucos resultados não provam nada ainda.
    let txt = `📊 Placar real: <strong>${wins}/${res.length}</strong> (${pctTxt(real)}, LB ${pctTxt(lb)})`;
    if (res.length < 10) txt += ` <span class="chip-dir-none">amostra pequena</span>`;
    if (cc) {
        // "calibrada" = a previsão da IA cai dentro do intervalo plausível do real,
        // não apenas perto do ponto — julga contra a incerteza, não contra a sorte.
        const dentro = cc.wr >= lb - 0.02;
        txt += ` · IA previu ${pctTxt(cc.wr)}${cc.wrLB != null ? ' (LB ' + pctTxt(cc.wrLB) + ')' : ''} <span class="${dentro ? 'chip-dir-up' : 'chip-dir-down'}">${dentro ? 'calibrada ✓' : 'otimista ⚠'}</span>`;
    }
    // Placar POR FUNIL: prova empírica de que funil alto acerta mais (ou avisa
    // quando não está acontecendo — aí o funil precisa de ajuste).
    const comFunil = res.filter(r => r.funil != null);
    if (comFunil.length >= 4) {
        const alto = comFunil.filter(r => r.funil >= 5), baixo = comFunil.filter(r => r.funil <= 4);
        const wrDe = a => { const w = a.filter(r => r.resultado === 'WIN').length; return a.length ? `${Math.round(w / a.length * 100)}% (${w}/${a.length})` : '—'; };
        txt += `<br>🎯 Funil ≥5: <strong>${wrDe(alto)}</strong> · funil ≤4: <strong>${wrDe(baixo)}</strong>`;
    }
    cal.innerHTML = txt;
}

// ============================================================================
// BLOCO 8.6 — IA / OTIMIZADOR (busca os parâmetros com maior índice de acerto)
// ============================================================================
// Faz uma busca em grade sobre os parâmetros de confluência no histórico já
// carregado do par atual, avalia a taxa de acerto (WIN/LOSS) de cada combinação
// e ranqueia as de melhor desempenho. Reaproveita recomputar*/entradas.

const IA_GRID = {
    minScore: [3, 4, 5],
    rsi: [[30, 70], [35, 65], [25, 75]],
    estruturaLookback: [10, 20, 30],
    cooldownVelas: [3, 5]
};
// Amostra mínima na VALIDAÇÃO (out-of-sample), configurável na UI (#iaMinVal).
// O treino exige o dobro — mantém a proporção histórica (3 val → 6 treino).
function iaMinVal() { return Math.max(3, parseInt(document.getElementById('iaMinVal').value) || 3); }
function iaMinOps() { return iaMinVal() * 2; }
const IA_VELAS = 500;    // histórico por TF na otimização (mais amostra = validação mais confiável)
let iaCancelar = false, iaRodando = false, autoReoptTimer = null;

// Melhores parâmetros memorizados por par (usados pelo scanner). Persistente.
let iaCache = JSON.parse(localStorage.getItem('iaCache') || '{}');

function statsEnt(ents) {
    const av = ents.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    const w = av.filter(e => e.resultado === 'WIN').length;
    return { ops: av.length, w, wr: av.length ? w / av.length : 0 };
}

// Avalia a combinação já aplicada (inputs) sobre o `dados` atual — walk-forward
// ROBUSTO: treino nos primeiros 55% e validação em 3 janelas deslizantes
// (55–70%, 70–85%, 85–100%). robustVal = pior janela com amostra — um parâmetro
// que só funciona num pedaço da validação (sorte) não passa mais.
// wrLB = limite inferior de Wilson da validação: a taxa de acerto que temos ~95%
// de confiança de existir (amostra pequena é penalizada automaticamente).
function avaliarWalkForward() {
    recomputarIndicadores(); recomputarSinais(); recomputarEntradas();
    const n = dados.length;
    const treino = statsEnt(entradas.filter(e => e.index < Math.floor(n * 0.55)));
    const folds = [[0.55, 0.70], [0.70, 0.85], [0.85, 1.001]].map(([a, b]) =>
        statsEnt(entradas.filter(e => e.index >= Math.floor(n * a) && e.index < Math.floor(n * b))));
    const w = folds.reduce((s, f) => s + f.w, 0), ops = folds.reduce((s, f) => s + f.ops, 0);
    const comAmostra = folds.filter(f => f.ops >= 2);
    // robustez conservadora: pior janela medida no LIMITE INFERIOR de Wilson
    const robustVal = comAmostra.length ? Math.min(...comAmostra.map(f => f.wr)) : (ops ? w / ops : 0);
    const robustLB = comAmostra.length ? Math.min(...comAmostra.map(f => wilsonLB(f.w, f.ops))) : wilsonLB(w, ops);
    return { treino, val: { ops, w, wr: ops ? w / ops : 0, wrLB: wilsonLB(w, ops) }, robustVal, robustLB };
}

// Snapshot da configuração de backtest (DOM → objeto simples), enviado ao worker.
// Os campos que a grade varia (minScore/rsi/estrutura/cooldown/exp) são
// sobrescritos por combo dentro de avaliarGridPuro.
function lerConfigIA(tf) {
    const el = id => document.getElementById(id);
    const num = id => parseInt(el(id).value);
    const chk = id => el(id).checked;
    return {
        tf,
        emaRapida: num('emaRapida'), emaLenta: num('emaLenta'), rsiLen: num('rsiLen'),
        atrLen: num('atrLen'), atrMediaLen: num('atrMediaLen'),
        useTendencia: chk('useTendencia'), useEma200: chk('useEma200'), useMomentum: chk('useMomentum'),
        useVolatilidade: chk('useVolatilidade'), useEstrutura: chk('useEstrutura'),
        useFluxo: chk('useFluxo'), useCorrelacao: chk('useCorrelacao'), usePadrao: chk('usePadrao'),
        useMacd: chk('useMacd'), useBollinger: chk('useBollinger'),
        useSessao: chk('useSessao'), useSR: chk('useSR'),
        confMode: el('confMode').value, confJanela: num('confJanela'), fluxoJanela: num('fluxoJanela'),
        srAtr: parseFloat(el('srAtr').value) || 0.5
    };
}

// ---- Gerenciador do Web Worker do backtest (com fallback na thread principal) ----
let _iaWorker = null, _iaWorkerId = 0, _iaWorkerQuebrado = false;
function iaWorkerDisponivel() {
    if (_iaWorkerQuebrado) return false;
    if (_iaWorker) return true;
    try {
        if (typeof Worker === 'undefined' || typeof window === 'undefined' || !window.__IA_CORE_SRC__) { _iaWorkerQuebrado = true; return false; }
        _iaWorker = new Worker(URL.createObjectURL(new Blob([window.__IA_CORE_SRC__], { type: 'application/javascript' })));
        return true;
    } catch (e) { _iaWorkerQuebrado = true; return false; }
}
// Avalia a grade de um (símbolo × TF) no worker; qualquer falha cai no fallback
// síncrono (mesmo núcleo puro), garantindo resultado idêntico.
function avaliarGridWorker(dados, cfgBase, combos, minVal, minOps, beWR) {
    return new Promise(resolve => {
        const fallback = () => resolve(avaliarGridPuro(dados, cfgBase, combos, minVal, minOps, beWR));
        if (!iaWorkerDisponivel()) return fallback();
        const id = ++_iaWorkerId, w = _iaWorker;
        const limpar = () => { clearTimeout(to); w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); };
        const to = setTimeout(() => { limpar(); _iaWorkerQuebrado = true; try { w.terminate(); } catch (e) {} _iaWorker = null; fallback(); }, 30000);
        function onMsg(ev) { if (!ev.data || ev.data.id !== id) return; limpar(); ev.data.ok ? resolve(ev.data.best) : fallback(); }
        function onErr() { limpar(); _iaWorkerQuebrado = true; fallback(); }
        w.addEventListener('message', onMsg); w.addEventListener('error', onErr);
        w.postMessage({ id, dados, cfgBase, combos, minVal, minOps, beWR });
    });
}

// Otimiza UM símbolo: varre a grade × timeframes e devolve o melhor combo por TF
// (ordenado por edge líquido), já gravando o campeão em iaCache (geral + por regime).
// Cada TF tem a grade avaliada no Web Worker (fora da thread da tela).
async function _iaOtimizarSimbolo(symbol, isSim, dSimBase, beWR, EXP_OPCOES, el) {
    const tfs = isSim ? [tfMinutes()] : TFS_IA;
    const minVal = iaMinVal(), minOps = iaMinOps();   // amostra mínima (UI) — fixa nesta rodada
    const porTf = [];
    let totalCombos = 0, regSym = null;
    for (const tf of tfs) {
        if (iaCancelar) break;
        let dTf = dSimBase;
        if (!isSim) {
            try { dTf = await carregarHistoricoTF(symbol, tf, IA_VELAS); } catch (e) { continue; }
            if (!dTf || dTf.length < 210) continue;
            // Histórico acumulado (IndexedDB): treina com MESES de velas, não só a janela da API
            try { if (typeof historicoParaIA === 'function') dTf = await historicoParaIA(symbol, tf, dTf); } catch (e) { }
        }
        dados = dTf; el('timeframe').value = tf;
        // Regime do ativo (medido no primeiro TF carregado) — indexa o iaCache por regime
        if (regSym == null) { recomputarIndicadores(); regSym = regimeUltimo(); }
        const exps = EXP_OPCOES.filter(e => e >= tf && e % tf === 0 && e / tf <= 12);
        let combos = [];
        for (const exp of exps)
            for (const ms of IA_GRID.minScore)
                for (const [sv, sc] of IA_GRID.rsi)
                    for (const lk of IA_GRID.estruturaLookback)
                        for (const cd of IA_GRID.cooldownVelas)
                            combos.push({ exp, ms, sv, sc, lk, cd });
        // Busca inteligente: amostra aleatória da grade (qualidade quase igual,
        // ~1/3 do tempo). O melhor combo já conhecido do par entra sempre.
        if (document.getElementById('iaRapida').checked && combos.length > 72) {
            for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [combos[i], combos[j]] = [combos[j], combos[i]]; }
            combos = combos.slice(0, 72);
            const cc = iaCache[symbol + '|' + regSym] || iaCache[symbol];
            if (cc && exps.includes(cc.exp)) combos.push({ exp: cc.exp, ms: cc.ms, sv: cc.sv, sc: cc.sc, lk: cc.lk, cd: cc.cd });
        }
        // Toda a grade deste TF vai de uma vez para o Web Worker (fora da thread
        // da tela); se o worker não existir, o MESMO núcleo roda como fallback.
        const cfgBase = lerConfigIA(tf);
        const best = await avaliarGridWorker(dTf, cfgBase, combos, minVal, minOps, beWR);
        totalCombos += combos.length;
        if (best) { best.tf = tf; porTf.push(best); }
    }
    const payout = 1 / beWR - 1;   // recupera o payout a partir do break-even
    // Ranqueia pelo EDGE LÍQUIDO NO LIMITE INFERIOR (conservador): prefere o combo
    // com evidência estatística de vantagem, não o de win rate cru mais alto.
    porTf.forEach(r => {
        r.edge = r.val.wr - beWR;              // edge do ponto estimado
        r.edgeLB = r.val.wrLB - beWR;          // edge que a estatística garante (~95%)
        r.expOp = expectancia(r.val.wr, payout);   // R$ esperado por R$1 arriscado
    });
    porTf.sort((a, b) => b.edgeLB - a.edgeLB || b.edge - a.edge);
    if (porTf.length) {
        const rec = porTf[0];
        const reg = { tf: rec.tf, exp: rec.exp, ms: rec.ms, sv: rec.sv, sc: rec.sc, lk: rec.lk, cd: rec.cd, wr: rec.val.wr, wrLB: rec.val.wrLB, ops: rec.val.ops, reg: regSym };
        iaCache[symbol] = reg;                                  // fallback geral
        if (regSym) iaCache[symbol + '|' + regSym] = reg;       // conjunto específico do regime
    }
    return { porTf, totalCombos };
}

const edgeTxtIA = e => (e >= 0 ? '+' : '') + (e * 100).toFixed(1) + ' pp';

async function otimizarIA() {
    const isSim = fonte() === 'sim';
    if (isSim && (!dados || dados.length < 210)) { showToast('Carregue um par primeiro (mín. ~210 velas).', 'err'); return; }
    const btn = document.getElementById('btnIA');
    const el = id => document.getElementById(id);

    // No modo Simulado não há dados por símbolo — otimiza só o par atual.
    // Nas fontes ao vivo, otimiza as moedas marcadas no checklist "🎯 Moedas p/ análise".
    let symbols;
    if (isSim) symbols = [symbolAtual()];
    else {
        symbols = scanUniverse().filter(scanChecked);
        // Fim de semana: pula forex (velas congeladas geram parâmetros falsos)
        const fmIA = filtrarMercadoAberto(symbols);
        if (fmIA.puladas) showToast(`⏸ ${fmIA.puladas} par(es) de forex pulado(s) — mercado real fechado`, 'info');
        symbols = fmIA.lista;
        if (!symbols.length) {
            showToast('Sem moedas com mercado aberto — marque pares de cripto (24/7).', 'err');
            return;
        }
    }

    iaRodando = true; iaCancelar = false;
    const fimIA = () => { iaRodando = false; iaCancelar = false; btn.disabled = false; btn.textContent = '🤖 IA: otimizar parâmetros'; };
    btn.textContent = 'Analisando…';
    const ids = ['minScore', 'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas', 'confMode', 'timeframe', 'useHtf', 'usePesoIA', 'symbol', 'fonte'];
    const save = {}; ids.forEach(i => save[i] = el(i).type === 'checkbox' ? el(i).checked : el(i).value);
    el('confMode').value = 'score';
    el('useHtf').checked = false; htfTrend = [];   // HTF não se aplica ao backtest da grade
    el('usePesoIA').checked = false;               // peso é circular na otimização — desliga
    const dSave = dados;

    // Break-even do payout: a IA otimiza o edge LÍQUIDO (acerto − break-even),
    // não o acerto bruto — 52% a payout 87% ainda é prejuízo.
    const payout = Math.max(0.01, (parseFloat(el('payout').value) || 87) / 100);
    const beWR = 1 / (1 + payout);
    const EXP_OPCOES = [1, 5, 15, 30, 60];   // valores do seletor de expiração

    document.getElementById('iaPanel').style.display = 'block'; if (typeof railMostrar === 'function') railMostrar('iaPanel');
    const resultados = [];   // { symbol, label, porTf, totalCombos }
    let totalCombosGeral = 0;
    for (let k = 0; k < symbols.length; k++) {
        if (iaCancelar) break;
        const s = symbols[k];
        btn.textContent = `⏹ ${scanLabel(s)} (${k + 1}/${symbols.length}) — clique p/ cancelar`;
        document.getElementById('iaMeta').textContent = `Otimizando ${k + 1}/${symbols.length} moeda(s)…`;
        const { porTf, totalCombos } = await _iaOtimizarSimbolo(s, isSim, dSave, beWR, EXP_OPCOES, el);
        totalCombosGeral += totalCombos;
        resultados.push({ symbol: s, label: scanLabel(s), porTf, totalCombos });
    }
    localStorage.setItem('iaCache', JSON.stringify(iaCache));

    // restaura estado do usuário
    ids.forEach(i => { if (el(i).type === 'checkbox') el(i).checked = save[i]; else el(i).value = save[i]; });
    dados = dSave; recomputarIndicadores();
    if (el('useHtf').checked) await carregarHtf();
    recomputarSinais();

    if (iaCancelar) showToast('⏹ Otimização cancelada — resultados parciais mantidos', 'info');
    document.getElementById('iaMeta').textContent = totalCombosGeral + ' combinações · ' + symbols.length + ' moeda(s) · break-even ' + (beWR * 100).toFixed(1) + '% · amostra mín. ' + iaMinVal() + ' val / ' + iaMinOps() + ' treino';

    if (symbols.length === 1) { renderIAUmPar(resultados[0], isSim, el); fimIA(); return; }

    // ---- VISÃO MULTI-MOEDA: um resultado por moeda (o melhor combo de cada) ----
    const comOk = resultados.filter(r => r.porTf.length);
    const semOk = resultados.filter(r => !r.porTf.length);
    comOk.sort((a, b) => b.porTf[0].edgeLB - a.porTf[0].edgeLB);
    if (!comOk.length) {
        document.getElementById('iaContext').textContent = `Nenhuma das ${symbols.length} moedas atingiu a amostra mínima (${iaMinVal()} val / ${iaMinOps()} treino). Aumente as velas (300+), reduza a “Amostra mínima” ou a seleção.`;
        document.getElementById('iaList').innerHTML = '';
        fimIA(); return;
    }
    document.getElementById('iaContext').textContent =
        `${comOk.length}/${symbols.length} afinadas · melhor: ${comOk[0].label} ${pctTxt(comOk[0].porTf[0].val.wr)} val (edge LB ${edgeTxtIA(comOk[0].porTf[0].edgeLB)}) · ordenado por edge LB · clique p/ abrir`;
    const rows = comOk.map((r, i) => {
        const b = r.porTf[0];
        const vwr = pctTxt(b.val.wr), lb = pctTxt(b.val.wrLB), twr = pctTxt(b.treino.wr);
        const cls = b.edgeLB >= 0.05 ? 'chip-dir-up' : b.edgeLB >= 0 ? '' : 'chip-dir-down';
        const star = i === 0 ? '<span class="scan-tuned">✦</span> ' : '';
        const expTxt = (b.expOp >= 0 ? '+' : '') + b.expOp.toFixed(2);
        return `<div class="reg-row ia-row" data-sym="${r.symbol}" data-tf="${b.tf}" data-exp="${b.exp}" data-ms="${b.ms}" data-sv="${b.sv}" data-sc="${b.sc}" data-lk="${b.lk}" data-cd="${b.cd}">` +
            `<span class="reg-hora">${star}${r.label}</span>` +
            `<span class="reg-par"><span class="${cls}">${vwr} val · LB ${lb}</span> <span class="ia-params">(exp ${expTxt}/op · ${b.val.w}/${b.val.ops} ops · ${rotTf(b.tf)}·${b.exp}m)</span></span>` +
            `<span class="ia-params">score≥${b.ms} · RSI ${b.sv}/${b.sc} · estrut ${b.lk} · cd ${b.cd}</span></div>`;
    });
    if (semOk.length) rows.push(`<div class="reg-row"><span class="ia-params" style="opacity:.7">Sem edge válido: ${semOk.map(r => r.label).join(', ')}</span></div>`);
    document.getElementById('iaList').innerHTML = rows.join('');
    document.getElementById('iaList').querySelectorAll('.ia-row').forEach(row => row.addEventListener('click', () => {
        const d = row.dataset;
        el('confMode').value = 'score';
        el('minScore').value = d.ms; el('rsiSobrevenda').value = d.sv; el('rsiSobrecompra').value = d.sc;
        el('estruturaLookback').value = d.lk; el('cooldownVelas').value = d.cd; el('expiracao').value = d.exp;
        el('timeframe').value = d.tf;
        // modo combinado: mantém 'ambos' (o gráfico resolve a fonte pelo símbolo)
        if (!modoCombinado()) el('fonte').value = PARES_YAHOO[d.sym] ? (ehForex() ? fonte() : 'twelvedata') : 'binance';
        el('symbol').value = d.sym;
        row.parentElement.querySelectorAll('.ia-row').forEach(x => x.classList.remove('ia-sel'));
        row.classList.add('ia-sel');
        montarWidgetTV(); carregar();
    }));
    fimIA();
}

// Visão detalhada de UMA moeda (comportamento clássico: melhor combo por timeframe).
function renderIAUmPar(resultado, isSim, el) {
    const symbol = resultado.symbol;
    const porTf = resultado.porTf;
    const par = PARES_YAHOO[symbol] ? PARES_YAHOO[symbol].label : symbol;
    if (!porTf.length) {
        document.getElementById('iaContext').textContent = `Nenhuma combinação atingiu a amostra mínima (${iaMinVal()} val / ${iaMinOps()} treino) para ${par}. Carregue mais velas (300+), reduza a “Amostra mínima” ou troque o par.`;
        document.getElementById('iaList').innerHTML = '';
        return;
    }
    const rec = porTf[0];
    const expBest = (rec.expOp >= 0 ? '+' : '') + rec.expOp.toFixed(2);
    document.getElementById('iaContext').textContent =
        `${par}: ${rotTf(rec.tf)}·${rec.exp}m · ${pctTxt(rec.val.wr)} val · LB ${pctTxt(rec.val.wrLB)} · edge LB ${edgeTxtIA(rec.edgeLB)} · ${expBest}/op · clique p/ aplicar`;
    document.getElementById('iaList').innerHTML = porTf.map((r, i) => {
        const vwr = pctTxt(r.val.wr), lb = pctTxt(r.val.wrLB), twr = pctTxt(r.treino.wr);
        const cls = r.edgeLB >= 0.05 ? 'chip-dir-up' : r.edgeLB >= 0 ? '' : 'chip-dir-down';
        const star = i === 0 ? '<span class="scan-tuned">✦</span> ' : '';
        const expTxt = (r.expOp >= 0 ? '+' : '') + r.expOp.toFixed(2);
        return `<div class="reg-row ia-row" data-i="${i}">` +
            `<span class="reg-hora">${star}${rotTf(r.tf)}·${r.exp}m</span>` +
            `<span class="reg-par"><span class="${cls}">${vwr} val · LB ${lb}</span> <span class="ia-params">(exp ${expTxt}/op · ${twr} treino · ${r.val.w}/${r.val.ops} ops)</span></span>` +
            `<span class="ia-params">score≥${r.ms} · RSI ${r.sv}/${r.sc} · estrut ${r.lk} · cd ${r.cd}</span></div>`;
    }).join('');
    document.getElementById('iaList').querySelectorAll('.ia-row').forEach(row => row.addEventListener('click', () => {
        const r = porTf[+row.getAttribute('data-i')];
        el('confMode').value = 'score'; el('minScore').value = r.ms;
        el('rsiSobrevenda').value = r.sv; el('rsiSobrecompra').value = r.sc;
        el('estruturaLookback').value = r.lk; el('cooldownVelas').value = r.cd;
        el('expiracao').value = r.exp;
        iaCache[symbol] = { tf: r.tf, exp: r.exp, ms: r.ms, sv: r.sv, sc: r.sc, lk: r.lk, cd: r.cd, wr: r.val.wr, wrLB: r.val.wrLB, ops: r.val.ops };
        localStorage.setItem('iaCache', JSON.stringify(iaCache));
        row.parentElement.querySelectorAll('.ia-row').forEach(x => x.classList.remove('ia-sel'));
        row.classList.add('ia-sel');
        // se o TF recomendado difere do atual, recarrega nesse TF; senão só recalcula
        if (!isSim && String(r.tf) !== String(tfMinutes())) { el('timeframe').value = r.tf; carregar(); }
        else recalcularSinaisApenas();
    }));
}

function rotTf(m) { return m === 60 ? 'H1' : 'M' + m; }

// ============================================================================
// BLOCO 8.7 — ESTUDOS DE MERCADO (regime, horário e fatores com mais acerto)
// ============================================================================
// Lê as entradas backtestadas do par atual e extrai padrões que ajudam o
// trader a ESTUDAR o mercado: em que horário o setup mais acerta, qual fator
// de confluência mais aparece nos WINs, e qual o regime atual (tendência ×
// lateral, volatilidade alta × baixa).

const FATORES_NOMES = { T: 'Tendência', Ma: 'EMA 200', Mo: 'RSI', V: 'ATR', E: 'Estrutura', F: 'Fluxo', C: 'Correlação', P: 'Padrão de vela', X: 'MACD', B: 'Bollinger' };

function regimeAtual() {
    const last = dados.length - 1;
    const e200 = computed.ema200, atrV = computed.atrValues, atrM = computed.atrMedia;
    const chips = [];
    if (e200 && e200[last] != null && e200[last - 20] != null) {
        const slope = (e200[last] - e200[last - 20]) / e200[last - 20];
        const acima = dados[last].close > e200[last];
        if (Math.abs(slope) < 0.0005) chips.push({ t: '↔ Mercado LATERAL (EMA200 plana)', c: '' });
        else if (slope > 0 && acima) chips.push({ t: '📈 TENDÊNCIA DE ALTA (preço acima da EMA200 subindo)', c: 'chip-dir-up' });
        else if (slope < 0 && !acima) chips.push({ t: '📉 TENDÊNCIA DE BAIXA (preço abaixo da EMA200 caindo)', c: 'chip-dir-down' });
        else chips.push({ t: '⚠️ TRANSIÇÃO — preço contra a EMA200, cuidado com reversão', c: '' });
    }
    if (atrV && atrV[last] != null && atrM && atrM[last] != null) {
        const razao = atrV[last] / atrM[last];
        if (razao >= 1.3) chips.push({ t: `🔥 Volatilidade ALTA (ATR ${razao.toFixed(2)}× a média) — movimentos amplos`, c: 'chip-dir-down' });
        else if (razao <= 0.75) chips.push({ t: `😴 Volatilidade BAIXA (ATR ${razao.toFixed(2)}× a média) — mercado parado`, c: '' });
        else chips.push({ t: `✅ Volatilidade normal (ATR ${razao.toFixed(2)}× a média)`, c: 'chip-dir-up' });
    }
    return chips;
}

function barraWr(label, w, t) {
    const wr = t ? w / t * 100 : 0;
    const cls = wr >= 60 ? 'bar-good' : wr >= 50 ? 'bar-mid' : 'bar-bad';
    return `<div class="estudo-row"><span class="estudo-lbl">${label}</span>` +
        `<span class="estudo-bar"><span class="estudo-fill ${cls}" style="width:${Math.round(wr)}%"></span></span>` +
        `<span class="estudo-num">${wr.toFixed(0)}% (${w}/${t})</span></div>`;
}

function renderEstudo() {
    if (!dados.length || !computed.ema200) return;
    const av = entradas.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    document.getElementById('estudoPanel').style.display = 'block'; if (typeof railMostrar === 'function') railMostrar('estudoPanel');
    document.getElementById('estudoMeta').textContent = av.length + ' operações analisadas';
    document.getElementById('estudoRegime').innerHTML = regimeAtual().map(c =>
        `<span class="decision-chip"><span class="${c.c}">${c.t}</span></span>`).join('');

    // acerto por horário do dia
    const porHora = {};
    av.forEach(e => {
        const h = new Date(e.entryTime * 1000).getHours();
        (porHora[h] = porHora[h] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') porHora[h].w++;
    });
    const horas = Object.keys(porHora).map(Number).sort((a, b) => a - b);
    document.getElementById('estudoHoras').innerHTML = horas.length
        ? horas.map(h => barraWr(String(h).padStart(2, '0') + 'h', porHora[h].w, porHora[h].t)).join('')
        : '<div class="metric-empty">Sem operações avaliadas ainda.</div>';

    // acerto por fator presente na entrada
    const porFat = {};
    av.forEach(e => (e.fatores || '').split('·').forEach(k => {
        if (!FATORES_NOMES[k]) return;
        (porFat[k] = porFat[k] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') porFat[k].w++;
    }));
    const fks = Object.keys(porFat).sort((a, b) => (porFat[b].w / porFat[b].t) - (porFat[a].w / porFat[a].t));
    document.getElementById('estudoFatores').innerHTML = fks.length
        ? fks.map(k => barraWr(FATORES_NOMES[k], porFat[k].w, porFat[k].t)).join('')
        : '<div class="metric-empty">Sem operações avaliadas ainda.</div>';

    // acerto por sessão de mercado (Ásia / Londres / NY / sobreposição)
    const ORDEM_SES = ['Londres+NY', 'Londres', 'Nova York', 'Ásia'];
    const porSes = {};
    av.forEach(e => {
        const s = sessaoDe(e.entryTime);
        (porSes[s] = porSes[s] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') porSes[s].w++;
    });
    const sess = ORDEM_SES.filter(s => porSes[s]);
    document.getElementById('estudoSessoes').innerHTML = sess.length
        ? sess.map(s => barraWr(s, porSes[s].w, porSes[s].t)).join('')
        : '<div class="metric-empty">Sem operações avaliadas ainda.</div>';

    // dica de estudo gerada a partir dos padrões
    const dicas = [];
    const melhorH = horas.filter(h => porHora[h].t >= 3).sort((a, b) => porHora[b].w / porHora[b].t - porHora[a].w / porHora[a].t)[0];
    if (melhorH != null) dicas.push(`melhor horário do setup: ${String(melhorH).padStart(2, '0')}h (${(porHora[melhorH].w / porHora[melhorH].t * 100).toFixed(0)}% de acerto)`);
    const melhorF = fks.filter(k => porFat[k].t >= 5)[0];
    if (melhorF) dicas.push(`fator mais confiável: ${FATORES_NOMES[melhorF]} presente em ${(porFat[melhorF].w / porFat[melhorF].t * 100).toFixed(0)}% de acerto`);
    const piorF = fks.filter(k => porFat[k].t >= 5).slice(-1)[0];
    if (piorF && piorF !== melhorF && porFat[piorF].w / porFat[piorF].t < 0.5) dicas.push(`atenção: entradas com ${FATORES_NOMES[piorF]} acertaram menos de 50% — estude evitá-las neste par/timeframe`);
    const melhorS = sess.filter(s => porSes[s].t >= 4).sort((a, b) => porSes[b].w / porSes[b].t - porSes[a].w / porSes[a].t)[0];
    if (melhorS) dicas.push(`melhor sessão: ${melhorS} (${(porSes[melhorS].w / porSes[melhorS].t * 100).toFixed(0)}% de acerto)`);
    document.getElementById('estudoDica').textContent = dicas.length
        ? '💡 ' + dicas.join(' · ') + '.'
        : '💡 Carregue mais histórico (500+ velas) para padrões mais confiáveis.';
}

// ============================================================================
// BLOCO 9.5 — WIDGET OFICIAL DO TRADINGVIEW (gráfico real, requer internet)
// ============================================================================

let tvWidget = null;

function tvSymbolTV() {
    const cod = symbolAtual();
    if (cod === 'CRYPTOIDX') return 'CRYPTOCAP:TOTAL';   // proxy visual: cap. total do mercado cripto
    if (ehForex() && PARES_YAHOO[cod]) return PARES_YAHOO[cod].tv;   // ex.: FX:EURUSD, TVC:GOLD
    return 'BINANCE:' + cod;   // ex.: BINANCE:BTCUSDT
}
function tvIntervalTV() { return String(tfMinutes()); }         // 1,5,15,30,60

function montarWidgetTV(tentativa) {
    tentativa = tentativa || 0;
    const wrap = document.getElementById('tvWidget');
    const msg = document.getElementById('tvWidgetMsg');
    const tag = document.getElementById('tvSyncTag');
    if (!wrap) return;

    // A lib tv.js carrega de forma assíncrona; espera até estar disponível.
    if (typeof TradingView === 'undefined' || !TradingView.widget) {
        if (tentativa < 8) {
            if (msg) { msg.textContent = 'Carregando gráfico do TradingView… (requer internet)'; msg.style.display = 'flex'; }
            setTimeout(() => montarWidgetTV(tentativa + 1), 1200);
        } else if (msg) {
            msg.textContent = 'Widget do TradingView indisponível (sem internet ou bloqueado). O gráfico abaixo continua funcionando normalmente.';
            msg.style.display = 'flex';
        }
        return;
    }

    if (msg) msg.style.display = 'none';
    if (tag) tag.textContent = symbolAtual() + ' • ' + (tfMinutes() === 60 ? 'H1' : 'M' + tfMinutes());
    wrap.innerHTML = '';  // limpa antes de recriar (troca de par/timeframe)

    try {
        tvWidget = new TradingView.widget({
            container_id: 'tvWidget',
            autosize: true,
            symbol: tvSymbolTV(),
            interval: tvIntervalTV(),
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'br',
            hide_side_toolbar: false,
            allow_symbol_change: true,
            withdateranges: true,
            // Estudos que espelham a estratégia de confluência
            studies: [
                'MAExp@tv-basicstudies',   // EMA
                'RSI@tv-basicstudies',     // RSI
                'ATR@tv-basicstudies'      // ATR
            ]
        });
    } catch (e) {
        if (msg) { msg.textContent = 'Não foi possível iniciar o widget do TradingView.'; msg.style.display = 'flex'; }
        console.error('Widget TV:', e);
    }
}

// ============================================================================
// BLOCO 10 — CARREGAR LISTA DE PARES (datalist "todas as moedas")
// ============================================================================

async function carregarSimbolos() {
    try {
        const resp = await fetchTimeout(`${BINANCE_REST}/api/v3/exchangeInfo`);
        if (!resp.ok) return;
        const info = await resp.json();
        const trading = info.symbols.filter(s => s.status === 'TRADING').map(s => s.symbol);
        const dl = document.getElementById('listaSimbolos');
        const frag = document.createDocumentFragment();
        trading.slice().sort().forEach(sym => { const o = document.createElement('option'); o.value = sym; frag.appendChild(o); });
        dl.appendChild(frag);
        // Pares de câmbio que a Binance realmente lista entram no checklist do Scanner/IA
        const setT = new Set(trading);
        forexBinanceOk = Object.keys(FOREX_BINANCE_CAND).filter(s => setT.has(s));
        if (!ehForex() || modoCombinado()) renderScanFiltro();   // re-renderiza pra incluir os pares validados / universo combinado
    } catch (e) { /* offline: datalist fica vazio, campo continua editável */ }
}

// ============================================================================
// BLOCO 10.5 — NOTÍCIAS EM TEMPO REAL (RSS via proxy CORS, keyless)
// ============================================================================

// Proxy CORS que embrulha o RSS em JSON {contents:"<xml>"} — sobrescrevível por ?news=
const NEWS_PROXY = _params.get('news') || 'https://api.allorigins.win/get?url=';
const NEWS_FEEDS = [
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' }
];
let noticias = [];
let newsTimer = null;

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function tempoRelativo(d) {
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h';
    return 'há ' + Math.floor(s / 86400) + ' d';
}

function baseAsset() {
    const s = symbolAtual();
    return s.replace(/(USDT|BUSD|USDC|FDUSD|TUSD|USD|BTC|ETH|BRL|EUR|TRY)$/, '') || s;
}

async function carregarNoticias() {
    const status = document.getElementById('newsStatus');
    status.textContent = 'Atualizando…';
    try {
        const todas = [];
        for (const feed of NEWS_FEEDS) {
            try {
                const resp = await fetchTimeout(NEWS_PROXY + encodeURIComponent(feed.url));
                if (!resp.ok) continue;
                const data = await resp.json();
                const xml = data.contents || '';
                const doc = new DOMParser().parseFromString(xml, 'text/xml');
                [...doc.querySelectorAll('item')].slice(0, 15).forEach(it => {
                    const title = (it.querySelector('title')?.textContent || '').trim();
                    const link = (it.querySelector('link')?.textContent || '').trim();
                    const pd = it.querySelector('pubDate')?.textContent;
                    if (title) todas.push({ title, link, date: pd ? new Date(pd) : new Date(), source: feed.name });
                });
            } catch (e) { /* pula feed com erro */ }
        }
        if (!todas.length) throw new Error('sem itens');
        todas.sort((a, b) => b.date - a.date);
        noticias = todas.slice(0, 30);
        status.textContent = 'Atualizado ' + fmtHora(Math.floor(Date.now() / 1000));
        renderNoticias();
        atualizarPaineis();   // atualiza banner/flags de risco de notícia com as novas manchetes
        if (registro.length) renderRegistro();   // notícias novas entram na timeline do registro
    } catch (err) {
        status.textContent = 'Indisponível (requer internet)';
        document.getElementById('newsList').innerHTML =
            '<div class="news-empty">Não foi possível carregar notícias agora (requer internet). O restante do simulador continua funcionando.</div>';
    }
}

// Termos de busca da moeda atual (para filtrar notícias)
function termosMoeda() {
    if (symbolAtual() === 'CRYPTOIDX') return ['bitcoin', 'btc', 'crypto', 'ethereum'];  // índice: notícias gerais de cripto
    const base = baseAsset().toLowerCase();
    const nomes = {
        btc: ['btc', 'bitcoin'], eth: ['eth', 'ethereum'], sol: ['sol', 'solana'], xrp: ['xrp', 'ripple'],
        bnb: ['bnb', 'binance'], doge: ['doge', 'dogecoin'], ada: ['ada', 'cardano'], avax: ['avax', 'avalanche'],
        link: ['chainlink', 'link'], matic: ['polygon', 'matic'], ltc: ['litecoin', 'ltc']
    };
    return nomes[base] || [base];
}
function noticiasMoeda() {
    const termos = termosMoeda();
    return noticias.filter(n => termos.some(t => n.title.toLowerCase().includes(t)));
}
// Existe notícia da moeda dentro de +/- janela (min) do timestamp (seg)?
function noticiaProxima(tsSec, janelaMin) {
    return noticiasMoeda().some(n => Math.abs(Math.floor(n.date.getTime() / 1000) - tsSec) <= janelaMin * 60);
}

function renderNoticias() {
    const soMoeda = document.getElementById('newsSoMoeda').checked;
    let lista = noticias;
    if (soMoeda) lista = noticiasMoeda();

    const el = document.getElementById('newsList');
    if (!lista.length) {
        el.innerHTML = '<div class="news-empty">Nenhuma notícia' + (soMoeda ? ' para ' + baseAsset() : '') + ' no momento.</div>';
        return;
    }
    el.innerHTML = lista.map(n =>
        `<a class="news-item" href="${escapeHtml(n.link)}" target="_blank" rel="noopener">` +
        `<span class="news-time">${tempoRelativo(n.date)}</span>` +
        `<span class="news-title">${escapeHtml(n.title)}</span>` +
        `<span class="news-src">${escapeHtml(n.source)}</span></a>`
    ).join('');
}

// ============================================================================
// BLOCO 11 — EVENTOS
// ============================================================================

// ---- Ripple discreto nos botões (delegado; nasce no ponto do clique) ----
// Respeita prefers-reduced-motion — não cria o elemento se o usuário pediu
// menos movimento (a animação em si já é bloqueada por CSS como reforço).
const _reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('click', (ev) => {
    if (_reduceMotion()) return;
    const btn = ev.target.closest('.btn-primary, .btn-mini, .btn-preset, .qo-toggle');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const span = document.createElement('span');
    span.className = 'qo-ripple';
    span.style.width = span.style.height = d + 'px';
    span.style.left = (ev.clientX - r.left - d / 2) + 'px';
    span.style.top = (ev.clientY - r.top - d / 2) + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove());
});

document.getElementById('btnGerar').addEventListener('click', carregar);
document.getElementById('btnRecalcular').addEventListener('click', recalcularSinaisApenas);
document.getElementById('fonte').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial (prefixo BINANCE:/FX:/TVC: muda com a fonte)
    renderScanFiltro(); // a lista de moedas do scanner muda entre cripto e forex
    atualizarAvisoOTC(); // aviso de fim de semana segue a fonte
    carregar();
});
document.getElementById('scanFilTodas').addEventListener('click', function () {
    scanUniverse().forEach(s => scanSel[s] = true); salvarScanSel(); renderScanFiltro();
});
document.getElementById('scanFilLimpar').addEventListener('click', function () {
    scanUniverse().forEach(s => scanSel[s] = false); salvarScanSel(); renderScanFiltro();
});

// ---- Botão "⚙️ Controles": recolhe/expande a barra de configurações ----
function aplicarControles(mostrar) {
    const sb = document.querySelector('.sidebar');
    const btn = document.getElementById('btnControles');
    if (!sb || !btn) return;
    sb.classList.toggle('oculta', !mostrar);
    btn.classList.toggle('is-off', !mostrar);
    btn.setAttribute('aria-expanded', mostrar ? 'true' : 'false');
    btn.textContent = mostrar ? '⚙️ Controles' : '⚙️ Mostrar controles';
    // a largura útil mudou: gráficos remedem no próximo frame
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
document.getElementById('btnControles').addEventListener('click', function () {
    // se está oculta, o clique deve MOSTRAR; senão, ocultar
    const mostrar = document.querySelector('.sidebar').classList.contains('oculta');
    localStorage.setItem('ctrlVisivel', mostrar ? '1' : '0');
    aplicarControles(mostrar);
});

// ---- Toasts: avisos elegantes que substituem alert() (não travam a página) ----
function showToast(msg, tipo, ms) {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toastWrap'; wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast toast-' + (tipo || 'info');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('toast-out'), (ms || 4200) - 400);
    setTimeout(() => t.remove(), ms || 4200);
}

// ---- Tema claro/escuro (CSS por variáveis + recolore os gráficos existentes) ----
const CORES_TEMA = {
    dark: { bg: '#0e1520', text: '#AAB5C5', grid: '#1a2230', border: 'rgba(170,181,197,0.12)' },
    light: { bg: '#ffffff', text: '#3a4761', grid: '#e7ecf7', border: '#c9d4ea' }
};
function temaAtual() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function aplicarTema(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem('tema', t);
    const c = CORES_TEMA[t];
    [chartPreco, chartRsi, chartAtr, chartEquity, chartFluxo, chartRegistro].forEach(ch => {
        if (ch) ch.applyOptions({
            layout: { background: { color: c.bg }, textColor: c.text },
            grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
            rightPriceScale: { borderColor: c.border },
            timeScale: { borderColor: c.border }
        });
    });
}
document.getElementById('btnTema').addEventListener('click', () => aplicarTema(temaAtual() === 'dark' ? 'light' : 'dark'));

// ---- Notificação de navegador (aba em 2º plano) ----
function notificar(titulo, corpo, idx) {
    if (!document.getElementById('notifAtivo').checked) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;   // só quando a aba NÃO está em foco (senão o som já basta)
    try {
        const n = new Notification(titulo, { body: corpo, tag: 'quantops-veredito', silent: false });
        // um clique na notificação traz a aba de volta e abre o detalhe da entrada
        n.onclick = () => {
            window.focus();
            try { if (typeof abrirDetalheEntrada === 'function') abrirDetalheEntrada(idx != null ? idx : _ultimaEntradaIdx); } catch (e) { }
            n.close();
        };
    } catch (e) { }
}
document.getElementById('notifAtivo').addEventListener('change', function () {
    if (!this.checked) return;
    if (!('Notification' in window)) { showToast('Este navegador não suporta notificações.', 'err'); this.checked = false; return; }
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') showToast('🔔 Notificações ativadas — você será avisado com a aba em 2º plano', 'ok');
        else { showToast('Permissão de notificação negada pelo navegador.', 'err'); this.checked = false; }
    });
});

// ---- Painel de ajuda (atalho ?) ----
function toggleAjuda(mostrar) {
    const m = document.getElementById('ajudaModal');
    m.style.display = (mostrar == null ? m.style.display === 'none' : mostrar) ? 'flex' : 'none';
}
document.getElementById('btnAjuda').addEventListener('click', () => toggleAjuda());
document.getElementById('ajudaFechar').addEventListener('click', () => toggleAjuda(false));
document.getElementById('ajudaModal').addEventListener('click', e => { if (e.target.id === 'ajudaModal') toggleAjuda(false); });

// ---- Atalhos de teclado: C controles · S escanear · R recarregar · I IA · T tema · ? ajuda ----
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { toggleAjuda(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') { toggleAjuda(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    if (k === 'c') document.getElementById('btnControles').click();
    else if (k === 's') document.getElementById('btnScan').click();
    else if (k === 'r') document.getElementById('btnGerar').click();
    else if (k === 'i') document.getElementById('btnIA').click();
    else if (k === 't') document.getElementById('btnTema').click();
});

// ---- Exportar / importar o "cérebro" da IA (iaCache + pesos + seleção de moedas) ----
document.getElementById('btnIAExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ iaCache, pesoFatores, scanSel }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'quantops_ia.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('💾 Cérebro da IA exportado (quantops_ia.json)', 'ok');
});
document.getElementById('btnIAImport').addEventListener('click', () => document.getElementById('iaImportFile').click());
document.getElementById('iaImportFile').addEventListener('change', function () {
    const f = this.files && this.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
        try {
            const j = JSON.parse(rd.result);
            Object.assign(iaCache, j.iaCache || {});
            Object.assign(pesoFatores, j.pesoFatores || {});
            Object.assign(scanSel, j.scanSel || {});
            localStorage.setItem('iaCache', JSON.stringify(iaCache));
            localStorage.setItem('pesoFatores', JSON.stringify(pesoFatores));
            salvarScanSel(); renderScanFiltro();
            showToast('📂 IA importada: ' + Object.keys(j.iaCache || {}).length + ' conjunto(s) de parâmetros', 'ok');
        } catch (e) { showToast('Arquivo inválido: ' + e.message, 'err'); }
        this.value = '';
    };
    rd.readAsText(f);
});

// ---- Auto-reotimização da IA (a cada 60 min, se não estiver rodando) ----
function configurarAutoReopt() {
    if (autoReoptTimer) { clearInterval(autoReoptTimer); autoReoptTimer = null; }
    if (!document.getElementById('autoReopt').checked) return;
    autoReoptTimer = setInterval(() => {
        if (!iaRodando && fonte() !== 'sim') { showToast('🤖 Auto-reotimização da IA iniciada', 'info'); otimizarIA(); }
    }, 60 * 60000);
}
document.getElementById('autoReopt').addEventListener('change', function () {
    localStorage.setItem('autoReopt', this.checked ? '1' : '0');
    configurarAutoReopt();
    showToast(this.checked ? '🤖 Auto-reotimização LIGADA (a cada 60 min)' : 'Auto-reotimização desligada', 'info');
});

// ---- Cache de velas (TTL 60s): IA em lote + Scanner reusam o mesmo histórico ----
const cacheVelas = new Map();
const CACHE_VELAS_TTL = 60000;
async function comCache(chave, fn) {
    const hit = cacheVelas.get(chave);
    if (hit && Date.now() - hit.t < CACHE_VELAS_TTL) return hit.d;
    const d = await fn();
    if (d && d.length) cacheVelas.set(chave, { t: Date.now(), d });
    if (cacheVelas.size > 400) cacheVelas.delete(cacheVelas.keys().next().value);
    return d;
}

// ---- Regime da última vela (para o iaCache ciente de regime) ----
function regimeUltimo() {
    try { const r = regimePorBarra(); return r[r.length - 1] || 'range'; } catch (e) { return 'range'; }
}
document.getElementById('timeframe').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial com o novo timeframe
    carregar();
});
document.getElementById('symbol').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial com o novo par
    renderNoticias();   // re-filtra notícias pela nova moeda
    if (fonte() !== 'sim') carregar();
});
document.getElementById('parPopular').addEventListener('change', function () {
    const cod = this.value;
    if (!cod) return;
    // Padrão = Twelve Data (mais estável); se falhar, o carregar() cai p/ Yahoo sozinho.
    // Se a fonte Forex já estiver escolhida, respeita a escolha do usuário.
    if (!ehForex()) document.getElementById('fonte').value = 'twelvedata';
    document.getElementById('symbol').value = cod;
    montarWidgetTV();
    carregar();
});
// Trocar a chave do Twelve Data: persiste e recarrega se essa for a fonte ativa
document.getElementById('tdKey').addEventListener('change', function () {
    localStorage.setItem('tdKey', this.value.trim());
    if (fonte() === 'twelvedata') carregar();
});
document.getElementById('btnNews').addEventListener('click', carregarNoticias);
document.getElementById('btnExport').addEventListener('click', exportarCSV);
// Treino de leitura
document.getElementById('btnTreinar').addEventListener('click', function () {
    if (treino) return;   // já treinando
    iniciarTreino();
});
document.getElementById('btnTreinoCall').addEventListener('click', () => responderTreino(1));
document.getElementById('btnTreinoPut').addEventListener('click', () => responderTreino(-1));
document.getElementById('btnTreinoPular').addEventListener('click', () => responderTreino(0));
document.getElementById('btnTreinoSair').addEventListener('click', () => encerrarTreino(true));

document.getElementById('btnScan').addEventListener('click', escanear);
document.getElementById('btnIA').addEventListener('click', function () {
    // durante a execução, o mesmo botão vira o CANCELAR
    if (iaRodando) { iaCancelar = true; this.textContent = 'Cancelando…'; return; }
    otimizarIA();
});
document.getElementById('btnEstudo').addEventListener('click', renderEstudo);
document.getElementById('btnCryptoIdx').addEventListener('click', function () {
    document.getElementById('fonte').value = 'binance';
    document.getElementById('symbol').value = 'CRYPTOIDX';
    montarWidgetTV(); carregar();
});
document.getElementById('useHtf').addEventListener('change', async function () {
    if (!dados.length) return;
    await carregarHtf();
    recalcularSinaisApenas();
});
document.getElementById('btnLimparReg').addEventListener('click', () => {
    registro = []; localStorage.removeItem('registroEntradas');
    document.getElementById('registroPanel').style.display = 'none';
});
// Filtro "só nível A" do registro (persistente)
document.getElementById('regSoA').addEventListener('change', function () {
    localStorage.setItem('regSoA', this.checked ? '1' : '0');
    renderRegistro();
});
// 🎯 Modo Sniper: notificar só nível A com funil ≥5 (persistente)
document.getElementById('modoSniper').addEventListener('change', function () {
    localStorage.setItem('modoSniper', this.checked ? '1' : '0');
    if (this.checked) showToast('🎯 Modo Sniper: só notifica A com funil ≥5', 'ok');
});

// ---- Aviso OTC / fim de semana: forex real fechado, sem espelho do OTC ----
function atualizarAvisoOTC() {
    const el = document.getElementById('otcAviso');
    if (!el) return;
    const usaForex = ehForex() || modoCombinado();
    el.style.display = (usaForex && forexFechado()) ? 'flex' : 'none';
}
document.getElementById('btnIrCripto').addEventListener('click', () => {
    document.getElementById('fonte').value = 'binance';
    document.getElementById('symbol').value = 'BTCUSDT';
    document.getElementById('fonte').dispatchEvent(new Event('change'));
    showToast('₿ Cripto: mercado real 24/7', 'ok');
});
setInterval(atualizarAvisoOTC, 60000);   // revalida a cada minuto (vira o dia/hora)

// ---- Presets de estratégia por regime (fatores + portões mais assertivos) ----
// Baseados nos pesos por regime (PESOS_REGIME): tendencial premia tendência/
// estrutura/MACD; lateral premia reversão (RSI/Bollinger/padrão); volátil premia
// ATR/fluxo. Cada preset também liga os portões (Sessão/S-R e HTF quando faz
// sentido) que mais elevam o acerto.
const PRESETS_REGIME = {
    trend: { nome: '📈 Tendência', minScore: 4, htf: 1, sessao: 1, sr: 1,
        fatores: { useTendencia: 1, useEma200: 1, useMomentum: 0, useVolatilidade: 1, useEstrutura: 1, useFluxo: 1, useCorrelacao: 0, usePadrao: 0, useMacd: 1, useBollinger: 0 } },
    range: { nome: '↔ Lateral', minScore: 3, htf: 0, sessao: 1, sr: 1,
        fatores: { useTendencia: 0, useEma200: 0, useMomentum: 1, useVolatilidade: 0, useEstrutura: 0, useFluxo: 1, useCorrelacao: 0, usePadrao: 1, useMacd: 0, useBollinger: 1 } },
    vol: { nome: '🔥 Volátil', minScore: 4, htf: 1, sessao: 1, sr: 1,
        fatores: { useTendencia: 1, useEma200: 1, useMomentum: 0, useVolatilidade: 1, useEstrutura: 1, useFluxo: 1, useCorrelacao: 0, usePadrao: 0, useMacd: 0, useBollinger: 0 } }
};
function aplicarPreset(regime) {
    if (regime === 'auto') {
        let r = 'range';
        try { if (dados && dados.length) { recomputarIndicadores(); r = regimeUltimo() || 'range'; } } catch (e) {}
        regime = r;
    }
    const p = PRESETS_REGIME[regime];
    if (!p) return;
    Object.keys(p.fatores).forEach(id => { const el = document.getElementById(id); if (el) el.checked = !!p.fatores[id]; });
    document.getElementById('useHtf').checked = !!p.htf;
    document.getElementById('useSessao').checked = !!p.sessao;
    document.getElementById('useSR').checked = !!p.sr;
    document.getElementById('minScore').value = p.minScore;
    document.querySelectorAll('.btn-preset').forEach(b => b.classList.toggle('is-active', b.dataset.preset === regime));
    showToast('🎛️ Preset ' + p.nome + ' aplicado — fatores e portões afinados', 'ok');
    if (document.getElementById('useHtf').checked && fonte() !== 'sim' && dados.length) {
        carregarHtf().then(() => recalcularSinaisApenas());
    } else { htfTrend = []; recalcularSinaisApenas(); }
}
document.querySelectorAll('.btn-preset').forEach(b => b.addEventListener('click', () => aplicarPreset(b.dataset.preset)));

// ---- Cards recolhíveis: clique no título recolhe/expande o painel ----
// Otimização de tela: cada card da área central pode ser recolhido (só o título
// fica). Estado persistente por título. Expandir dispara resize p/ os gráficos
// remedirem a largura.
let cardsRecolhidos = JSON.parse(localStorage.getItem('cardsRecolhidos') || '{}');
function configurarCardsRecolhiveis() {
    document.querySelectorAll('.charts-area .chart-container > h2').forEach(h2 => {
        const card = h2.parentElement;
        const key = (h2.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
        card.classList.add('recolhivel');
        if (cardsRecolhidos[key]) card.classList.add('recolhido');
        h2.setAttribute('title', 'Clique para recolher/expandir');
        h2.addEventListener('click', ev => {
            // não recolhe ao clicar em botões/controles embutidos no título
            if (ev.target.closest('button, input, select, a')) return;
            const rec = card.classList.toggle('recolhido');
            cardsRecolhidos[key] = rec ? 1 : 0;
            localStorage.setItem('cardsRecolhidos', JSON.stringify(cardsRecolhidos));
            if (!rec) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
    });
}
document.getElementById('btnTestarSom').addEventListener('click', function () {
    tocarSom(1);
    setTimeout(() => tocarSom(-1), 600);   // demonstra os dois tons: CALL e PUT
});
// Qualquer primeiro clique na página desbloqueia o áudio (exigência dos navegadores)
document.addEventListener('click', function desbloquear() {
    garantirAudio();
    document.removeEventListener('click', desbloquear);
}, { once: true });
document.getElementById('newsSoMoeda').addEventListener('change', renderNoticias);
// TODO controle de análise recalcula os sinais na hora (senão o gráfico "não
// volta ao normal" até clicar em Recarregar): fatores, períodos e parâmetros.
[
    // modo/pontuação/janela da confluência
    'confMode', 'minScore', 'confJanela',
    // fatores principais (estavam SEM listener — o gráfico não respondia a eles)
    'useTendencia', 'useEma200', 'useMomentum', 'useVolatilidade', 'useEstrutura',
    // fatores extras / portões que recalculam
    'useFluxo', 'fluxoJanela', 'usePadrao', 'useSessao', 'useSR', 'srAtr',
    'usePA', 'paAtr', 'usePesoIA', 'useGrade', 'useMacd', 'useBollinger',
    // períodos dos indicadores (mudam as EMAs/RSI/ATR e, com isso, os sinais)
    'emaRapida', 'emaLenta', 'rsiLen', 'atrLen', 'atrMediaLen',
    // parâmetros dos fatores
    'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas'
].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', recalcularSinaisApenas); });
// Correlação/pares de referência: recarrega os pares e recalcula
['useCorrelacao', 'refPairs'].forEach(id =>
    document.getElementById(id).addEventListener('change', async function () {
        await carregarRefPares();
        recalcularSinaisApenas();
    }));
// Filtro de notícias + payout: só reavalia o painel/métricas (não recarrega dados)
['useNewsFilter', 'newsJanela', 'payout'].forEach(id =>
    document.getElementById(id).addEventListener('change', atualizarPaineis));
document.getElementById('expiracao').addEventListener('change', function () {
    if (!dados.length) { carregar(); return; }
    recomputarEntradas();
    atualizarMarcadores();
    atualizarPaineis();
});

window.addEventListener('resize', function () {
    if (chartPreco) chartPreco.applyOptions({ width: document.getElementById('chartPreco').clientWidth, height: alturaChartPreco() });
    if (chartRsi) chartRsi.applyOptions({ width: document.getElementById('chartRsi').clientWidth });
    if (chartAtr) chartAtr.applyOptions({ width: document.getElementById('chartAtr').clientWidth });
    if (chartEquity) chartEquity.applyOptions({ width: document.getElementById('chartEquity').clientWidth });
    if (chartFluxo) chartFluxo.applyOptions({ width: document.getElementById('chartFluxo').clientWidth });
});

// Inicializa em DOMContentLoaded (NÃO em 'load') para não depender do tv.js:
// se o widget do TradingView estiver lento/bloqueado, o resto do app não trava.
// Reconexão dirigida pela rede do navegador: cai a internet → avisa; volta →
// zera o backoff e recarrega a fonte ao vivo na hora (não espera o timer).
window.addEventListener('offline', () => {
    if (fonte() !== 'sim') setStatus('err', '📴 Sem internet — reconecta sozinho ao voltar');
});
window.addEventListener('online', () => {
    if (fonte() === 'sim') return;
    wsTent = 0; idxTent = 0;
    showToast('🌐 Internet de volta — reconectando…', 'ok');
    carregar();
});

function iniciar() {
    // chave Twelve Data: URL (?tdkey=) tem prioridade, senão a salva no navegador
    const tdParam = _params.get('tdkey'), tdSalva = localStorage.getItem('tdKey');
    if (tdParam) { document.getElementById('tdKey').value = tdParam; localStorage.setItem('tdKey', tdParam); }
    else if (tdSalva) document.getElementById('tdKey').value = tdSalva;
    montarWidgetTV();   // gráfico oficial do TradingView no topo (assíncrono, com retry)
    carregarSimbolos();
    renderScanFiltro(); // checklist de moedas do scanner
    // Sidebar: restaura a preferência; em telas pequenas começa recolhida (minimalista)
    const ctrlPref = localStorage.getItem('ctrlVisivel');
    aplicarControles(ctrlPref == null ? window.innerWidth > 900 : ctrlPref !== '0');
    aplicarTema(localStorage.getItem('tema') === 'light' ? 'light' : 'dark');
    atualizarAvisoOTC();
    // padrão LIGADO: a IA se mantém afinada sozinha (reotimiza a cada 60 min)
    document.getElementById('autoReopt').checked = localStorage.getItem('autoReopt') !== '0';
    document.getElementById('regSoA').checked = localStorage.getItem('regSoA') !== '0';   // padrão: só nível A
    document.getElementById('modoSniper').checked = localStorage.getItem('modoSniper') === '1';
    configurarCardsRecolhiveis();
    configurarAutoReopt();
    carregar();
    carregarNoticias(); // notícias em tempo real
    newsTimer = setInterval(carregarNoticias, 60000);  // auto-refresh a cada 60s
    renderRegistro();   // restaura o registro de entradas salvo
    setTimeout(verificarEntradasPendentes, 4000);              // resolve WIN/LOSS pendentes ao abrir
    setInterval(verificarEntradasPendentes, 30000);            // e a cada 30s enquanto o app roda
    autoTreinar();      // ?treinar=1 → dispara a IA sozinha ao abrir
}

// Presets de moedas para o treino automático (?preset=). "majors" = os 7 pares
// principais do forex; "menores" = 3 majors leves p/ chave grátis (poupa cota).
const PRESETS_MOEDAS = {
    majors: ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'],
    menores: ['EURUSD', 'GBPUSD', 'USDJPY']
};

// Treino automático via URL — "colocar a IA pra treinar" vira só abrir o link:
//   ?treinar=1                          usa a fonte/moedas atuais
//   ?treinar=1&fonte=twelvedata         escolhe a fonte (forex real)
//   ?treinar=1&preset=majors            treina os 7 pares principais do forex
//   ?treinar=1&moedas=BTCUSDT,ETHUSDT   treina só essas moedas
//   ?treinar=1&minval=5                 exige amostra mínima maior
async function autoTreinar() {
    if (!['1', 'true', 'ia', 'sim'].includes((_params.get('treinar') || '').toLowerCase())) return;
    const fonteEl = document.getElementById('fonte');
    const fonteParam = _params.get('fonte');
    if (fonteParam && fonteEl.querySelector(`option[value="${fonteParam}"]`)) {
        fonteEl.value = fonteParam;
        fonteEl.dispatchEvent(new Event('change'));
    }
    const minval = parseInt(_params.get('minval'));
    if (minval >= 3) document.getElementById('iaMinVal').value = minval;
    // aguarda o exchangeInfo (pares forex Binance) e a carga inicial
    await new Promise(r => setTimeout(r, 1600));
    // pré-seleção de moedas: preset nomeado ou lista explícita na URL
    const preset = (_params.get('preset') || '').toLowerCase();
    const moedas = PRESETS_MOEDAS[preset]
        || (_params.get('moedas') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (moedas.length) {
        scanUniverse().forEach(s => scanSel[s] = false);
        moedas.forEach(s => scanSel[s] = true);
        salvarScanSel(); renderScanFiltro();
    }
    // no Simulado a IA precisa dos dados carregados (nas fontes ao vivo ela busca sozinha)
    for (let i = 0; i < 20 && fonte() === 'sim' && (!dados || dados.length < 210); i++) await new Promise(r => setTimeout(r, 300));
    if (!iaRodando) { showToast('🤖 Treino automático iniciado…', 'info'); otimizarIA(); }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
// ============================================================================
// BLOCO 12 — NÚCLEO DE BACKTEST PURO (compartilhado thread principal × Web Worker)
// ============================================================================
// Réplica SEM DOM e SEM globais da avaliação que a IA usa: indicadores → sinais
// → entradas → walk-forward. Recebe candles + um "cfg" (objeto simples) e devolve
// as estatísticas. Como é 100% puro, o Web Worker e o fallback na thread principal
// usam EXATAMENTE este mesmo código — resultado idêntico por construção.
//
// Durante a otimização da IA o HTF e os pesos dinâmicos ficam desligados, e os
// pares varridos não têm pares de referência (correlação = 0). Este núcleo, por
// isso, dispensa esses caminhos — é a fatia que a IA de fato exercita.

// ---- helpers matemáticos (cópias locais p/ o worker ser autossuficiente) ----
function _bsma(a, p) {
    const r = [];
    for (let i = 0; i < a.length; i++) {
        if (i < p - 1) { r.push(null); continue; }
        let s = 0; for (let j = i - p + 1; j <= i; j++) s += a[j];
        r.push(s / p);
    }
    return r;
}
function _bema(a, p) {
    const r = []; const m = 2 / (p + 1); let prev = null;
    for (let i = 0; i < a.length; i++) {
        if (i < p - 1) { r.push(null); continue; }
        if (i === p - 1) { let s = 0; for (let j = 0; j < p; j++) s += a[j]; prev = s / p; r.push(prev); }
        else { prev = (a[i] - prev) * m + prev; r.push(prev); }
    }
    return r;
}
function _brsi(a, p) {
    const r = [null]; const ch = [];
    for (let i = 1; i < a.length; i++) ch.push(a[i] - a[i - 1]);
    for (let i = 0; i < ch.length; i++) {
        if (i < p - 1) { r.push(null); continue; }
        let g = 0, l = 0;
        for (let j = i - p + 1; j <= i; j++) { if (ch[j] > 0) g += ch[j]; else l += Math.abs(ch[j]); }
        const ag = g / p, al = l / p; const rs = al === 0 ? 100 : ag / al;
        r.push(100 - (100 / (1 + rs)));
    }
    return r;
}
function _batr(h, l, c, p) {
    const tr = [];
    for (let i = 0; i < c.length; i++) {
        if (i === 0) { tr.push(h[i] - l[i]); continue; }
        tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    }
    return _bsma(tr, p);
}
function _bcrossover(cur, prev, n) { return prev !== null && cur !== null && prev <= n && cur > n; }
function _bcrossunder(cur, prev, n) { return prev !== null && cur !== null && prev >= n && cur < n; }
function _bwilsonLB(w, n, z) {
    if (!n) return 0; z = z || 1.96;
    const p = w / n, z2 = z * z;
    const centro = p + z2 / (2 * n);
    const margem = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return Math.max(0, (centro - margem) / (1 + z2 / n));
}
function _bsessaoForte(t) {
    const h = new Date(t * 1000).getUTCHours();
    return !(h >= 22 || h < 7);   // "Ásia" (22–7 UTC) é a única sessão fraca
}
function _bpadrao(dados, i) {
    if (i < 1) return { up: false, down: false };
    const c = dados[i], p = dados[i - 1];
    const corpo = Math.abs(c.close - c.open);
    const range = (c.high - c.low) || 1e-9;
    const bodyPct = corpo / range;
    const wickUp = c.high - Math.max(c.close, c.open);
    const wickDn = Math.min(c.close, c.open) - c.low;
    const inside = c.high <= p.high && c.low >= p.low;
    const engAlta = c.close > c.open && p.close < p.open && c.close >= p.open && c.open <= p.close;
    const engBaixa = c.close < c.open && p.close > p.open && c.open >= p.close && c.close <= p.open;
    const maruAlta = c.close > c.open && bodyPct >= 0.85;
    const maruBaixa = c.close < c.open && bodyPct >= 0.85;
    const martelo = wickDn >= corpo * 2 && wickUp <= corpo && bodyPct <= 0.4;
    const estrela = wickUp >= corpo * 2 && wickDn <= corpo && bodyPct <= 0.4;
    return { up: !inside && (engAlta || maruAlta || martelo), down: !inside && (engBaixa || maruBaixa || estrela) };
}
function _bdelta(arr, endIdx, n) {
    let buy = 0, tot = 0;
    for (let j = Math.max(0, endIdx - n + 1); j <= endIdx; j++) { buy += arr[j].buyVol || 0; tot += arr[j].volume || 0; }
    const delta = buy * 2 - tot;
    return (tot <= 0 || Math.abs(delta) < tot * 0.05) ? 0 : (delta > 0 ? 1 : -1);
}
const _BSRW = 5;
function _bpivots(highs, lows) {
    const res = [], sup = [];
    for (let j = _BSRW; j < highs.length - _BSRW; j++) {
        let ph = true, pl = true;
        for (let k = j - _BSRW; k <= j + _BSRW; k++) { if (highs[k] > highs[j]) ph = false; if (lows[k] < lows[j]) pl = false; }
        if (ph) res.push({ i: j, price: highs[j] });
        if (pl) sup.push({ i: j, price: lows[j] });
    }
    return { res, sup };
}
function _bvetoSR(piv, i, close, atrV, k) {
    if (!atrV) return { vetoLong: false, vetoShort: false };
    let resAbove = Infinity, supBelow = -Infinity;
    for (const p of piv.res) if (p.i + _BSRW <= i && p.price > close && p.price < resAbove) resAbove = p.price;
    for (const p of piv.sup) if (p.i + _BSRW <= i && p.price < close && p.price > supBelow) supBelow = p.price;
    return {
        vetoLong: resAbove !== Infinity && (resAbove - close) < k * atrV,
        vetoShort: supBelow !== -Infinity && (close - supBelow) < k * atrV
    };
}

// ---- indicadores (espelha recomputarIndicadores) ----
function iaIndicadores(dados, cfg) {
    const closes = dados.map(d => d.close), highs = dados.map(d => d.high), lows = dados.map(d => d.low);
    const emaR = _bema(closes, cfg.emaRapida), emaL = _bema(closes, cfg.emaLenta), ema200 = _bema(closes, 200);
    const rsiValues = _brsi(closes, cfg.rsiLen);
    const atrValues = _batr(highs, lows, closes, cfg.atrLen);
    const atrMedia = _bsma(atrValues, cfg.atrMediaLen);
    const e12 = _bema(closes, 12), e26 = _bema(closes, 26);
    const macdLine = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
    const sig = new Array(closes.length).fill(null); const kSig = 2 / 10; let s9 = null;
    for (let i = 0; i < macdLine.length; i++) { if (macdLine[i] == null) continue; s9 = s9 == null ? macdLine[i] : macdLine[i] * kSig + s9 * (1 - kSig); sig[i] = s9; }
    const macdHist = macdLine.map((v, i) => (v != null && sig[i] != null) ? v - sig[i] : null);
    const bbMid = _bsma(closes, 20), bbUp = new Array(closes.length).fill(null), bbDn = new Array(closes.length).fill(null);
    for (let i = 19; i < closes.length; i++) {
        if (bbMid[i] == null) continue;
        let v = 0; for (let j = i - 19; j <= i; j++) v += (closes[j] - bbMid[i]) ** 2;
        const sd = Math.sqrt(v / 20); bbUp[i] = bbMid[i] + 2 * sd; bbDn[i] = bbMid[i] - 2 * sd;
    }
    return { closes, emaR, emaL, ema200, rsiValues, atrValues, atrMedia, highs, lows, macdHist, bbUp, bbDn };
}

// ---- sinais + entradas WIN/LOSS (espelha recomputarSinais + recomputarEntradas) ----
// Retorna as entradas [{ index, dir, resultado }] avaliadas no horizonte de exp.
function iaEntradas(dados, C, cfg) {
    const { closes, emaR, emaL, ema200, rsiValues, atrValues, atrMedia, highs, lows, macdHist, bbUp, bbDn } = C;
    const janela = Math.max(1, cfg.confJanela);
    const piv = cfg.useSR ? _bpivots(highs, lows) : null;
    const srK = Math.max(0.1, cfg.srAtr || 0.5);

    const maxRec = [], minRec = [];
    for (let i = 0; i < closes.length; i++) {
        if (i === 0) { maxRec.push(highs[0]); minRec.push(lows[0]); continue; }
        let mx = -Infinity, mn = Infinity;
        const start = Math.max(0, i - cfg.estruturaLookback);
        for (let j = start; j < i; j++) { mx = Math.max(mx, highs[j]); mn = Math.min(mn, lows[j]); }
        maxRec.push(mx); minRec.push(mn);
    }
    const momLongBar = [], momShortBar = [];
    for (let i = 0; i < closes.length; i++) {
        momLongBar.push(i >= 1 && _bcrossover(rsiValues[i], rsiValues[i - 1], cfg.rsiSobrevenda));
        momShortBar.push(i >= 1 && _bcrossunder(rsiValues[i], rsiValues[i - 1], cfg.rsiSobrecompra));
    }
    const recente = (arr, i) => { for (let j = Math.max(0, i - janela + 1); j <= i; j++) if (arr[j]) return true; return false; };
    const enabledCount = [cfg.useTendencia, cfg.useEma200, cfg.useMomentum, cfg.useVolatilidade, cfg.useEstrutura, cfg.useFluxo, cfg.useCorrelacao, cfg.usePadrao, cfg.useMacd, cfg.useBollinger].filter(Boolean).length;

    const sinais = [];   // { index, dir }
    let barras = 999999;
    for (let i = 1; i < closes.length; i++) {
        barras++;
        const tL = emaR[i] !== null && emaL[i] !== null && emaR[i] > emaL[i];
        const tS = emaR[i] !== null && emaL[i] !== null && emaR[i] < emaL[i];
        const maL = ema200[i] !== null && closes[i] > ema200[i];
        const maS = ema200[i] !== null && closes[i] < ema200[i];
        const moL = recente(momLongBar, i), moS = recente(momShortBar, i);
        const vo = atrValues[i] !== null && atrMedia[i] !== null && atrValues[i] > atrMedia[i];
        const eL = closes[i] > maxRec[i], eS = closes[i] < minRec[i];
        const fluxoDir = cfg.useFluxo ? _bdelta(dados, i, Math.max(2, cfg.fluxoJanela)) : 0;
        // correlação: sem pares de referência no backtest da IA → 0 (fator nunca dispara)
        const pat = cfg.usePadrao ? _bpadrao(dados, i) : { up: false, down: false };
        const mh = macdHist[i], mhp = macdHist[i - 1];
        const xL = cfg.useMacd && mh != null && mhp != null && mh > 0 && mh >= mhp;
        const xS = cfg.useMacd && mh != null && mhp != null && mh < 0 && mh <= mhp;
        const bL = cfg.useBollinger && bbDn[i] != null && closes[i] < bbDn[i];
        const bS = cfg.useBollinger && bbUp[i] != null && closes[i] > bbUp[i];

        let longScore = 0, shortScore = 0;
        if (cfg.useTendencia) { if (tL) longScore++; if (tS) shortScore++; }
        if (cfg.useEma200) { if (maL) longScore++; if (maS) shortScore++; }
        if (cfg.useMomentum) { if (moL) longScore++; if (moS) shortScore++; }
        if (cfg.useVolatilidade) { if (vo) { longScore++; shortScore++; } }
        if (cfg.useEstrutura) { if (eL) longScore++; if (eS) shortScore++; }
        if (cfg.useFluxo) { if (fluxoDir === 1) longScore++; if (fluxoDir === -1) shortScore++; }
        // correlação sempre 0 (sem pares) — não soma
        if (cfg.usePadrao) { if (pat.up) longScore++; if (pat.down) shortScore++; }
        if (cfg.useMacd) { if (xL) longScore++; if (xS) shortScore++; }
        if (cfg.useBollinger) { if (bL) longScore++; if (bS) shortScore++; }

        let longSig, shortSig;
        if (cfg.confMode === 'estrita') {
            longSig = enabledCount > 0 && longScore === enabledCount;
            shortSig = enabledCount > 0 && shortScore === enabledCount;
        } else {
            longSig = longScore >= cfg.minScore && longScore > shortScore;
            shortSig = shortScore >= cfg.minScore && shortScore > longScore;
        }
        if (cfg.useSessao && !_bsessaoForte(dados[i].time)) { longSig = false; shortSig = false; }
        if (cfg.useSR && (longSig || shortSig)) {
            const vs = _bvetoSR(piv, i, closes[i], atrValues[i], srK);
            if (vs.vetoLong) longSig = false;
            if (vs.vetoShort) shortSig = false;
        }
        const cool = barras >= cfg.cooldownVelas;
        if (longSig && cool) { sinais.push({ index: i, dir: 1 }); barras = 0; }
        else if (shortSig && cool) { sinais.push({ index: i, dir: -1 }); barras = 0; }
    }

    // horizonte de expiração: N velas à frente (mesmo cálculo de recomputarEntradas)
    const N = Math.max(1, Math.round(cfg.exp / cfg.tf));
    return sinais.map(s => {
        const entryPrice = dados[s.index].close;
        const expIdx = s.index + N;
        let resultado = 'pendente';
        if (expIdx < dados.length) {
            const expPrice = dados[expIdx].close;
            if (expPrice === entryPrice) resultado = 'EMPATE';
            else if (s.dir === 1) resultado = expPrice > entryPrice ? 'WIN' : 'LOSS';
            else resultado = expPrice < entryPrice ? 'WIN' : 'LOSS';
        }
        return { index: s.index, dir: s.dir, resultado };
    });
}

function _bstats(ents) {
    const av = ents.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    const w = av.filter(e => e.resultado === 'WIN').length;
    return { ops: av.length, w, wr: av.length ? w / av.length : 0 };
}

// Walk-forward robusto (espelha avaliarWalkForward) sobre um cfg concreto.
function avaliarConfigPuro(dados, cfg) {
    const ents = iaEntradas(dados, iaIndicadores(dados, cfg), cfg);
    const n = dados.length;
    const treino = _bstats(ents.filter(e => e.index < Math.floor(n * 0.55)));
    const folds = [[0.55, 0.70], [0.70, 0.85], [0.85, 1.001]].map(([a, b]) =>
        _bstats(ents.filter(e => e.index >= Math.floor(n * a) && e.index < Math.floor(n * b))));
    const w = folds.reduce((s, f) => s + f.w, 0), ops = folds.reduce((s, f) => s + f.ops, 0);
    const comAmostra = folds.filter(f => f.ops >= 2);
    const robustVal = comAmostra.length ? Math.min(...comAmostra.map(f => f.wr)) : (ops ? w / ops : 0);
    const robustLB = comAmostra.length ? Math.min(...comAmostra.map(f => _bwilsonLB(f.w, f.ops))) : _bwilsonLB(w, ops);
    return { treino, val: { ops, w, wr: ops ? w / ops : 0, wrLB: _bwilsonLB(w, ops) }, robustVal, robustLB };
}

// Varre a grade de combos sobre um conjunto de candles (um símbolo × um TF) e
// devolve o melhor (mesma seleção de _iaOtimizarSimbolo: edge no limite inferior).
function avaliarGridPuro(dados, cfgBase, combos, minVal, minOps, beWR) {
    let best = null;
    for (const c of combos) {
        const cfg = Object.assign({}, cfgBase, { minScore: c.ms, rsiSobrevenda: c.sv, rsiSobrecompra: c.sc, estruturaLookback: c.lk, cooldownVelas: c.cd, exp: c.exp });
        const wf = avaliarConfigPuro(dados, cfg);
        if (wf.treino.ops < minOps || wf.val.ops < minVal) continue;
        const robust = Math.min(_bwilsonLB(wf.treino.w, wf.treino.ops), wf.robustLB);
        const edgeLB = wf.val.wrLB - beWR;
        if (!best || edgeLB > best.edgeLB || (edgeLB === best.edgeLB && robust > best.robust))
            best = { exp: c.exp, ms: c.ms, sv: c.sv, sc: c.sc, lk: c.lk, cd: c.cd, robust, edgeLB, treino: wf.treino, val: wf.val };
    }
    return best;
}

// ---- Handler do Web Worker (só ativa quando este código roda num worker) ----
// Detecta o contexto de worker por importScripts (existe apenas lá). Assim o
// mesmo arquivo serve de biblioteca na thread principal e de programa no worker.
if (typeof self !== 'undefined' && typeof self.importScripts === 'function' && typeof self.document === 'undefined') {
    self.onmessage = function (ev) {
        const m = ev.data || {};
        try {
            const best = avaliarGridPuro(m.dados, m.cfgBase, m.combos, m.minVal, m.minOps, m.beWR);
            self.postMessage({ id: m.id, ok: true, best });
        } catch (e) {
            self.postMessage({ id: m.id, ok: false, erro: String(e && e.message || e) });
        }
    };
}
// ============================================================================
// BLOCO 13 — AGENTES DE ESTUDO (estudo contínuo do mercado em segundo plano)
// ============================================================================
// Agentes autônomos que rodam num tick de 60s (quando ativados) e vão
// melhorando os parâmetros de entrada sem intervenção (os agentes 🔧
// Configurador e ✅ Validador, do bloco 25, entram no mesmo tick):
//   🧪 Otimizador Contínuo — reotimiza as moedas marcadas em rodízio (uma por
//      vez, no Web Worker), mantendo o iaCache sempre fresco.
//   🔭 Sentinela de Regime — vigia a virada de regime do par aberto; aplica na
//      hora os parâmetros já estudados para o novo regime (ou agenda estudo).
//   ⚖️ Auditor de Calibração — compara a promessa da IA com o placar real;
//      se a IA ficou otimista, agenda a reotimização do par.
//   🧠 Professor de Fatores — mede o acerto de cada fator (limite inferior de
//      Wilson), atualiza os pesos dinâmicos e reporta o melhor/pior fator.
// Tudo cooperativo: nunca roda por cima da IA manual (iaRodando) nem do treino.

let agentesOn = localStorage.getItem('agentesOn') === '1';
let agentesTimer = null;
let agLog = [];                 // [{t, agente, msg}] — últimas ações (novas no topo)
let agUltimoRegime = null;      // regime visto por último no par aberto
let agFilaOtim = [];            // fila round-robin de moedas p/ reotimizar
let agTickN = 0, agOcupado = false;
let agFatoresUltimo = '';       // evita repetir o mesmo diagnóstico no log

function agentesLog(agente, msg) {
    agLog.unshift({ t: Math.floor(Date.now() / 1000), agente, msg });
    agLog = agLog.slice(0, 12);
    renderAgentes();
}

function renderAgentes() {
    const st = document.getElementById('agentesStatus');
    const el = document.getElementById('agentesLog');
    if (!st || !el) return;
    st.textContent = agentesOn ? (agOcupado ? '● estudando…' : '● ativos') : '○ desligados';
    st.style.color = agentesOn ? 'var(--good)' : '';
    el.innerHTML = agLog.length ? agLog.map(l =>
        `<div class="reg-row"><span class="reg-hora">${fmtHora(l.t)}</span>` +
        `<span class="ag-nome">${l.agente}</span><span class="ag-msg">${l.msg}</span></div>`
    ).join('') : '<div class="metric-empty" style="padding:8px 4px;">Ative o estudo contínuo: os agentes reotimizam as moedas em rodízio, vigiam o regime, auditam a calibração, checam a sua CONFIGURAÇÃO (🔧) e VALIDAM a saúde estatística (✅) — com conserto em 1 clique aqui no log.</div>';
}

// ---- 🔭 Sentinela de Regime ----
function agenteRegime() {
    if (!dados || dados.length < 210) return;
    const r = regimeUltimo();
    if (agUltimoRegime && r !== agUltimoRegime) {
        const rot = x => (REGIME_ROTULO[x] || x);
        agentesLog('🔭 Regime', `virou de ${rot(agUltimoRegime)} para ${rot(r)}`);
        const cc = iaCache[symbolAtual() + '|' + r];
        if (cc) {
            const el = id => document.getElementById(id);
            el('minScore').value = cc.ms; el('rsiSobrevenda').value = cc.sv; el('rsiSobrecompra').value = cc.sc;
            el('estruturaLookback').value = cc.lk; el('cooldownVelas').value = cc.cd; el('expiracao').value = cc.exp;
            recalcularSinaisApenas();
            agentesLog('🔭 Regime', `parâmetros do regime aplicados (score≥${cc.ms} · RSI ${cc.sv}/${cc.sc} · exp ${cc.exp}m)`);
        } else if (!agFilaOtim.includes(symbolAtual())) {
            agFilaOtim.unshift(symbolAtual());
            agentesLog('🔭 Regime', 'sem parâmetros estudados p/ este regime — estudo agendado');
        }
    }
    agUltimoRegime = r;
}

// ---- ⚖️ Auditor de Calibração ----
function agenteCalibracao() {
    const res = registro.filter(x => x.resultado === 'WIN' || x.resultado === 'LOSS');
    if (res.length < 5) return;
    const wins = res.filter(x => x.resultado === 'WIN').length;
    // teto plausível do acerto real (limite superior de Wilson via complemento)
    const teto = 1 - wilsonLB(res.length - wins, res.length);
    const cc = iaCache[symbolAtual() + '|' + (agUltimoRegime || '')] || iaCache[symbolAtual()];
    if (cc && cc.wr != null && cc.wr > teto + 0.02 && !agFilaOtim.includes(symbolAtual())) {
        agFilaOtim.unshift(symbolAtual());
        agentesLog('⚖️ Calibração', `IA prometia ${pctTxt(cc.wr)}, real plausível até ${pctTxt(teto)} — reestudo agendado`);
    }
}

// ---- 🧠 Professor de Fatores ----
function agenteFatores() {
    const av = entradas.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    if (av.length < 20) return;
    atualizarPesosFatores();   // alimenta os pesos dinâmicos usados no score
    const acc = {};
    av.forEach(e => (e.fatores || '').split('·').forEach(k => {
        if (!FATORES_NOMES[k]) return;
        (acc[k] = acc[k] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') acc[k].w++;
    }));
    const ks = Object.keys(acc).filter(k => acc[k].t >= 8);
    if (ks.length < 2) return;
    ks.sort((a, b) => wilsonLB(acc[b].w, acc[b].t) - wilsonLB(acc[a].w, acc[a].t));
    const melhor = ks[0], pior = ks[ks.length - 1];
    let resumo = `melhor fator: ${FATORES_NOMES[melhor]} (LB ${pctTxt(wilsonLB(acc[melhor].w, acc[melhor].t))} em ${acc[melhor].t} ops)`;
    if (acc[pior].w / acc[pior].t < 0.5) resumo += ` · pior: ${FATORES_NOMES[pior]} (${pctTxt(acc[pior].w / acc[pior].t)}) — pesos ajustados`;
    if (resumo !== agFatoresUltimo) { agFatoresUltimo = resumo; agentesLog('🧠 Fatores', resumo); }
}

// ---- 🧪 Otimizador Contínuo (uma moeda por rodada, em rodízio) ----
async function agenteOtimizador() {
    if (iaRodando || agOcupado || treino) return;
    const isSim = fonte() === 'sim';
    if (isSim && (!dados || dados.length < 210)) return;
    if (!agFilaOtim.length) agFilaOtim = isSim ? [symbolAtual()] : filtrarMercadoAberto(scanUniverse().filter(scanChecked)).lista;
    const sym = agFilaOtim.shift();
    if (!sym) return;
    // Forex com mercado fechado (fim de semana): não estuda velas congeladas
    if (PARES_YAHOO[sym] && forexFechado()) { agentesLog('🧪 Otimizador', scanLabel(sym) + ': pulado — mercado real fechado'); return; }
    agOcupado = true; iaRodando = true; iaCancelar = false; renderAgentes();
    const el = id => document.getElementById(id);
    const ids = ['minScore', 'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas', 'confMode', 'timeframe', 'useHtf', 'usePesoIA', 'symbol', 'fonte'];
    const save = {}; ids.forEach(i => save[i] = el(i).type === 'checkbox' ? el(i).checked : el(i).value);
    el('confMode').value = 'score'; el('useHtf').checked = false; el('usePesoIA').checked = false;
    const htfSave = htfTrend; htfTrend = [];
    const dSave = dados;
    const payout = Math.max(0.01, (parseFloat(el('payout').value) || 87) / 100);
    const beWR = 1 / (1 + payout);
    try {
        const { porTf } = await _iaOtimizarSimbolo(sym, isSim, dSave, beWR, [1, 5, 15, 30, 60], el);
        localStorage.setItem('iaCache', JSON.stringify(iaCache));
        if (porTf.length) {
            const b = porTf[0];
            agentesLog('🧪 Otimizador', `${scanLabel(sym)}: ${pctTxt(b.val.wr)} val · LB ${pctTxt(b.val.wrLB)} (${rotTf(b.tf)}·${b.exp}m) — parâmetros atualizados`);
        } else {
            agentesLog('🧪 Otimizador', `${scanLabel(sym)}: sem edge válido nesta rodada`);
        }
    } catch (e) {
        agentesLog('🧪 Otimizador', `${scanLabel(sym)}: falhou (${(e && e.message) || e})`);
    }
    // restaura o estado do usuário como a IA manual faz
    ids.forEach(i => { if (el(i).type === 'checkbox') el(i).checked = save[i]; else el(i).value = save[i]; });
    dados = dSave; htfTrend = htfSave;
    try { recomputarIndicadores(); recomputarSinais(); } catch (e) { }
    iaRodando = false; iaCancelar = false; agOcupado = false; renderAgentes();
}

// ---- Tick central: roda os agentes leves sempre; o pesado a cada 3 ticks ----
async function agentesTick() {
    if (!agentesOn || treino) return;
    agTickN++;
    try { agenteRegime(); } catch (e) { }
    try { agenteCalibracao(); } catch (e) { }
    try { agenteFatores(); } catch (e) { }
    // 🔧/✅ configuração e validação (bloco 25) — leves, rodam todo tick
    try { if (typeof agenteConfigurador === 'function') agenteConfigurador(); } catch (e) { }
    try { if (typeof agenteValidador === 'function') agenteValidador(); } catch (e) { }
    // o otimizador (pesado) roda a cada 3 ticks, ou antes se algo foi agendado
    if (agTickN % 3 === 0 || agFilaOtim.length) { try { await agenteOtimizador(); } catch (e) { } }
}

function configurarAgentes() {
    const cb = document.getElementById('agentesAtivo');
    if (!cb) return;
    cb.checked = agentesOn;
    cb.addEventListener('change', function () {
        agentesOn = this.checked;
        localStorage.setItem('agentesOn', agentesOn ? '1' : '0');
        if (agentesOn) {
            agentesLog('🤖 Central', 'agentes ativados — estudo contínuo iniciado (rodízio de moedas a ~3 min)');
            if (!agentesTimer) agentesTimer = setInterval(agentesTick, 60000);
            agentesTick();
        } else {
            agentesLog('🤖 Central', 'agentes pausados');
        }
        renderAgentes();
    });
    if (agentesOn && !agentesTimer) agentesTimer = setInterval(agentesTick, 60000);
    renderAgentes();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configurarAgentes);
else configurarAgentes();
// ============================================================================
// BLOCO 14 — PILOTO AUTOMÁTICO (paper trading em conta DEMO simulada)
// ============================================================================
// Opera "sozinho" numa conta DEMO simulada, sobre dados REAIS: quando uma virada
// de veredito passa no gatilho (nível A / funil ≥5), o app registra a operação
// como paper trade com stake, e ao resolver WIN/LOSS aplica o P&L ao saldo demo.
// NÃO toca em corretora nenhuma (a Binomo bloqueia iframe e proíbe bots) — é o
// equivalente honesto e sem risco de "testar na demo". A operação real, se você
// quiser, continua MANUAL. Acompanha saldo, win rate, drawdown e expectativa.

let pilotoCfg = Object.assign(
    { ativo: false, gatilho: 'af5', saldoIni: 10000, stake: 100, stakeTipo: 'fixo', epoch: 0 },
    JSON.parse(localStorage.getItem('pilotoCfg') || '{}')
);
function salvarPiloto() { localStorage.setItem('pilotoCfg', JSON.stringify(pilotoCfg)); }
function pilotoPayout() { return Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100); }

// Qualifica a virada conforme o gatilho escolhido (A / funil≥5 / ambos).
function pilotoQualifica(grade, funil) {
    if (!pilotoCfg.ativo) return false;
    const a = grade === 'A', f = funil != null && funil >= 5;
    return pilotoCfg.gatilho === 'a' ? a : pilotoCfg.gatilho === 'f5' ? f : (a && f);
}
// Stake a arriscar nesta operação: R$ fixo ou % do saldo demo atual.
function pilotoStakeAtual() {
    const s = pilotoCfg.stakeTipo === 'pct' ? calcularContaDemo().saldo * (pilotoCfg.stake / 100) : pilotoCfg.stake;
    return Math.max(1, s);
}

// Recalcula a conta demo A PARTIR do registro (nunca conta duas vezes): soma o
// P&L das paper trades resolvidas desde o último "zerar" (epoch). Pendentes não
// mexem no saldo. WIN = +stake·payout; LOSS = −stake.
function calcularContaDemo() {
    const paper = registro.filter(r => r.paper && r.t >= (pilotoCfg.epoch || 0));
    const res = paper.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS').sort((a, b) => a.t - b.t);
    let saldo = pilotoCfg.saldoIni, pico = saldo, ddMax = 0, w = 0, seq = 0, seqTipo = '';
    res.forEach(r => {
        saldo += r.resultado === 'WIN' ? (r.stake || 0) * (r.payout || pilotoPayout()) : -(r.stake || 0);
        if (saldo > pico) pico = saldo;
        if (pico - saldo > ddMax) ddMax = pico - saldo;
        if (r.resultado === 'WIN') { w++; seq = seqTipo === 'W' ? seq + 1 : 1; seqTipo = 'W'; }
        else { seq = seqTipo === 'L' ? seq + 1 : 1; seqTipo = 'L'; }
    });
    const pend = paper.length - res.length;
    return {
        saldo, ops: res.length, pend, w, wr: res.length ? w / res.length : 0,
        ddMax, ddPct: pico ? ddMax / pico : 0, lucro: saldo - pilotoCfg.saldoIni,
        exp: res.length ? (saldo - pilotoCfg.saldoIni) / res.length : 0, seq, seqTipo
    };
}

function _pMoney(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function renderPiloto() {
    const st = document.getElementById('pilotoStats'), tag = document.getElementById('pilotoSaldo');
    if (!st || !tag) return;
    const c = calcularContaDemo();
    tag.textContent = pilotoCfg.ativo ? _pMoney(c.saldo) : '○ desligado';
    tag.style.color = pilotoCfg.ativo ? (c.lucro >= 0 ? 'var(--good)' : 'var(--put)') : '';
    st.innerHTML =
        kv('Saldo demo', _pMoney(c.saldo), c.lucro >= 0 ? 'kv-good' : 'kv-bad') +
        kv('Resultado', (c.lucro >= 0 ? '+' : '') + _pMoney(c.lucro) + ' (' + (pilotoCfg.saldoIni ? (c.lucro / pilotoCfg.saldoIni * 100).toFixed(1) : '0') + '%)', c.lucro >= 0 ? 'kv-good' : 'kv-bad') +
        kv('Operações', c.ops + (c.pend ? ' · ' + c.pend + ' aberta' + (c.pend > 1 ? 's' : '') : '')) +
        kv('Win rate', c.ops ? (c.wr * 100).toFixed(0) + '%' : '—', c.wr >= 0.55 ? 'kv-good' : '') +
        kv('Drawdown máx', _pMoney(c.ddMax) + ' (' + (c.ddPct * 100).toFixed(0) + '%)', c.ddMax > 0 ? 'kv-bad' : '') +
        kv('Expectativa/op', (c.exp >= 0 ? '+' : '') + _pMoney(c.exp), c.exp >= 0 ? 'kv-good' : 'kv-bad') +
        kv('Sequência atual', c.seq ? c.seq + ' ' + (c.seqTipo === 'W' ? 'WIN' : 'LOSS') : '—', c.seqTipo === 'W' ? 'kv-good' : c.seqTipo === 'L' ? 'kv-bad' : '');
}

function configurarPiloto() {
    const el = id => document.getElementById(id);
    if (!el('pilotoAtivo')) return;
    // restaura UI a partir da config
    el('pilotoAtivo').checked = pilotoCfg.ativo;
    el('pilotoGatilho').value = pilotoCfg.gatilho;
    el('pilotoSaldoIni').value = pilotoCfg.saldoIni;
    el('pilotoStake').value = pilotoCfg.stake;
    el('pilotoStakeTipo').value = pilotoCfg.stakeTipo;

    el('pilotoAtivo').addEventListener('change', function () {
        pilotoCfg.ativo = this.checked;
        if (this.checked && !pilotoCfg.epoch) pilotoCfg.epoch = Math.floor(Date.now() / 1000);
        salvarPiloto(); renderPiloto();
        showToast(this.checked ? '🎮 Piloto Automático LIGADO — conta demo simulada, sem risco' : '⏸ Piloto Automático desligado', this.checked ? 'ok' : 'info');
    });
    el('pilotoGatilho').addEventListener('change', function () { pilotoCfg.gatilho = this.value; salvarPiloto(); });
    el('pilotoSaldoIni').addEventListener('change', function () { pilotoCfg.saldoIni = lerNum('pilotoSaldoIni', { min: 1, max: 1e9, def: 10000 }); salvarPiloto(); renderPiloto(); });
    el('pilotoStake').addEventListener('change', function () { pilotoCfg.stake = lerNum('pilotoStake', { min: 0.01, max: 1e9, def: 100, float: 1 }); salvarPiloto(); });
    el('pilotoStakeTipo').addEventListener('change', function () { pilotoCfg.stakeTipo = this.value; salvarPiloto(); });
    el('pilotoZerar').addEventListener('click', function () {
        pilotoCfg.epoch = Math.floor(Date.now() / 1000);
        pilotoCfg.saldoIni = lerNum('pilotoSaldoIni', { min: 1, max: 1e9, def: 10000 });
        salvarPiloto(); renderPiloto();
        showToast('🔄 Conta demo zerada — saldo em ' + _pMoney(pilotoCfg.saldoIni), 'ok');
    });
    renderPiloto();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configurarPiloto);
else configurarPiloto();
// ============================================================================
// BLOCO 15 — FERRAMENTAS PRO (estilo Profit): Book de Ofertas (DOM), Times &
// Trades, Volume Profile e Níveis no gráfico (Fibonacci automático + S/R)
// ============================================================================
// Order flow com dados REAIS da Binance (depth + aggTrade via WebSocket). Não é
// o Profit (execução em corretora e dados B3 são licenciados/pagos) — é a fatia
// de LEITURA da plataforma, para estudo, com o que existe de feed público.

// ---- Volume Profile (função pura) ----
// Distribui o volume de cada vela no bucket do seu preço típico (h+l+c)/3 e
// devolve POC (bucket de maior volume) e Área de Valor ~70% expandida do POC.
function volumeProfile(candles, nBuckets) {
    if (!candles || !candles.length) return null;
    nBuckets = nBuckets || 24;
    let lo = Infinity, hi = -Infinity;
    candles.forEach(c => { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; });
    if (!(hi > lo)) return null;
    const passo = (hi - lo) / nBuckets;
    const buckets = new Array(nBuckets).fill(0);
    candles.forEach(c => {
        const p = (c.high + c.low + c.close) / 3;
        const i = Math.min(nBuckets - 1, Math.max(0, Math.floor((p - lo) / passo)));
        buckets[i] += c.volume || 0;
    });
    const tot = buckets.reduce((a, b) => a + b, 0) || 1;
    let poc = 0; buckets.forEach((v, i) => { if (v > buckets[poc]) poc = i; });
    let va = buckets[poc], vaLo = poc, vaHi = poc;
    while (va / tot < 0.7 && (vaLo > 0 || vaHi < nBuckets - 1)) {
        const abaixo = vaLo > 0 ? buckets[vaLo - 1] : -1;
        const acima = vaHi < nBuckets - 1 ? buckets[vaHi + 1] : -1;
        if (acima >= abaixo) { vaHi++; va += buckets[vaHi]; } else { vaLo--; va += buckets[vaLo]; }
    }
    return { lo, hi, passo, buckets, tot, poc, vaLo, vaHi };
}

// ---- Fibonacci automático (função pura) ----
// Retração da última perna: maior topo e menor fundo dos últimos 120 candles.
// Fundo antes do topo = perna de ALTA → retrações medidas do topo p/ baixo.
function fibNiveis(candles) {
    if (!candles || candles.length < 20) return null;
    const janela = candles.slice(-120);
    let hi = -Infinity, lo = Infinity, iHi = 0, iLo = 0;
    janela.forEach((c, i) => { if (c.high > hi) { hi = c.high; iHi = i; } if (c.low < lo) { lo = c.low; iLo = i; } });
    if (!(hi > lo)) return null;
    const alta = iLo < iHi;
    const r = hi - lo;
    return { alta, hi, lo, niveis: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map(k => ({ k, preco: alta ? hi - r * k : lo + r * k })) };
}

// ---- Desequilíbrio do book (função pura): (compra − venda) / total ∈ [-1, 1] ----
function bookImbalance(bids, asks) {
    const b = bids.reduce((s, x) => s + x[1], 0), a = asks.reduce((s, x) => s + x[1], 0);
    const t = b + a; return t ? (b - a) / t : 0;
}

// ============================================================================
// NÍVEIS NO GRÁFICO (price lines do LightweightCharts, com toggle)
// ============================================================================
let linhasNiveis = [];
function alternarNiveis(on) {
    linhasNiveis.forEach(l => { try { serieVelas.removePriceLine(l); } catch (e) { } });
    linhasNiveis = [];
    if (typeof tracarLTs === 'function') { try { tracarLTs(on); } catch (e) { } }   // LTA/LTB acompanham o toggle
    if (!on || !serieVelas || !dados || dados.length < 20) return;
    const add = (price, color, style, title) => {
        try { linhasNiveis.push(serieVelas.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: false, title })); } catch (e) { }
    };
    // Fib: só os níveis que decidem (38.2 · 50 · 61.8, a "zona de ouro") — 0/100
    // coincidem com os extremos (redundantes) e 23.6/78.6 poluem. Bem suaves.
    const fib = fibNiveis(dados);
    if (fib) fib.niveis.filter(n => n.k === 0.382 || n.k === 0.5 || n.k === 0.618)
        .forEach(n => add(n.preco, 'rgba(139,127,240,0.4)', 2, 'fib ' + Math.round(n.k * 1000) / 10));
    // S/R: só o nível confirmado MAIS PRÓXIMO acima e abaixo do preço (linha discreta)
    try {
        const piv = acharPivotsSR();
        const close = dados[dados.length - 1].close;
        piv.res.map(p => p.price).filter(p => p > close).sort((a, b) => a - b).slice(0, 1)
            .forEach(p => add(p, 'rgba(239,68,68,0.4)', 2, 'R'));
        piv.sup.map(p => p.price).filter(p => p < close).sort((a, b) => b - a).slice(0, 1)
            .forEach(p => add(p, 'rgba(34,197,94,0.4)', 2, 'S'));
    } catch (e) { }
}

// ============================================================================
// VOLUME PROFILE — painel (barras horizontais, POC/área de valor destacados)
// ============================================================================
function renderVolumeProfile() {
    const box = document.getElementById('vpBody');
    if (!box) return;
    const vp = volumeProfile(dados, 24);
    if (!vp) { box.innerHTML = '<div class="metric-empty">Carregue um par para calcular o perfil de volume.</div>'; return; }
    const max = Math.max(...vp.buckets) || 1;
    const close = dados[dados.length - 1].close;
    const dec = close < 10 ? 5 : close < 1000 ? 2 : 1;
    // do topo (preço alto) para a base (preço baixo), como no Profit
    box.innerHTML = vp.buckets.map((v, i) => {
        const pLo = vp.lo + i * vp.passo, pMid = pLo + vp.passo / 2;
        const pct = v / max * 100;
        const ehPoc = i === vp.poc, naVA = i >= vp.vaLo && i <= vp.vaHi;
        const temPreco = close >= pLo && close < pLo + vp.passo;
        return { html: `<div class="vp-row${ehPoc ? ' vp-poc' : naVA ? ' vp-va' : ''}${temPreco ? ' vp-atual' : ''}" title="${(v).toLocaleString('pt-BR')} de volume">` +
            `<span class="vp-preco">${pMid.toFixed(dec)}</span><span class="vp-bar"><span style="width:${pct.toFixed(1)}%"></span></span>` +
            `${ehPoc ? '<span class="vp-tag">POC</span>' : ''}</div>`, i };
    }).reverse().map(x => x.html).join('');
    const meta = document.getElementById('proMeta');
    if (meta) meta.textContent = 'POC ' + (vp.lo + (vp.poc + 0.5) * vp.passo).toFixed(dec);
}

// ============================================================================
// BOOK DE OFERTAS (DOM) + TIMES & TRADES — WebSocket Binance (depth + aggTrade)
// ============================================================================
let bookWS = null, bookConn = '', bookSym = '', bookBids = [], bookAsks = [], fitas = [];
let _bookPend = false;
function bookLigado() { const el = document.getElementById('bookAtivo'); return !!(el && el.checked); }
function pararBook() { if (bookWS) { try { bookWS.onclose = null; bookWS.close(); } catch (e) { } bookWS = null; } bookConn = ''; }
function bookMsg(txt) {
    const d = document.getElementById('bookDom');
    if (d) d.innerHTML = '<div class="metric-empty">' + txt + '</div>';
    const f = document.getElementById('bookFita'); if (f) f.innerHTML = '';
}

function ligarBook() {
    pararBook();
    const sym = symbolAtual();
    bookSym = sym;
    if (fonteDe(sym) !== 'binance' || sym === 'CRYPTOIDX') { bookMsg('Book/T&T ao vivo: disponível para pares <strong>Binance</strong> (abra um, ex.: BTCUSDT).'); return; }
    const s = sym.toLowerCase();
    const conn = s; bookConn = conn;
    bookBids = []; bookAsks = []; fitas = [];
    const sock = new WebSocket(`${BINANCE_WS}/stream?streams=${s}@depth20@500ms/${s}@aggTrade`);
    bookWS = sock;
    sock.onmessage = ev => {
        if (bookConn !== conn) return;
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        const d = m.data || {};
        if (m.stream && m.stream.indexOf('depth') >= 0) {
            bookBids = (d.bids || d.b || []).slice(0, 10).map(x => [+x[0], +x[1]]);
            bookAsks = (d.asks || d.a || []).slice(0, 10).map(x => [+x[0], +x[1]]);
            agendarBookRender();
        } else if (m.stream && m.stream.indexOf('aggTrade') >= 0 && d.p) {
            // d.m = comprador é maker → agressor foi o VENDEDOR (fita vermelha)
            fitas.unshift({ p: +d.p, q: +d.q, venda: !!d.m, t: Math.floor((d.T || Date.now()) / 1000) });
            if (fitas.length > 30) fitas.length = 30;
            agendarBookRender();
        }
    };
    sock.onclose = () => { if (bookConn === conn && bookLigado()) setTimeout(() => { if (bookLigado() && bookSym === symbolAtual()) ligarBook(); }, 3000); };
    const tag = document.getElementById('bookMetaTag'); if (tag) tag.textContent = '● ' + sym;
}

// Render coalescido por frame (depth chega a cada 500ms + fita a cada trade)
function agendarBookRender() {
    if (_bookPend) return;
    _bookPend = true;
    requestAnimationFrame(() => { _bookPend = false; try { renderBook(); } catch (e) { QLOG.erro('book:', e); } });
}
function renderBook() {
    const dom = document.getElementById('bookDom'), fita = document.getElementById('bookFita');
    if (!dom || !fita) return;
    if (!bookBids.length && !bookAsks.length) return;
    const maxQ = Math.max(1e-12, ...bookBids.map(b => b[1]), ...bookAsks.map(a => a[1]));
    const dec = (bookBids[0] ? bookBids[0][0] : 100) < 10 ? 5 : 2;
    const linha = (p, q, lado) =>
        `<div class="dom-row dom-${lado}"><span class="dom-preco">${p.toFixed(dec)}</span>` +
        `<span class="dom-bar"><span style="width:${(q / maxQ * 100).toFixed(1)}%"></span></span>` +
        `<span class="dom-qtd">${q >= 100 ? q.toFixed(0) : q.toFixed(3)}</span></div>`;
    const spread = bookAsks[0] && bookBids[0] ? bookAsks[0][0] - bookBids[0][0] : 0;
    const imb = bookImbalance(bookBids, bookAsks);
    dom.innerHTML =
        bookAsks.slice().reverse().map(a => linha(a[0], a[1], 'ask')).join('') +
        `<div class="dom-spread">spread ${spread.toFixed(dec)} · pressão <span class="${imb >= 0 ? 'chip-dir-up' : 'chip-dir-down'}">${imb >= 0 ? '▲' : '▼'} ${(Math.abs(imb) * 100).toFixed(0)}%</span></div>` +
        bookBids.map(b => linha(b[0], b[1], 'bid')).join('');
    // Times & Trades: agressões grandes (≥4× a mediana da janela) em destaque
    const qs = fitas.map(f => f.q).sort((a, b) => a - b);
    const mediana = qs.length ? qs[Math.floor(qs.length / 2)] : 0;
    fita.innerHTML = fitas.map(f =>
        `<div class="tt-row ${f.venda ? 'tt-sell' : 'tt-buy'}${mediana && f.q >= mediana * 4 ? ' tt-big' : ''}">` +
        `<span>${fmtHora(f.t)}</span><span>${f.p.toFixed(dec)}</span><span>${f.q >= 100 ? f.q.toFixed(0) : f.q.toFixed(4)}</span>` +
        `<span>${f.venda ? '▼' : '▲'}</span></div>`).join('');
}

// ---- Acompanha o app: painel de VP atualiza no fechamento; book segue o par ----
let _proSym = '';
function proAtualizar() {
    const painel = document.getElementById('proPanel');
    if (painel && !painel.classList.contains('recolhido')) renderVolumeProfile();
    const nv = document.getElementById('niveisAtivo');
    if (nv && nv.checked) alternarNiveis(true);   // reancora fib/S-R nos dados novos
    if (bookLigado() && bookSym !== symbolAtual()) ligarBook();   // troca de par
    _proSym = symbolAtual();
}

function configurarPro() {
    const nv = document.getElementById('niveisAtivo'), bk = document.getElementById('bookAtivo');
    if (!nv || !bk) return;
    nv.addEventListener('change', function () { alternarNiveis(this.checked); showToast(this.checked ? '📐 Níveis no gráfico: Fibonacci + S/R' : 'Níveis removidos', 'info'); });
    bk.addEventListener('change', function () {
        if (this.checked) { ligarBook(); showToast('📖 Book & Times/Trades ao vivo', 'ok'); }
        else { pararBook(); bookMsg('Ligue o fluxo para ver o book ao vivo.'); const tag = document.getElementById('bookMetaTag'); if (tag) tag.textContent = '○'; }
    });
    bookMsg('Ligue o fluxo para ver o book ao vivo.');
    renderVolumeProfile();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configurarPro);
else configurarPro();
// ============================================================================
// BLOCO 16 — MODO MINIMALISTA (rail de painéis)
// ============================================================================
// Por padrão só fica visível o ESSENCIAL: decisão+funil, gráfico de preço e o
// Registro. Todos os painéis secundários viram ícones num rail vertical fino à
// esquerda — clicou, abre/fecha; estado persistente. Os fluxos que auto-abrem
// um painel (Scanner, IA, Estudo, Heatmap) chamam railMostrar() para revelar.

// cor = halo/brilho do ícone (tema de cada ferramenta, no estilo "app icon")
const PAINEIS_MENU = [
    { id: 'painelIntel', ico: '🧠', cor: '#EC4899', rot: 'Inteligência: Price Action · Liquidez · Smart Money · Volume/Delta · Análise da Operação' },
    { id: 'painelSub', ico: '📊', cor: '#3B82F6', rot: 'RSI & ATR (gráficos)' },
    { id: 'painelFluxo', ico: '🔄', cor: '#22C55E', rot: 'Fluxo de Volume (compra × venda)' },
    { id: 'heatPanel', ico: '🗺️', cor: '#14B8A6', rot: 'Heatmap de Ativos' },
    { id: 'scanPanel', ico: '🔎', cor: '#22D3EE', rot: 'Scanner — melhores entradas' },
    { id: 'iaPanel', ico: '🤖', cor: '#8B5CF6', rot: 'IA — melhores parâmetros' },
    { id: 'agentesPanel', ico: '🕵️', cor: '#6366F1', rot: 'Agentes de Estudo' },
    { id: 'pilotoPanel', ico: '🎮', cor: '#34D399', rot: 'Piloto Automático (conta demo)' },
    { id: 'riscoPanel', ico: '🛡', cor: '#F59E0B', rot: 'Gestão de Risco & Guardião de Banca' },
    { id: 'watchPanel', ico: '⭐', cor: '#FBBF24', rot: 'Watchlist — lista de observação ao vivo' },
    { id: 'proPanel', ico: '📶', cor: '#818CF8', rot: 'Volume Profile & Níveis (fib/S-R)' },
    { id: 'bookPanel', ico: '📖', cor: '#4ADE80', rot: 'Book de Ofertas & Times/Trades' },
    { id: 'painelPA', ico: '🧭', cor: '#2DD4BF', rot: 'Price Action — estudo de entradas (S/R · fib · LTA/LTB · micro×macro)' },
    { id: 'painelEntradas', ico: '🔔', cor: '#FBBF24', rot: 'Avisos de Entrada (tabela)' },
    { id: 'painelMetricas', ico: '📐', cor: '#A78BFA', rot: 'Métricas de Análise (backtest)' },
    { id: 'estudoPanel', ico: '📚', cor: '#A855F7', rot: 'Estudos de Mercado' },
    { id: 'painelTV', ico: '📺', cor: '#60A5FA', rot: 'Gráfico oficial TradingView' },
    { id: 'painelNews', ico: '📰', cor: '#38BDF8', rot: 'Notícias em tempo real' },
    { id: 'painelStatus', ico: '🎯', cor: '#4ADE80', rot: 'Status resumido' }
];

let paineisVis = JSON.parse(localStorage.getItem('paineisVis') || 'null');
if (!paineisVis) { paineisVis = {}; PAINEIS_MENU.forEach(p => paineisVis[p.id] = 0); }   // padrão: tudo oculto

function salvarPaineis() { localStorage.setItem('paineisVis', JSON.stringify(paineisVis)); }

function aplicarPainel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = !!paineisVis[id];
    el.classList.toggle('painel-oculto', !on);
    const b = document.querySelector('.rail-btn[data-p="' + id + '"]');
    if (b) { b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
}

// Chamado pelos fluxos que auto-abrem um painel (scan/IA/estudo/heat): revela
// no rail também, senão o usuário dispara a ação e "não acontece nada".
function railMostrar(id) {
    if (!(id in paineisVis)) return;
    if (!paineisVis[id]) { paineisVis[id] = 1; salvarPaineis(); }
    aplicarPainel(id);
}

function montarRail() {
    const rail = document.getElementById('railPaineis');
    if (!rail) return;
    rail.innerHTML = PAINEIS_MENU.map(p =>
        `<button class="rail-btn" type="button" data-p="${p.id}" title="${p.rot}" aria-pressed="false" style="--ico:${p.cor}"><span class="rail-ico">${p.ico}</span></button>`
    ).join('') + '<button class="rail-btn rail-all" type="button" data-all="1" title="Mostrar/ocultar todos os painéis" style="--ico:#A78BFA"><span class="rail-ico">👁</span></button>';
    rail.addEventListener('click', ev => {
        const b = ev.target.closest('.rail-btn');
        if (!b) return;
        if (b.dataset.all) {
            const abrir = PAINEIS_MENU.some(p => !paineisVis[p.id]);   // se algo está oculto, mostra tudo; senão esconde tudo
            PAINEIS_MENU.forEach(p => paineisVis[p.id] = abrir ? 1 : 0);
        } else {
            paineisVis[b.dataset.p] = paineisVis[b.dataset.p] ? 0 : 1;
        }
        salvarPaineis();
        PAINEIS_MENU.forEach(p => aplicarPainel(p.id));
        // largura útil pode mudar (gráficos remedem)
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    PAINEIS_MENU.forEach(p => aplicarPainel(p.id));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarRail);
else montarRail();

// ---- Lupa do Dock (macOS): os ícones do rail crescem conforme a proximidade
// do cursor (transform puro = composited; 1 cálculo por frame no máximo) ----
(function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = null;
    function magnetizar(e) {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            document.querySelectorAll('#railPaineis .rail-btn').forEach(b => {
                const r = b.getBoundingClientRect();
                const d = Math.abs(e.clientY - (r.top + r.height / 2));
                const s = Math.max(1, 1.5 - d / 110);          // até 1.5× no ícone sob o cursor
                b.style.transform = s > 1.02 ? `scale(${s.toFixed(3)})` : '';
            });
        });
    }
    function soltar() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        document.querySelectorAll('#railPaineis .rail-btn').forEach(b => { b.style.transform = ''; });
    }
    document.addEventListener('DOMContentLoaded', function () {
        const rail = document.getElementById('railPaineis');
        if (!rail) return;
        rail.addEventListener('mousemove', magnetizar);
        rail.addEventListener('mouseleave', soltar);
    });
})();
// ============================================================================
// BLOCO 17 — PRICE ACTION: ESTUDO DE ENTRADAS
// (Suporte/Resistência + Fibonacci + LTA/LTB + análise micro × macro)
// ============================================================================
// Leitura DESCRITIVA para estudo — não prevê o futuro. A tese ensinada aqui:
// a entrada de qualidade nasce no TESTE de uma zona onde vários níveis se
// somam (S/R + retração de fib + linha de tendência), a favor do alinhamento
// micro (estrutura do TF operado) × macro (TF maior / EMA200).

// ---- LTA/LTB (função pura) ----
// LTA = fundos ASCENDENTES ligados (suporte dinâmico); LTB = topos DESCENDENTES.
// Liga os 2 últimos pivôs que respeitam a direção, conta os TOQUES (pivôs a
// ≤ tolAtr·ATR da linha) e projeta o valor da linha na última vela.
function calcularLT(pivos, nBarras, tipo, tolAtr, atrV) {
    if (!pivos || pivos.length < 2) return null;
    const asc = tipo === 'LTA';
    let p0 = null, p1 = null;
    for (let k = pivos.length - 1; k >= 1 && !p0; k--) {
        for (let j = k - 1; j >= 0; j--) {
            if (asc ? pivos[k].price > pivos[j].price : pivos[k].price < pivos[j].price) { p1 = pivos[k]; p0 = pivos[j]; break; }
        }
    }
    if (!p0 || p1.i === p0.i) return null;
    const slope = (p1.price - p0.price) / (p1.i - p0.i);
    if (asc ? slope <= 0 : slope >= 0) return null;
    const valor = i => p0.price + slope * (i - p0.i);
    const tol = (atrV || 0) * (tolAtr || 0.35) || Math.abs(p1.price) * 0.001;
    // toques em QUALQUER pivô colinear (a linha se estende p/ trás): 3+ = LT validada
    const toques = pivos.filter(p => Math.abs(p.price - valor(p.i)) <= tol).length;
    return { tipo, i0: p0.i, p0: p0.price, i1: p1.i, p1: p1.price, slope, atual: valor(nBarras - 1), toques };
}

// ---- Zonas de confluência (função pura) ----
// Agrupa níveis a ≤ tol um do outro numa "zona"; quanto mais itens (S/R, fib,
// LTA/LTB) na mesma zona, mais forte ela é. Ordena da mais confluente p/ menos.
function zonasConfluencia(niveis, tol) {
    const ord = niveis.slice().sort((a, b) => a.preco - b.preco);
    const zonas = [];
    ord.forEach(nv => {
        const z = zonas[zonas.length - 1];
        if (z && Math.abs(nv.preco - z.preco) <= tol) {
            z.preco = (z.preco * z.n + nv.preco) / (z.n + 1);
            z.itens.push(nv.rotulo); z.n++;
        } else zonas.push({ preco: nv.preco, itens: [nv.rotulo], n: 1 });
    });
    return zonas.sort((a, b) => b.n - a.n);
}

// ---- Estrutura micro (topos/fundos do TF operado): HH·HL = alta, LH·LL = baixa ----
function estruturaMicro(piv) {
    const tops = piv.res.slice(-2), funds = piv.sup.slice(-2);
    if (tops.length < 2 || funds.length < 2) return 0;
    const hh = tops[1].price > tops[0].price, hl = funds[1].price > funds[0].price;
    return hh && hl ? 1 : (!hh && !hl) ? -1 : 0;
}

// ---- LTA/LTB traçadas no gráfico (séries de linha, junto do toggle 📐) ----
let serieLTA = null, serieLTB = null;
function tracarLTs(on) {
    [serieLTA, serieLTB].forEach(s => { if (s) { try { chartPreco.removeSeries(s); } catch (e) { } } });
    serieLTA = serieLTB = null;
    if (!on || !chartPreco || !dados || dados.length < 30 || !computed || !computed.atrValues) return;
    const piv = acharPivotsSR();
    const atrV = computed.atrValues[dados.length - 1] || 0;
    const lta = calcularLT(piv.sup, dados.length, 'LTA', 0.35, atrV);
    const ltb = calcularLT(piv.res, dados.length, 'LTB', 0.35, atrV);
    const mk = (lt, cor) => {
        const s = chartPreco.addLineSeries({ color: cor, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData([{ time: dados[lt.i0].time, value: lt.p0 }, { time: dados[dados.length - 1].time, value: lt.atual }]);
        return s;
    };
    if (lta) serieLTA = mk(lta, 'rgba(34, 197, 94, 0.55)');
    if (ltb) serieLTB = mk(ltb, 'rgba(239, 68, 68, 0.55)');
}

// ---- Painel 🧭: monta a leitura completa da entrada ----
function renderPriceAction() {
    const body = document.getElementById('paBody');
    if (!body || !dados || dados.length < 30 || !computed || !computed.atrValues) return;
    const n = dados.length, close = dados[n - 1].close;
    const atrV = computed.atrValues[n - 1] || close * 0.002;
    const piv = acharPivotsSR();
    const lta = calcularLT(piv.sup, n, 'LTA', 0.35, atrV);
    const ltb = calcularLT(piv.res, n, 'LTB', 0.35, atrV);

    // Níveis que entram nas zonas: 3 S/R de cada lado + fibs internas + LTA/LTB
    const niveis = [];
    piv.res.map(p => p.price).filter(p => p > close).sort((a, b) => a - b).slice(0, 3).forEach(p => niveis.push({ preco: p, rotulo: 'R' }));
    piv.sup.map(p => p.price).filter(p => p < close).sort((a, b) => b - a).slice(0, 3).forEach(p => niveis.push({ preco: p, rotulo: 'S' }));
    const fib = fibNiveis(dados);
    if (fib) fib.niveis.forEach(f => { if (f.k > 0 && f.k < 1) niveis.push({ preco: f.preco, rotulo: 'fib ' + Math.round(f.k * 1000) / 10 }); });
    if (lta) niveis.push({ preco: lta.atual, rotulo: 'LTA' });
    if (ltb) niveis.push({ preco: ltb.atual, rotulo: 'LTB' });
    const zonas = zonasConfluencia(niveis, atrV * 0.5);
    const zPerto = zonas.filter(z => Math.abs(z.preco - close) <= atrV * 0.8)[0] || null;

    // micro × macro: estrutura do TF operado vs TF maior (ou EMA200 c/ inclinação)
    const micro = estruturaMicro(piv);
    let macro = 0;
    if (htfTrend && htfTrend.length === n) macro = htfTrend[n - 1];
    else {
        const e2 = computed.ema200[n - 1], e2a = computed.ema200[n - 21];
        if (e2 != null && e2a != null) macro = (close > e2 && e2 > e2a) ? 1 : (close < e2 && e2 < e2a) ? -1 : 0;
    }
    const pat = padraoVela(n - 1);
    const dec = close < 10 ? 5 : 2;
    const rot = d => d === 1 ? '📈 alta' : d === -1 ? '📉 baixa' : '↔ neutra';
    // Padrões clássicos (doji/harami/CHoCH/topo-fundo duplo/triângulo-canal)
    let pads = [];
    try { if (typeof padroesAtuais === 'function') pads = padroesAtuais(); } catch (e) { }
    const padsTxt = pads.length ? pads.map(p => (p.dir === 1 ? '📈 ' : p.dir === -1 ? '📉 ' : '◇ ') + p.nome).join(' · ') : '—';
    const padsCls = pads.some(p => p.dir === 1) && !pads.some(p => p.dir === -1) ? 'kv-good'
        : pads.some(p => p.dir === -1) && !pads.some(p => p.dir === 1) ? 'kv-bad' : '';
    body.innerHTML =
        kv('Macro (TF maior / EMA200)', rot(macro), macro === 1 ? 'kv-good' : macro === -1 ? 'kv-bad' : '') +
        kv('Micro (estrutura do TF)', rot(micro) + (micro === 1 ? ' · HH+HL' : micro === -1 ? ' · LH+LL' : ''), micro === 1 ? 'kv-good' : micro === -1 ? 'kv-bad' : '') +
        kv('Alinhamento', micro !== 0 && micro === macro ? '✓ micro = macro' : '— divergentes', micro !== 0 && micro === macro ? 'kv-good' : '') +
        kv('LTA (fundos ascendentes)', lta ? lta.toques + ' toques · ' + lta.atual.toFixed(dec) : '—', lta ? 'kv-good' : '') +
        kv('LTB (topos descendentes)', ltb ? ltb.toques + ' toques · ' + ltb.atual.toFixed(dec) : '—', ltb ? 'kv-bad' : '') +
        kv('Zona de confluência', zPerto ? zPerto.n + '× em ' + zPerto.preco.toFixed(dec) + ' (' + zPerto.itens.join(' + ') + ')' : 'nenhuma a ≤0.8 ATR', zPerto && zPerto.n >= 2 ? 'kv-good' : '') +
        kv('Vela atual', pat.up ? 'reversão de alta' : pat.down ? 'reversão de baixa' : '—', pat.up ? 'kv-good' : pat.down ? 'kv-bad' : '') +
        kv('Padrões de preço', padsTxt, padsCls);

    // Leitura da ENTRADA (estudo descritivo, nunca ordem)
    let leitura;
    if (zPerto && zPerto.n >= 2) {
        const abaixo = zPerto.preco < close;
        const lado = abaixo ? 'SUPORTE' : 'RESISTÊNCIA';
        const vies = abaixo ? 'CALL' : 'PUT';
        const confirmou = (abaixo && pat.up) || (!abaixo && pat.down);
        leitura = `Preço a ${(Math.abs(close - zPerto.preco) / atrV).toFixed(1)} ATR de zona de ${lado} com ${zPerto.n} confluências (${zPerto.itens.join(' + ')}). ` +
            `Contexto de estudo p/ ${vies}: ${confirmou ? 'vela de reversão CONFIRMANDO o teste' : 'aguarde a vela de confirmação no teste da zona'}` +
            `${micro !== 0 && micro === macro ? ' · micro e macro alinhados ✓' : ' · micro × macro divergentes — reduza a expectativa'}.`;
    } else {
        leitura = 'Preço "no meio do nada" (sem zona a ≤0.8 ATR). Em price action a entrada de qualidade nasce no TESTE de uma zona de confluência — espere o preço chegar em S/R + fib + LT, não persiga.';
    }
    const le = document.getElementById('paLeitura'); if (le) le.textContent = '📖 ' + leitura;
    const meta = document.getElementById('paMeta'); if (meta) meta.textContent = zonas.filter(z => z.n >= 2).length + ' zonas fortes';
}
// ============================================================================
// BLOCO 18 — DETALHE DA ENTRADA (um clique: motivos + gráfico + horários)
// ============================================================================
// Ao virar o veredito para CALL/PUT, guardamos um RETRATO da entrada (motivos,
// funil e as últimas velas). A notificação do navegador e cada linha do Registro
// abrem este painel: mostra TODOS os motivos, o mini-gráfico do momento e o
// horário de ENTRAR × SAIR (entrada + expiração). Estudo — nunca ordem.

let _ultimaEntradaIdx = -1;
let _detChart = null, _detSerie = null;
let _detIdx = -1;               // entrada aberta no painel (p/ o diário)

// ---- Diário da operação: nota + tags rápidas gravadas na entrada ----
const DET_TAGS = ['✅ plano seguido', '⚠️ fora do plano', '😤 emocional', '🎯 zona perfeita', '🌪 mercado ruim'];
function salvarNotaEntrada(idx, texto, tags) {
    const r = registro && registro[idx];
    if (!r) return false;
    if (texto != null) r.nota = texto.trim().slice(0, 500) || undefined;
    if (tags != null) r.tags = tags.length ? tags.slice(0, 5) : undefined;
    localStorage.setItem('registroEntradas', JSON.stringify(registro));
    renderRegistro();
    return true;
}
function _detRenderTags(r) {
    const box = document.getElementById('detTags');
    if (!box) return;
    const ativas = (r && r.tags) || [];
    box.innerHTML = DET_TAGS.map(t =>
        `<button type="button" class="det-tag${ativas.includes(t) ? ' det-tag-on' : ''}" data-tag="${t}">${t}</button>`).join('');
}

// ---- Retrato da entrada no instante da virada (guardado em registro[i].det) ----
function snapshotEntrada(verdictKey, gFull, fn) {
    const n = dados ? dados.length : 0;
    const entryPrice = n ? dados[n - 1].close : null;
    // fatores LIGADOS e para onde apontam agora (▲/▼/✓/—)
    const fatores = (confLive.fatores || []).filter(f => f.on).map(f => ({ nome: f.nome, dir: f.dir }));
    // os 6 elos do funil de qualidade no momento (true/false/null)
    let funil = null;
    if (fn) funil = [
        { rot: 'Regime', ok: fn.regimeOk },
        { rot: 'Confluência', ok: fn.confOk },
        { rot: 'Portões', ok: fn.portoesOk },
        { rot: 'Evidência', ok: fn.evidOk },
        { rot: 'Calibração', ok: fn.calibOk },
        { rot: 'Execução', ok: fn.execOk }
    ];
    // últimas 48 velas para o mini-gráfico (cópia enxuta OHLC)
    const velas = n ? dados.slice(-48).map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })) : [];
    // poda: só as ~20 entradas mais recentes guardam velas (limita o localStorage)
    try {
        const comVelas = registro.filter(r => r.det && r.det.velas);
        if (comVelas.length > 19) comVelas.slice(0, comVelas.length - 19).forEach(r => { delete r.det.velas; });
    } catch (e) { }
    // padrões de preço presentes no instante da virada (leitura de estudo)
    let padroes = [];
    try { if (typeof padroesAtuais === 'function') padroes = padroesAtuais().map(p => ({ nome: p.nome, dir: p.dir })); } catch (e) { }
    return {
        veredito: verdictKey, entryPrice, padroes,
        grade: gFull ? gFull.grade : null,
        score: gFull ? gFull.score : null,
        pEst: gFull ? gFull.pEst : null,
        pLB: gFull ? gFull.pLB : null,
        pN: gFull ? gFull.pN : null,
        expOp: gFull ? gFull.expOp : null,
        motivos: gFull && gFull.motivos ? gFull.motivos.slice() : [],
        fatores, funil,
        tf: typeof tfMinutes === 'function' ? tfMinutes() : null
    };
}

// ---- Abrir o painel de detalhe de uma entrada do Registro ----
function abrirDetalheEntrada(idx) {
    if (idx == null || idx < 0 || idx >= (registro ? registro.length : 0)) idx = _ultimaEntradaIdx;
    const r = registro && registro[idx];
    const modal = document.getElementById('detalheModal');
    if (!modal) return;
    if (!r) { if (typeof showToast === 'function') showToast('Entrada não encontrada no registro.', 'err'); return; }
    const d = r.det || {};
    const exp = r.exp || 5;
    const up = r.dir === 1;
    const dec = (d.entryPrice != null && d.entryPrice < 10) ? 5 : 2;

    // Cabeçalho: par · veredito · selo
    document.getElementById('detTitulo').innerHTML =
        `<span class="det-par">${r.par || '—'}</span>` +
        `<span class="det-verd ${up ? 'det-call' : 'det-put'}">${up ? '▲ CALL' : '▼ PUT'}</span>` +
        (d.grade ? `<span class="reg-grade grade-${d.grade}">${d.grade}</span>` : '') +
        (r.paper ? `<span class="det-badge">🎮 demo</span>` : '');

    // Horários: ENTRAR (virada) × SAIR (entrada + expiração)
    document.getElementById('detHorarios').innerHTML =
        `<div class="det-hbox det-in"><div class="det-hlbl">⏱ ENTRAR</div><div class="det-hval">${fmtHora(r.t)}</div></div>` +
        `<div class="det-harrow">→ ${exp}m →</div>` +
        `<div class="det-hbox det-out"><div class="det-hlbl">🏁 SAIR</div><div class="det-hval">${fmtHora(r.t + exp * 60)}</div></div>`;

    // Números-chave: preço de entrada, score, win rate estimado, expectativa
    const num = [];
    if (d.entryPrice != null) num.push(kv('Preço na entrada', d.entryPrice.toFixed(dec)));
    if (d.score != null) num.push(kv('Score de qualidade', d.score + '/100'));
    if (d.pEst != null) num.push(kv('Win rate estimado', pctTxt(d.pEst) + (d.pLB != null ? ' · LB ' + pctTxt(d.pLB) : '') + (d.pN ? ' (' + d.pN + ' ops)' : ''), d.pLB != null && d.pLB >= 0.535 ? 'kv-good' : ''));
    if (d.expOp != null) num.push(kv('Expectativa/op', (d.expOp >= 0 ? '+' : '') + d.expOp.toFixed(2), d.expOp >= 0 ? 'kv-good' : 'kv-bad'));
    num.push(kv('Fatores a favor', r.score + '/' + r.enabled));
    if (r.resultado) num.push(kv('Resultado', r.resultado === 'WIN' ? '✓ WIN' : '✗ LOSS', r.resultado === 'WIN' ? 'kv-good' : 'kv-bad'));
    document.getElementById('detNumeros').innerHTML = num.join('');

    // Motivos (fatores que dispararam + ressalvas do selo)
    const chips = (d.fatores || []).map(f => {
        const ic = f.dir === 1 ? '▲' : f.dir === -1 ? '▼' : f.dir === 2 ? '✓' : '—';
        // a favor da entrada = aponta na direção do veredito (ou ✓ genérico)
        const aFavor = f.dir === 2 || (up ? f.dir === 1 : f.dir === -1);
        return `<span class="det-chip ${aFavor ? 'det-chip-ok' : 'det-chip-nt'}">${f.nome} ${ic}</span>`;
    }).join('');
    // padrões de preço do instante (doji/harami/CHoCH/topo-fundo duplo/triângulo)
    const pats = (d.padroes || []).map(pt =>
        `<span class="det-chip det-chip-pat">${pt.dir === 1 ? '📈' : pt.dir === -1 ? '📉' : '◇'} ${pt.nome}</span>`).join('');
    document.getElementById('detFatores').innerHTML = (chips + pats) || '<span class="det-vazio">sem fatores gravados</span>';

    // Funil de qualidade (6 elos) no momento da entrada
    document.getElementById('detFunil').innerHTML = (d.funil || []).map(e => {
        const cls = e.ok === null || e.ok === undefined ? 'funil-nd' : e.ok ? 'funil-ok' : 'funil-no';
        const ic = e.ok === null || e.ok === undefined ? '·' : e.ok ? '✓' : '✕';
        return `<span class="funil-elo ${cls}">${ic} ${e.rot}</span>`;
    }).join('') || '<span class="det-vazio">funil não gravado</span>';

    // Ressalvas (por que NÃO era A, se houver)
    const rss = document.getElementById('detRessalvas');
    if (d.motivos && d.motivos.length) { rss.style.display = ''; rss.innerHTML = '⚠ ' + d.motivos.join(' · '); }
    else rss.style.display = 'none';

    // diário: nota + tags desta entrada
    _detIdx = idx;
    const nota = document.getElementById('detNota');
    if (nota) nota.value = r.nota || '';
    _detRenderTags(r);

    modal.style.display = 'flex';
    requestAnimationFrame(() => _detDesenharGrafico(r));
}

function fecharDetalhe() {
    const m = document.getElementById('detalheModal'); if (m) m.style.display = 'none';
    if (_detChart) { try { _detChart.remove(); } catch (e) { } _detChart = null; _detSerie = null; }
}

// ---- Mini-gráfico do momento da entrada ----
function _detDesenharGrafico(r) {
    const cont = document.getElementById('detGrafico');
    if (!cont || !window.LightweightCharts) return;
    if (_detChart) { try { _detChart.remove(); } catch (e) { } _detChart = null; _detSerie = null; }
    const velas = (r.det && r.det.velas) || [];
    if (!velas.length) { cont.innerHTML = '<div class="det-semgrafico">Sem velas guardadas para esta entrada (retrato antigo — só as 20 últimas guardam o gráfico).</div>'; return; }
    cont.innerHTML = '';
    const c = (typeof CORES_TEMA !== 'undefined' && typeof temaAtual === 'function') ? CORES_TEMA[temaAtual()] : { bg: '#0b0f17', text: '#c9d4e5', grid: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)' };
    _detChart = LightweightCharts.createChart(cont, {
        width: cont.clientWidth || 520, height: 240,
        layout: { background: { color: c.bg }, textColor: c.text },
        grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
        rightPriceScale: { borderColor: c.border },
        timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, tickMarkFormatter: t => fmtHora(t) },
        localization: { timeFormatter: t => fmtHora(t) },
        handleScroll: false, handleScale: false
    });
    _detSerie = _detChart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a',
        borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350'
    });
    _detSerie.setData(velas);
    const up = r.dir === 1;
    // seta da entrada na última vela (o instante da virada do veredito)
    _detSerie.setMarkers([{
        time: velas[velas.length - 1].time,
        position: up ? 'belowBar' : 'aboveBar',
        color: up ? '#22c55e' : '#ef4444',
        shape: up ? 'arrowUp' : 'arrowDown',
        text: up ? 'CALL' : 'PUT'
    }]);
    if (r.det && r.det.entryPrice != null) _detSerie.createPriceLine({
        price: r.det.entryPrice, color: '#eab308', lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: 'entrada'
    });
    _detChart.timeScale().fitContent();
}

// ---- Ligações de UI ----
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('detalheModal');
    if (modal) modal.addEventListener('click', e => { if (e.target.id === 'detalheModal') fecharDetalhe(); });
    // diário: nota salva sozinha (debounce) · tags alternam no clique
    const nota = document.getElementById('detNota');
    let notaTimer = null;
    if (nota) nota.addEventListener('input', () => {
        clearTimeout(notaTimer);
        notaTimer = setTimeout(() => { if (_detIdx >= 0) salvarNotaEntrada(_detIdx, nota.value, null); }, 600);
    });
    const tags = document.getElementById('detTags');
    if (tags) tags.addEventListener('click', e => {
        const b = e.target.closest('.det-tag');
        if (!b || _detIdx < 0 || !registro[_detIdx]) return;
        const atuais = (registro[_detIdx].tags || []).slice();
        const i = atuais.indexOf(b.dataset.tag);
        if (i >= 0) atuais.splice(i, 1); else atuais.push(b.dataset.tag);
        salvarNotaEntrada(_detIdx, null, atuais);
        _detRenderTags(registro[_detIdx]);
    });
    const x = document.getElementById('detFechar');
    if (x) x.addEventListener('click', fecharDetalhe);
    // clique numa linha do Registro abre o detalhe (delegação)
    const body = document.getElementById('registroBody');
    if (body) body.addEventListener('click', e => {
        const row = e.target.closest('.reg-row');
        if (!row || row.dataset.idx == null) return;
        abrirDetalheEntrada(parseInt(row.dataset.idx, 10));
    });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharDetalhe(); });
// ============================================================================
// BLOCO 19 — MEUS FILTROS (presets do usuário: salvar/aplicar/excluir)
// ============================================================================
// Fotografa TODOS os fatores, portões e tolerâncias atuais sob um nome e
// restaura tudo de uma vez. Persistido em localStorage ('filtrosSalvos').

// O que entra na fotografia: fatores de confluência + portões + tolerâncias
// + modo/pontuação. Fonte, par e expiração ficam de fora (são da sessão).
const FILTRO_IDS = [
    // fatores de confluência
    'useTendencia', 'useEma200', 'useMomentum', 'useVolatilidade', 'useEstrutura',
    'useFluxo', 'useCorrelacao', 'usePadrao', 'useMacd', 'useBollinger',
    // portões e tolerâncias
    'useHtf', 'useSessao', 'useSR', 'srAtr', 'usePA', 'paAtr',
    'useNewsFilter', 'newsJanela', 'usePesoIA', 'useGrade', 'modoSniper',
    // parâmetros da confluência e dos indicadores dos fatores
    'confMode', 'minScore', 'confJanela', 'fluxoJanela',
    'estruturaLookback', 'cooldownVelas', 'rsiSobrevenda', 'rsiSobrecompra'
];

function _filtrosLer() { try { return JSON.parse(localStorage.getItem('filtrosSalvos') || '{}'); } catch (e) { return {}; } }
function _filtrosGravar(o) { localStorage.setItem('filtrosSalvos', JSON.stringify(o)); }

function filtroFotografar() {
    const f = {};
    FILTRO_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        f[id] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
    });
    return f;
}

function filtroAplicarValores(f) {
    FILTRO_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !(id in f)) return;
        if (el.type === 'checkbox') el.checked = !!f[id]; else el.value = f[id];
    });
}

function filtrosRenderSelect() {
    const sel = document.getElementById('filtrosSalvos');
    if (!sel) return;
    const nomes = Object.keys(_filtrosLer()).sort((a, b) => a.localeCompare(b));
    const atual = sel.value;
    sel.innerHTML = '<option value="">— aplicar filtro salvo —</option>' +
        nomes.map(n => `<option value="${escHTML(n)}">${escHTML(n)}</option>`).join('');
    if (nomes.includes(atual)) sel.value = atual;
}

function filtroSalvar() {
    const inp = document.getElementById('filtroNome');
    const nome = (inp.value || '').trim();
    if (!nome) { showToast('Dê um nome ao filtro antes de salvar.', 'err'); inp.focus(); return; }
    const todos = _filtrosLer();
    const existia = !!todos[nome];
    todos[nome] = filtroFotografar();
    _filtrosGravar(todos);
    filtrosRenderSelect();
    document.getElementById('filtrosSalvos').value = nome;
    showToast(existia ? `💾 Filtro "${nome}" atualizado` : `💾 Filtro "${nome}" salvo`, 'ok');
}

function filtroAplicar(nome) {
    const f = _filtrosLer()[nome];
    if (!f) return;
    filtroAplicarValores(f);
    document.getElementById('filtroNome').value = nome;
    showToast(`🎛️ Filtro "${nome}" aplicado`, 'ok');
    // mesmo pós-processo do preset de regime: HTF recarrega se preciso; senão só recalcula
    if (document.getElementById('useHtf').checked && fonte() !== 'sim' && dados.length) {
        carregarHtf().then(() => recalcularSinaisApenas());
    } else { htfTrend = []; recalcularSinaisApenas(); }
}

function filtroExcluir() {
    const sel = document.getElementById('filtrosSalvos');
    const nome = sel.value;
    if (!nome) { showToast('Escolha no seletor o filtro a excluir.', 'err'); return; }
    const todos = _filtrosLer();
    delete todos[nome];
    _filtrosGravar(todos);
    filtrosRenderSelect();
    sel.value = '';
    showToast(`🗑 Filtro "${nome}" excluído`, 'ok');
}

document.addEventListener('DOMContentLoaded', function () {
    filtrosRenderSelect();
    const bS = document.getElementById('btnFiltroSalvar');
    const bX = document.getElementById('btnFiltroExcluir');
    const sel = document.getElementById('filtrosSalvos');
    const inp = document.getElementById('filtroNome');
    if (bS) bS.addEventListener('click', filtroSalvar);
    if (bX) bX.addEventListener('click', filtroExcluir);
    if (sel) sel.addEventListener('change', function () { if (this.value) filtroAplicar(this.value); });
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); filtroSalvar(); } });
});
// ============================================================================
// BLOCO 20 — PERFIL DE ABERTURA (abre ajustado, balanceado e em qualidade máxima)
// ============================================================================
// Três garantias ao abrir o app:
//   1. PRIMEIRA VEZ: aplica o Perfil Máxima Qualidade (fatores + portões mais
//      assertivos) e, assim que houver dados, afina os fatores pro REGIME real
//      do mercado (preset 🎯 Auto).
//   2. SEMPRE: restaura TODOS os controles como você deixou (persistência
//      automática — mudou, salvou; fechou, reabriu igual).
//   3. IA SEM CACHE: se o par aberto ainda não tem parâmetros otimizados, a IA
//      aquece sozinha em segundo plano (uma vez; o resultado fica salvo).
// Automação de teste (navigator.webdriver) pula os automatismos 1 e 3 para os
// testes serem determinísticos — as funções são testadas por chamada direta.

// O que persiste entre sessões: tudo do filtro (FILTRO_IDS, bloco 19) + os
// parâmetros da sessão de estudo (fonte, timeframe, expiração, payout, velas,
// períodos dos indicadores, amostra da IA e som).
const BOOT_IDS = FILTRO_IDS.concat([
    'fonte', 'timeframe', 'expiracao', 'payout', 'numCandles', 'volatility',
    'emaRapida', 'emaLenta', 'rsiLen', 'atrLen', 'atrMediaLen', 'iaMinVal', 'somAtivo',
    'zonasAtivo', 'niveisAtivo',   // marcações do gráfico voltam como você deixou
    'riscoBanca', 'riscoPct', 'riscoMeta', 'riscoStop', 'riscoSeqMax'   // plano de risco
]);

let _bootUltimoEstado = '';
function salvarEstadoControles() {
    const o = {};
    BOOT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        o[id] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
    });
    const j = JSON.stringify(o);
    if (j === _bootUltimoEstado) return false;
    _bootUltimoEstado = j;
    localStorage.setItem('ctrlEstado', j);
    return true;
}

function restaurarEstadoControles() {
    let o; try { o = JSON.parse(localStorage.getItem('ctrlEstado') || 'null'); } catch (e) { o = null; }
    if (!o) return false;
    BOOT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !(id in o)) return;
        if (el.type === 'checkbox') el.checked = !!o[id]; else el.value = o[id];
    });
    return true;
}

// ---- Perfil Máxima Qualidade (primeira abertura) ----
// Liga os fatores direcionais + confirmações e TODOS os portões que elevam o
// acerto (HTF, sessão, S/R, Price Action, notícia, pesos por regime, selo).
// minScore 4: exige confluência de verdade sem estrangular as entradas.
function aplicarPerfilMaximo() {
    const on = ['useTendencia', 'useEma200', 'useMomentum', 'useVolatilidade', 'useEstrutura',
        'useFluxo', 'usePadrao', 'useMacd',
        'useHtf', 'useSessao', 'useSR', 'usePA', 'useNewsFilter', 'usePesoIA', 'useGrade'];
    const off = ['useBollinger', 'useCorrelacao'];   // reversão/correlação: opcionais, não no perfil base
    on.forEach(id => { const el = document.getElementById(id); if (el) el.checked = true; });
    off.forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
    document.getElementById('minScore').value = 4;
    document.getElementById('srAtr').value = 0.5;
    document.getElementById('paAtr').value = 0.8;
}

// Espera os dados chegarem (qualquer fonte) sem travar o boot
async function _bootEsperarDados(minVelas, tentativas) {
    for (let i = 0; i < tentativas && (!dados || dados.length < minVelas); i++) {
        await new Promise(r => setTimeout(r, 500));
    }
    return dados && dados.length >= minVelas;
}

// Primeira abertura: com os dados na tela, afina os fatores pro regime REAL
async function _bootAfinarRegime() {
    if (await _bootEsperarDados(60, 40)) {
        try { aplicarPreset('auto'); } catch (e) { }
        salvarEstadoControles();
    }
}

// IA sem cache para o par aberto: aquece sozinha (1×; nas fontes ao vivo,
// treina SÓ o par aberto — a seleção do scanner é preservada e restaurada)
let _bootIAJaRodou = false;
async function aquecerIAsePreciso() {
    if (_bootIAJaRodou || iaRodando) return false;
    if ((_params.get('treinar') || '')) return false;      // ?treinar=1 já cuida do treino
    if (!await _bootEsperarDados(210, 60)) return false;
    const sym = symbolAtual();
    if (iaCache[sym] || iaCache[sym + '|' + regimeUltimo()]) return false;   // já tem parâmetros
    if (PARES_YAHOO[sym] && typeof forexFechado === 'function' && forexFechado()) return false;
    _bootIAJaRodou = true;
    let bak = null;
    if (fonte() !== 'sim') {
        bak = Object.assign({}, scanSel);
        scanUniverse().forEach(s => scanSel[s] = false);
        scanSel[sym] = true; salvarScanSel(); renderScanFiltro();
    }
    showToast('🤖 IA aquecendo o par aberto (1ª vez) — buscando os parâmetros de maior acerto…', 'info');
    try { await otimizarIA(); } catch (e) { }
    if (bak) {
        Object.keys(scanSel).forEach(k => delete scanSel[k]);
        Object.assign(scanSel, bak); salvarScanSel(); renderScanFiltro();
    }
    return true;
}

// ---- Boot (roda no parse, ANTES do iniciar() do bloco de eventos) ----
// Os scripts ficam no fim do <body>: os controles já existem aqui, e o
// DOMContentLoaded (que chama iniciar/carregar) só dispara depois.
const _bootAutomacao = !!navigator.webdriver;
// PWA offline: registra o Service Worker (só em http/https — file:// não suporta;
// o arquivo único aberto do disco já é offline por natureza)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register('sw.js').catch(() => { }); } catch (e) { }
}
const _bootRestaurou = restaurarEstadoControles();
const _bootPrimeiraVez = !_bootRestaurou;
if (_bootPrimeiraVez && !_bootAutomacao) aplicarPerfilMaximo();

// Persistência automática: qualquer mudança de controle salva (change sobe por
// bolha); presets/filtros/IA mudam sem evento — o intervalo e o beforeunload cobrem.
document.addEventListener('change', e => {
    if (e.target && e.target.id && BOOT_IDS.includes(e.target.id)) salvarEstadoControles();
});
setInterval(salvarEstadoControles, 10000);
window.addEventListener('beforeunload', salvarEstadoControles);

document.addEventListener('DOMContentLoaded', function () {
    if (_bootAutomacao) return;   // testes: sem automatismos
    if (_bootPrimeiraVez) {
        showToast('✨ Perfil Máxima Qualidade aplicado — fatores, portões e tolerâncias já balanceados', 'ok');
        _bootAfinarRegime();
    } else {
        showToast('🎛️ Controles restaurados como você deixou', 'info');
    }
    aquecerIAsePreciso();
    salvarEstadoControles();
});
// ============================================================================
// BLOCO 21 — PADRÕES DE PREÇO (doji, harami, CHoCH, topo/fundo duplo, triângulo/canal)
// ============================================================================
// Fase 2 do endurecimento: detecção DESCRITIVA de padrões clássicos. Eles NÃO
// entram na pontuação de confluência (decisão da auditoria: padrão sem contexto
// vira ruído) — aparecem no painel 🧭 e no retrato da entrada como leitura de
// estudo, para o operador confirmar o contexto com os olhos.

// ---- Doji: corpo ≤10% do range da vela (indecisão) ----
function ehDoji(o, h, l, c) {
    const range = h - l;
    if (range <= 0) return false;
    return Math.abs(c - o) <= range * 0.1;
}

// ---- Harami: corpo atual pequeno (≤60%) DENTRO do corpo anterior grande ----
// prev de baixa + atual de alta = harami de alta (1); o inverso = de baixa (-1)
function ehHarami(prev, cur) {
    const corpoPrev = Math.abs(prev.close - prev.open);
    const corpoCur = Math.abs(cur.close - cur.open);
    if (corpoPrev <= 0 || corpoCur > corpoPrev * 0.6) return 0;
    const hiPrev = Math.max(prev.open, prev.close), loPrev = Math.min(prev.open, prev.close);
    if (Math.max(cur.open, cur.close) > hiPrev || Math.min(cur.open, cur.close) < loPrev) return 0;
    if (prev.close < prev.open && cur.close > cur.open) return 1;
    if (prev.close > prev.open && cur.close < cur.open) return -1;
    return 0;
}

// ---- Topo/fundo duplo: 2 últimos pivôs do mesmo lado no MESMO nível (±tol) ----
// Exige distância mínima de 5 barras entre os pivôs (senão é o mesmo teste).
function topoFundoDuplo(piv, tol) {
    const r = piv.res.slice(-2), s = piv.sup.slice(-2);
    if (r.length === 2 && Math.abs(r[1].price - r[0].price) <= tol && r[1].i - r[0].i >= 5)
        return { tipo: 'topo duplo', dir: -1, preco: (r[0].price + r[1].price) / 2 };
    if (s.length === 2 && Math.abs(s[1].price - s[0].price) <= tol && s[1].i - s[0].i >= 5)
        return { tipo: 'fundo duplo', dir: 1, preco: (s[0].price + s[1].price) / 2 };
    return null;
}

// ---- CHoCH (change of character): a estrutura vigente quebra ----
// Alta (HH+HL) + fechamento ABAIXO do último fundo ascendente → CHoCH de baixa.
// Baixa (LH+LL) + fechamento ACIMA do último topo descendente → CHoCH de alta.
function detectarCHoCH(piv, close) {
    const tops = piv.res.slice(-2), funds = piv.sup.slice(-2);
    if (tops.length < 2 || funds.length < 2) return 0;
    const hh = tops[1].price > tops[0].price, hl = funds[1].price > funds[0].price;
    if (hh && hl && close < funds[1].price) return -1;
    if (!hh && !hl && close > tops[1].price) return 1;
    return 0;
}

// ---- Triângulo / canal (sobre as LTs do bloco 17) ----
// LTA (fundos sobem) + LTB (topos caem) juntas = convergência → triângulo.
// Só LTA com topos também subindo em inclinação parecida (±50%) → canal de alta;
// espelho para canal de baixa.
function trianguloOuCanal(piv, nBarras, atrV) {
    const lta = calcularLT(piv.sup, nBarras, 'LTA', 0.35, atrV);
    const ltb = calcularLT(piv.res, nBarras, 'LTB', 0.35, atrV);
    if (lta && ltb) return { tipo: 'triângulo (convergência)', dir: 0 };
    const slope2 = ps => ps.length >= 2 ? (ps[ps.length - 1].price - ps[ps.length - 2].price) / (ps[ps.length - 1].i - ps[ps.length - 2].i) : null;
    if (lta) {
        const st = slope2(piv.res);
        if (st != null && st > 0 && Math.abs(st - lta.slope) <= Math.max(st, lta.slope) * 0.5)
            return { tipo: 'canal de alta', dir: 1 };
    }
    if (ltb) {
        const sf = slope2(piv.sup);
        if (sf != null && sf < 0 && Math.abs(sf - ltb.slope) <= Math.abs(Math.min(sf, ltb.slope)) * 0.5)
            return { tipo: 'canal de baixa', dir: -1 };
    }
    return null;
}

// ---- Padrões na última vela (agrega tudo p/ painel 🧭 e retrato da entrada) ----
function padroesAtuais() {
    if (!dados || dados.length < 30 || !computed || !computed.atrValues) return [];
    const n = dados.length, cur = dados[n - 1], prev = dados[n - 2];
    const atrV = computed.atrValues[n - 1] || cur.close * 0.002;
    const piv = acharPivotsSR();
    const out = [];
    if (ehDoji(cur.open, cur.high, cur.low, cur.close))
        out.push({ nome: 'Doji', dir: 0, dica: 'indecisão — espere a vela de confirmação' });
    const h = ehHarami(prev, cur);
    if (h) out.push({ nome: h === 1 ? 'Harami de alta' : 'Harami de baixa', dir: h, dica: 'corpo pequeno dentro do corpo anterior — possível reversão' });
    const td = topoFundoDuplo(piv, atrV * 0.5);
    if (td) out.push({ nome: td.tipo === 'topo duplo' ? 'Topo duplo' : 'Fundo duplo', dir: td.dir, dica: '2 pivôs no mesmo nível (±0.5 ATR) — nível defendido' });
    const ch = detectarCHoCH(piv, cur.close);
    if (ch) out.push({ nome: ch === 1 ? 'CHoCH de alta' : 'CHoCH de baixa', dir: ch, dica: 'quebra de caráter — a estrutura vigente falhou' });
    const tc = trianguloOuCanal(piv, n, atrV);
    if (tc) out.push({ nome: tc.tipo, dir: tc.dir, dica: 'formação de linhas de tendência — espere o rompimento/teste' });
    // Divergências RSI × preço (bloco 36) — entram na mesma leitura descritiva
    try {
        if (typeof detectarDivergencias === 'function') detectarDivergencias().forEach(dv =>
            out.push({ nome: dv.tipo, dir: dv.dir, dica: dv.oculta ? 'RSI diverge — sinal de CONTINUAÇÃO da tendência' : 'RSI não confirma o novo extremo — possível reversão' }));
    } catch (e) { }
    return out;
}
// ============================================================================
// BLOCO 22 — HISTÓRICO ACUMULADO (IndexedDB): amostra grande = IA confiável
// ============================================================================
// Cada carga real de velas fica guardada no navegador (IndexedDB 'quantops').
// Dia após dia o histórico local cresce — e a IA passa a treinar com MESES de
// dados em vez da janela de ~500 velas da API. Simulado nunca é gravado.

let _hdb = null;
function hdb() {
    return new Promise((res, rej) => {
        if (_hdb) return res(_hdb);
        const rq = indexedDB.open('quantops', 1);
        rq.onupgradeneeded = () => {
            const d = rq.result;
            if (!d.objectStoreNames.contains('velas'))
                d.createObjectStore('velas', { keyPath: ['sym', 'tf', 'time'] });
        };
        rq.onsuccess = () => { _hdb = rq.result; res(_hdb); };
        rq.onerror = () => rej(rq.error);
    });
}

const HIST_MAX_POR_PAR = 60000;   // ~200 dias de M5 por par/timeframe

async function historicoGravar(sym, tf, velas) {
    if (!sym || !velas || !velas.length) return false;
    try {
        const d = await hdb();
        const tx = d.transaction('velas', 'readwrite');
        const st = tx.objectStore('velas');
        velas.forEach(v => {
            if (v && v.time) st.put({ sym, tf, time: v.time, open: v.open, high: v.high, low: v.low, close: v.close, volume: v.volume || 0 });
        });
        return await new Promise(r => { tx.oncomplete = () => r(true); tx.onerror = () => r(false); tx.onabort = () => r(false); });
    } catch (e) { return false; }
}

function _histRange(sym, tf) { return IDBKeyRange.bound([sym, tf, 0], [sym, tf, Infinity]); }

async function historicoCarregar(sym, tf, max) {
    try {
        const d = await hdb();
        const st = d.transaction('velas', 'readonly').objectStore('velas');
        const tudo = await new Promise((r, j) => { const q = st.getAll(_histRange(sym, tf)); q.onsuccess = () => r(q.result || []); q.onerror = () => j(q.error); });
        tudo.sort((a, b) => a.time - b.time);
        return max && tudo.length > max ? tudo.slice(-max) : tudo;
    } catch (e) { return []; }
}

async function historicoInfo(sym, tf) {
    try {
        const d = await hdb();
        const st = d.transaction('velas', 'readonly').objectStore('velas');
        const n = await new Promise((r, j) => { const q = st.count(_histRange(sym, tf)); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
        if (!n) return { n: 0, desde: null };
        const first = await new Promise((r, j) => { const q = st.openCursor(_histRange(sym, tf)); q.onsuccess = () => r(q.result ? q.result.value.time : null); q.onerror = () => j(q.error); });
        return { n, desde: first };
    } catch (e) { return { n: 0, desde: null }; }
}

async function historicoLimpar() {
    try {
        const d = await hdb();
        const tx = d.transaction('velas', 'readwrite');
        tx.objectStore('velas').clear();
        return await new Promise(r => { tx.oncomplete = () => r(true); tx.onerror = () => r(false); });
    } catch (e) { return false; }
}

// Poda o excedente antigo de um par/TF (mantém as HIST_MAX_POR_PAR mais novas)
async function _histPodar(sym, tf) {
    try {
        const info = await historicoInfo(sym, tf);
        if (info.n <= HIST_MAX_POR_PAR + 5000) return;
        let sobra = info.n - HIST_MAX_POR_PAR;
        const d = await hdb();
        const tx = d.transaction('velas', 'readwrite');
        const cur = tx.objectStore('velas').openCursor(_histRange(sym, tf));
        cur.onsuccess = () => {
            const c = cur.result;
            if (c && sobra-- > 0) { c.delete(); c.continue(); }
        };
    } catch (e) { }
}

// ---- Merge para a IA: histórico local (antigo) + janela fresca da API ----
// Também grava a janela fresca — cada rodada da IA engorda o histórico.
async function historicoParaIA(sym, tf, frescas, cap) {
    if (!frescas || !frescas.length) return frescas;
    await historicoGravar(sym, tf, frescas);
    _histPodar(sym, tf);
    const antigas = await historicoCarregar(sym, tf, cap || 2000);
    const corte = frescas[0].time;
    const merged = antigas.filter(v => v.time < corte)
        .map(v => ({ time: v.time, open: v.open, high: v.high, low: v.low, close: v.close, volume: v.volume }))
        .concat(frescas);
    const capN = cap || 2000;   // 2000 velas: estatística robusta sem sufocar CPUs fracas
    return merged.length > capN ? merged.slice(-capN) : merged;
}

// ---- Auto-acumulação: a cada 45s grava as velas do par aberto (fonte real e
// conexão saudável — o fallback simulado nunca contamina o histórico) ----
async function _histAutoSalvar() {
    try {
        if (fonte() === 'sim' || !dados || dados.length < 30) return;
        const dot = document.getElementById('connDot');
        if (!dot || dot.className.indexOf('conn-on') < 0) return;   // só com dado vivo confirmado
        await historicoGravar(symbolAtual(), tfMinutes(), dados);
        _histPodar(symbolAtual(), tfMinutes());
        renderHistInfo();
    } catch (e) { }
}
setInterval(_histAutoSalvar, 45000);

// ---- Linha informativa na seção DADOS ----
async function renderHistInfo() {
    const el = document.getElementById('histInfo');
    if (!el) return;
    try {
        const info = await historicoInfo(symbolAtual(), tfMinutes());
        el.textContent = info.n
            ? `📚 Histórico local: ${info.n.toLocaleString('pt-BR')} velas deste par/TF (desde ${new Date(info.desde * 1000).toLocaleDateString('pt-BR')}) — a IA treina com tudo.`
            : '📚 Histórico local vazio — vai acumulando sozinho a cada sessão com dados reais.';
    } catch (e) { }
}

document.addEventListener('DOMContentLoaded', function () {
    renderHistInfo();
    const b = document.getElementById('btnHistLimpar');
    if (b) b.addEventListener('click', async () => {
        await historicoLimpar();
        renderHistInfo();
        showToast('🗑 Histórico local de velas apagado', 'ok');
    });
});
// ============================================================================
// BLOCO 23 — CALIBRAÇÃO REAL: curva previsto×realizado + pesos pelos resultados
// ============================================================================
// O Registro (WIN/LOSS verificado) é o dado mais valioso do app: é o resultado
// REAL, não o backtest. Este bloco fecha o ciclo de evidência:
//   1. Curva de calibração — quando o app previu 60%, acertou 60%?
//   2. Pesos reais por fator — o acerto REAL de cada fator (quando alinhado à
//      entrada) modula a pontuação dinâmica: o backtest propõe, o real confirma.

const MAPA_FATOR_LETRA = {
    'Tendência': 'T', 'EMA 200': 'Ma', 'RSI': 'Mo', 'ATR': 'V', 'Estrutura': 'E',
    'Fluxo': 'F', 'Correlação': 'C', 'Padrão': 'P', 'MACD': 'X', 'Bollinger': 'B'
};

// ---- Curva de calibração (função pura): baldes de probabilidade prevista ----
function curvaCalibracao(regs) {
    const faixas = [[0, 50], [50, 55], [55, 60], [60, 65], [65, 101]];
    const rows = faixas.map(([a, b]) => ({ faixa: (b > 100 ? a + '%+' : a + '–' + b + '%'), a, b, n: 0, w: 0, prevSoma: 0 }));
    (regs || []).forEach(r => {
        if (!r.resultado || !r.det || r.det.pEst == null) return;
        const p = r.det.pEst * 100;
        const row = rows.find(x => p >= x.a && p < x.b);
        if (!row) return;
        row.n++; row.prevSoma += r.det.pEst;
        if (r.resultado === 'WIN') row.w++;
    });
    return rows.filter(r => r.n > 0).map(r => ({ faixa: r.faixa, n: r.n, prev: r.prevSoma / r.n, real: r.w / r.n }));
}

// ---- Pesos reais por fator (função pura) ----
// Para cada entrada verificada, cada fator ALINHADO à direção da entrada
// (dir = dir da entrada, ou ✓ não-direcional) recebe o desfecho dela.
function pesosReaisCalc(regs) {
    const o = {};
    (regs || []).forEach(r => {
        if (!r.resultado || !r.det || !r.det.fatores) return;
        r.det.fatores.forEach(f => {
            const k = MAPA_FATOR_LETRA[f.nome];
            if (!k) return;
            if (!(f.dir === 2 || f.dir === r.dir)) return;
            o[k] = o[k] || { n: 0, w: 0 };
            o[k].n++;
            if (r.resultado === 'WIN') o[k].w++;
        });
    });
    Object.keys(o).forEach(k => o[k].wr = o[k].w / o[k].n);
    return o;
}

// Multiplicador do fator na pontuação dinâmica: neutro (1.0) até 10 amostras;
// depois, acerto real 60% → ×1.10 · 40% → ×0.90 (limitado a ±25%).
function pesoRealFator(mapa, k) {
    const o = mapa && mapa[k];
    if (!o || o.n < 10) return 1;
    return Math.max(0.75, Math.min(1.25, 1 + (o.wr - 0.5)));
}

// Memo de 5s: calcularSinais roda o tempo todo; o registro muda devagar
let _pReaisMemo = null, _pReaisT = 0;
function pesosReaisMapa() {
    if (!_pReaisMemo || Date.now() - _pReaisT > 5000) {
        _pReaisMemo = pesosReaisCalc(typeof registro !== 'undefined' ? registro : []);
        _pReaisT = Date.now();
    }
    return _pReaisMemo;
}

// ---- Render: curva + fatores no painel de calibração da IA ----
function renderCalibracaoAvancada() {
    const box = document.getElementById('calibExtra');
    if (!box) return;
    const regs = typeof registro !== 'undefined' ? registro : [];
    const curva = curvaCalibracao(regs);
    const pesos = pesosReaisCalc(regs);
    const temPesos = Object.keys(pesos).some(k => pesos[k].n >= 5);
    if (!curva.length && !temPesos) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    let html = '';
    if (curva.length) {
        html += '<div class="calib-tit">📏 Curva de calibração — previsto × realizado</div>';
        html += curva.map(c => {
            const dif = c.real - c.prev;
            const cls = Math.abs(dif) <= 0.07 ? 'kv-good' : dif < 0 ? 'kv-bad' : 'kv-warn';
            return `<div class="kv ${cls}"><span>previsto ${c.faixa} (${c.n} ops)</span><b>real ${pctTxt(c.real)} · ${dif >= 0 ? '+' : ''}${Math.round(dif * 100)}pp</b></div>`;
        }).join('');
        html += '<p class="group-note">Verde = honesto (±7pp) · vermelho = IA otimista (prometeu mais do que entregou).</p>';
    }
    if (temPesos) {
        const NOMES = Object.keys(MAPA_FATOR_LETRA);
        html += '<div class="calib-tit">⚖️ Acerto REAL por fator (quando alinhado à entrada)</div><div class="calib-fatores">';
        html += NOMES.filter(n => pesos[MAPA_FATOR_LETRA[n]] && pesos[MAPA_FATOR_LETRA[n]].n >= 5).map(n => {
            const o = pesos[MAPA_FATOR_LETRA[n]];
            const cls = o.wr >= 0.55 ? 'chip-dir-up' : o.wr < 0.5 ? 'chip-dir-down' : '';
            return `<span class="decision-chip"><span class="${cls}">${n} ${pctTxt(o.wr)}</span> <span class="ia-params">(${o.n})</span></span>`;
        }).join('');
        html += '</div><p class="group-note">Com 10+ amostras o fator passa a pesar na pontuação dinâmica: o resultado REAL confirma (ou demite) o backtest.</p>';
    }
    box.innerHTML = html;
}
// ============================================================================
// BLOCO 24 — RELATÓRIO SEMANAL (HTML autocontido, baixado pelo navegador)
// ============================================================================
// Fotografa a performance REAL do período (registro verificado): placar geral
// com limite inferior de Wilson, quebras por selo/funil/par, curva de
// calibração, acerto por fator e a configuração vigente. É o espelho honesto:
// se o edge não aparece aqui, ele não existe.

function _relPct(x) { return (x * 100).toFixed(0) + '%'; }
function _relLinha(rot, val) { return `<tr><td>${rot}</td><td><b>${val}</b></td></tr>`; }

function gerarRelatorioHTML(dias) {
    dias = dias || 7;
    const agora = Math.floor(Date.now() / 1000);
    const corte = agora - dias * 86400;
    const regs = (typeof registro !== 'undefined' ? registro : []).filter(r => r.t >= corte);
    const res = regs.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS');
    const wins = res.filter(r => r.resultado === 'WIN').length;
    const wr = res.length ? wins / res.length : null;
    const lb = res.length ? wilsonLB(wins, res.length) : null;
    const payout = Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100);
    const beWR = 1 / (1 + payout);

    const grupo = (rotFn) => {
        const g = {};
        res.forEach(r => { const k = rotFn(r); if (k == null) return; g[k] = g[k] || { n: 0, w: 0 }; g[k].n++; if (r.resultado === 'WIN') g[k].w++; });
        return Object.keys(g).map(k => ({ k, n: g[k].n, w: g[k].w, wr: g[k].w / g[k].n })).sort((a, b) => b.n - a.n);
    };
    const porGrade = grupo(r => r.grade || 'sem selo');
    const porFunil = grupo(r => r.funil == null ? null : (r.funil >= 5 ? 'funil ≥5' : 'funil ≤4'));
    const porPar = grupo(r => r.par);
    const curva = typeof curvaCalibracao === 'function' ? curvaCalibracao(regs) : [];
    const pesos = typeof pesosReaisCalc === 'function' ? pesosReaisCalc(regs) : {};

    const fatoresOn = (confLive.fatores || []).filter(f => f.on).map(f => f.nome).join(' · ') || '—';
    const portoes = ['useHtf:TF maior', 'useSessao:Sessões', 'useSR:S/R', 'usePA:Price Action', 'useNewsFilter:Notícias', 'usePesoIA:Pesos IA', 'modoSniper:Sniper']
        .map(s => { const [id, rot] = s.split(':'); const el = document.getElementById(id); return el && el.checked ? rot : null; })
        .filter(Boolean).join(' · ') || 'nenhum';

    const tbl = (titulo, linhas) => linhas.length
        ? `<h2>${titulo}</h2><table>${linhas.map(g => `<tr><td>${g.k}</td><td>${g.w}/${g.n}</td><td><b>${_relPct(g.wr)}</b></td></tr>`).join('')}</table>` : '';

    const veredito = wr == null ? 'Sem operações verificadas no período — nada a provar ainda.'
        : lb >= beWR ? `✅ Edge estatístico PRESENTE no período: mesmo no limite inferior (${_relPct(lb)}), o acerto supera o break-even (${_relPct(beWR)}).`
        : wr >= beWR ? `⚠️ Acerto acima do break-even (${_relPct(wr)} vs ${_relPct(beWR)}), mas a amostra (${res.length} ops) ainda NÃO garante edge no limite inferior (${_relPct(lb)}). Continue registrando.`
        : `❌ SEM edge no período: acerto ${_relPct(wr)} abaixo do break-even ${_relPct(beWR)}. O relatório existe para isto — não opere contra a evidência.`;

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>QUANT OPS — Relatório ${dias} dias</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;background:#0b101a;color:#c9d4e5;max-width:820px;margin:24px auto;padding:0 16px;line-height:1.55}
h1{font-size:22px;background:linear-gradient(100deg,#22D3EE,#8B5CF6,#EC4899);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:15px;margin:22px 0 8px;color:#fff;border-left:4px solid #8B5CF6;padding-left:8px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
td{padding:5px 8px;border-bottom:1px solid rgba(170,181,197,.14)}
td:last-child{text-align:right}
.veredito{background:rgba(139,92,246,.10);border:1px solid rgba(139,92,246,.35);border-radius:10px;padding:12px 14px;font-size:14px}
.nota{font-size:12px;color:#6E7A8C;margin-top:20px;border-top:1px solid rgba(170,181,197,.14);padding-top:10px}
b{color:#fff}
</style></head><body>
<h1>◈ QUANT OPS — Relatório de ${dias} dias</h1>
<p>Período: ${new Date(corte * 1000).toLocaleDateString('pt-BR')} → ${new Date(agora * 1000).toLocaleDateString('pt-BR')} · gerado em ${new Date().toLocaleString('pt-BR')}</p>
<div class="veredito">${veredito}</div>
<h2>Placar geral</h2><table>
${_relLinha('Entradas registradas', regs.length)}
${_relLinha('Verificadas (WIN/LOSS)', res.length)}
${wr != null ? _relLinha('Acerto real', `${_relPct(wr)} (${wins}/${res.length})`) : ''}
${lb != null ? _relLinha('Limite inferior de Wilson (95%)', _relPct(lb)) : ''}
${_relLinha('Break-even do payout ' + Math.round(payout * 100) + '%', _relPct(beWR))}
${wr != null ? _relLinha('Expectativa por operação', ((expectancia(wr, payout) >= 0 ? '+' : '') + expectancia(wr, payout).toFixed(2)) + ' por unidade') : ''}
</table>
${tbl('Por selo de qualidade', porGrade)}
${tbl('Por funil no momento da entrada', porFunil)}
${tbl('Por par', porPar)}
${curva.length ? '<h2>Curva de calibração (previsto × realizado)</h2><table>' + curva.map(c => `<tr><td>previsto ${c.faixa}</td><td>${c.n} ops</td><td><b>real ${_relPct(c.real)}</b></td></tr>`).join('') + '</table>' : ''}
${Object.keys(pesos).length ? '<h2>Acerto real por fator (alinhado à entrada)</h2><table>' + Object.keys(MAPA_FATOR_LETRA).filter(n => pesos[MAPA_FATOR_LETRA[n]]).map(n => { const o = pesos[MAPA_FATOR_LETRA[n]]; return `<tr><td>${n}</td><td>${o.w}/${o.n}</td><td><b>${_relPct(o.wr)}</b></td></tr>`; }).join('') + '</table>' : ''}
${(() => { const notas = regs.filter(r => r.nota || (r.tags && r.tags.length)).slice(-8); return notas.length ? '<h2>Diário da semana</h2><table>' + notas.map(r => `<tr><td>${new Date(r.t * 1000).toLocaleString('pt-BR').slice(0, 16)} · ${r.par} ${r.dir === 1 ? '▲' : '▼'}${r.resultado ? ' · ' + r.resultado : ''}</td><td>${(r.tags || []).join(' ')} ${r.nota ? '— ' + r.nota : ''}</td></tr>`).join('') + '</table>' : ''; })()}
<h2>Configuração vigente</h2><table>
${_relLinha('Fatores ligados', fatoresOn)}
${_relLinha('Portões ligados', portoes)}
${_relLinha('Par / TF / expiração', `${symbolAtual()} · M${tfMinutes()} · ${expMinutes()}m`)}
</table>
<p class="nota">⚠️ FERRAMENTA DE ESTUDO — não é recomendação de investimento. Opções binárias/expirações curtas são de altíssimo risco; payout &lt;100% exige acerto sustentado acima do break-even só para empatar. Este relatório mostra a evidência real — decida com ela, não contra ela.</p>
</body></html>`;
}

function baixarRelatorio(dias) {
    try {
        const html = gerarRelatorioHTML(dias || 7);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'quantops-relatorio-' + new Date().toISOString().slice(0, 10) + '.html';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        showToast('📄 Relatório dos últimos ' + (dias || 7) + ' dias baixado', 'ok');
    } catch (e) { showToast('Falha ao gerar relatório: ' + e.message, 'err'); }
}

document.addEventListener('DOMContentLoaded', function () {
    const b = document.getElementById('btnRelatorio');
    if (b) b.addEventListener('click', () => baixarRelatorio(7));
});
// ============================================================================
// BLOCO 25 — AGENTES DE CONFIGURAÇÃO E VALIDAÇÃO
// ============================================================================
// Dois agentes novos no tick central do bloco 13 (60s, mesmo painel/log):
//   🔧 Configurador — vigia a coerência da configuração (expiração×TF, payout,
//      fatores × regime, parâmetros estudados da IA, pontuação impossível) e
//      oferece o CONSERTO EM 1 CLIQUE direto no log.
//   ✅ Validador — vigia a saúde estatística (par sem estudo da IA, faixa da
//      curva de calibração otimista, funil invertido, fator com acerto real
//      ruim, velas insuficientes) e sugere/agenda a correção.
// Dedupe por chave: cada problema só reaparece no log se sumir e voltar.

const agAcoes = {};
let agAcaoN = 0;
function agBotao(rotulo, fn) {
    const id = 'fx' + (++agAcaoN);
    agAcoes[id] = fn;
    return ` <button class="btn-ghost ag-fix" type="button" data-fix="${id}">${rotulo}</button>`;
}

// dedupe: avisa 1× enquanto o problema persistir; re-avisa se ele voltar
const agVistos = {};
function agAvisar(agente, chave, msg) {
    if (agVistos[chave]) return;
    agVistos[chave] = 1;
    agentesLog(agente, msg);
}
function agResolver(chave) { delete agVistos[chave]; }

const MAPA_LETRA_TOGGLE = {
    T: 'useTendencia', Ma: 'useEma200', Mo: 'useMomentum', V: 'useVolatilidade', E: 'useEstrutura',
    F: 'useFluxo', C: 'useCorrelacao', P: 'usePadrao', X: 'useMacd', B: 'useBollinger'
};

// ---- 🔧 Configurador ----
function agenteConfigurador() {
    const el = id => document.getElementById(id);

    // 1. Configuração inválida (números fora de faixa / incoerentes)
    const probs = typeof configProblemas === 'function' ? configProblemas() : [];
    if (probs.length) agAvisar('🔧 Config', 'cfgInvalida', '⚠ configuração inválida: ' + probs.join(' · ') + ' — corrija nos controles');
    else agResolver('cfgInvalida');

    // 2. Execução incoerente: expiração fora de 1–6× o timeframe
    const razao = expMinutes() / tfMinutes();
    if (razao < 1 || razao > 6) {
        agAvisar('🔧 Config', 'execRatio', `expiração ${expMinutes()}m = ${razao.toFixed(1)}× o TF (ideal 1–6×)` +
            agBotao('ajustar expiração', () => {
                const tf = tfMinutes();
                const boa = [1, 5, 15, 30, 60].find(e => e >= tf && e % tf === 0 && e / tf <= 6);
                if (boa) { el('expiracao').value = boa; recalcularSinaisApenas(); }
                return 'expiração ajustada p/ ' + boa + 'm';
            }));
    } else agResolver('execRatio');

    // 3. Payout inviável (<80%): o break-even sobe demais
    const payout = parseFloat(el('payout').value) || 87;
    if (payout < 80) agAvisar('🔧 Config', 'payoutBaixo', `payout ${payout}% exige ${pctTxt(1 / (1 + payout / 100))} de acerto só p/ empatar — confira o valor real da corretora`);
    else agResolver('payoutBaixo');

    // 4. Fatores × regime: os toggles não casam com o preset do regime atual
    if (dados && dados.length >= 210 && typeof PRESETS_REGIME !== 'undefined') {
        let reg = null; try { reg = regimeUltimo(); } catch (e) { }
        const p = reg && PRESETS_REGIME[reg];
        if (p) {
            const iguais = Object.keys(p.fatores).filter(id => { const x = el(id); return x && x.checked === !!p.fatores[id]; }).length;
            if (iguais < 7) {
                agAvisar('🔧 Config', 'presetRegime', `fatores não casam com o regime ${REGIME_ROTULO[reg] || reg} (${iguais}/10 alinhados)` +
                    agBotao('aplicar preset do regime', () => { aplicarPreset(reg); return 'preset ' + (REGIME_ROTULO[reg] || reg) + ' aplicado'; }));
            } else agResolver('presetRegime');
        }
    }

    // 5. Parâmetros estudados da IA diferentes dos controles atuais
    let reg2 = null; try { reg2 = regimeUltimo(); } catch (e) { }
    const cc = iaCache[symbolAtual() + '|' + (reg2 || '')] || iaCache[symbolAtual()];
    if (cc && cc.ms != null) {
        const difere = String(el('minScore').value) !== String(cc.ms) || String(el('rsiSobrevenda').value) !== String(cc.sv)
            || String(el('rsiSobrecompra').value) !== String(cc.sc) || String(el('estruturaLookback').value) !== String(cc.lk);
        if (difere) {
            agAvisar('🔧 Config', 'iaParams', `a IA estudou parâmetros melhores p/ este par (score≥${cc.ms} · RSI ${cc.sv}/${cc.sc} · exp ${cc.exp}m)` +
                agBotao('aplicar parâmetros da IA', () => {
                    el('minScore').value = cc.ms; el('rsiSobrevenda').value = cc.sv; el('rsiSobrecompra').value = cc.sc;
                    el('estruturaLookback').value = cc.lk; el('cooldownVelas').value = cc.cd; el('expiracao').value = cc.exp;
                    recalcularSinaisApenas();
                    return 'parâmetros da IA aplicados';
                }));
        } else agResolver('iaParams');
    }

    // 6. Pontuação impossível: exige mais fatores do que os ligados
    const en = (confLive && confLive.enabled) || 0;
    const ms = parseInt(el('minScore').value) || 0;
    if (en > 0 && ms > en && el('confMode').value !== 'estrita') {
        agAvisar('🔧 Config', 'minScoreAlto', `pontuação mínima ${ms} > ${en} fatores ligados — nunca haveria entrada` +
            agBotao('ajustar p/ ' + Math.max(2, en - 1), () => { el('minScore').value = Math.max(2, en - 1); recalcularSinaisApenas(); return 'pontuação ajustada'; }));
    } else agResolver('minScoreAlto');
}

// ---- ✅ Validador ----
function agenteValidador() {
    // 1. Par aberto sem estudo da IA (sem cache p/ símbolo nem símbolo|regime)
    const sym = symbolAtual();
    let reg = null; try { reg = regimeUltimo(); } catch (e) { }
    if (dados && dados.length >= 210 && !iaCache[sym] && !iaCache[sym + '|' + (reg || '')]) {
        agAvisar('✅ Validador', 'semIA', `${sym} nunca foi estudado pela IA — sem evidência p/ o selo A` +
            agBotao('estudar agora', () => { if (!agFilaOtim.includes(sym)) agFilaOtim.unshift(sym); return sym + ' na fila de estudo (próximo tick)'; }));
    } else agResolver('semIA');

    // 2. Velas insuficientes p/ estatística (mín. ~210)
    if (dados && dados.length > 0 && dados.length < 210) {
        agAvisar('✅ Validador', 'poucasVelas', `só ${dados.length} velas carregadas — mínimo ~210 p/ IA/backtest` +
            agBotao('carregar 500 velas', () => { document.getElementById('numCandles').value = 500; carregar(); return 'recarregando com 500 velas'; }));
    } else agResolver('poucasVelas');

    // 3. Curva de calibração: alguma faixa com 5+ ops prometendo mais do que entrega
    if (typeof curvaCalibracao === 'function') {
        const ruim = curvaCalibracao(registro).find(c => c.n >= 5 && c.real < c.prev - 0.07);
        if (ruim) {
            if (!agFilaOtim.includes(sym)) agFilaOtim.unshift(sym);
            agAvisar('✅ Validador', 'calibFaixa', `faixa prevista ${ruim.faixa} entregou só ${pctTxt(ruim.real)} (${ruim.n} ops) — reestudo agendado`);
        } else agResolver('calibFaixa');
    }

    // 4. Funil invertido: entradas de funil baixo acertando MAIS que as de funil alto
    const res = registro.filter(r => (r.resultado === 'WIN' || r.resultado === 'LOSS') && r.funil != null);
    const alto = res.filter(r => r.funil >= 5), baixo = res.filter(r => r.funil <= 4);
    if (alto.length >= 5 && baixo.length >= 5) {
        const wr = a => a.filter(r => r.resultado === 'WIN').length / a.length;
        if (wr(baixo) > wr(alto) + 0.10) {
            agAvisar('✅ Validador', 'funilInv', `funil INVERTIDO: ≤4 acerta ${pctTxt(wr(baixo))} vs ≥5 ${pctTxt(wr(alto))} — os portões atuais podem estar filtrando errado; revise HTF/sessão/S-R`);
        } else agResolver('funilInv');
    }

    // 5. Fator com acerto real ruim (10+ amostras, <45%): sugerir desligar
    if (typeof pesosReaisCalc === 'function') {
        const pesos = pesosReaisCalc(registro);
        Object.keys(pesos).forEach(k => {
            const o = pesos[k], idT = MAPA_LETRA_TOGGLE[k], elT = idT && document.getElementById(idT);
            const chave = 'fatorRuim' + k;
            if (o.n >= 10 && o.wr < 0.45 && elT && elT.checked) {
                agAvisar('✅ Validador', chave, `${FATORES_NOMES[k] || k} acerta só ${pctTxt(o.wr)} na vida real (${o.n} ops)` +
                    agBotao('desligar ' + (FATORES_NOMES[k] || k), () => { elT.checked = false; recalcularSinaisApenas(); return (FATORES_NOMES[k] || k) + ' desligado'; }));
            } else agResolver(chave);
        });
    }
}

// ---- Clique nos botões de conserto do log (delegado) ----
document.addEventListener('DOMContentLoaded', function () {
    const log = document.getElementById('agentesLog');
    if (!log) return;
    log.addEventListener('click', e => {
        const b = e.target.closest('.ag-fix');
        if (!b || !agAcoes[b.dataset.fix]) return;
        let resultado;
        try { resultado = agAcoes[b.dataset.fix]() || 'aplicado'; } catch (err) { resultado = 'falhou: ' + err.message; }
        delete agAcoes[b.dataset.fix];
        agentesLog('✔ Conserto', resultado);
    });
});
// ============================================================================
// BLOCO 26 — BACKUP COMPLETO (exporta/importa TUDO em um arquivo)
// ============================================================================
// O app vive no navegador: limpar os dados do site apaga meses de registro,
// IA treinada e configuração. Este bloco fotografa TODAS as chaves do
// localStorage do QUANT OPS num JSON único (download) e restaura de volta.
// (O histórico de velas do IndexedDB fica de fora: é grande e se reconstrói
// sozinho — o que é insubstituível é o registro e o aprendizado.)

const BACKUP_CHAVES = [
    'ctrlEstado', 'filtrosSalvos', 'registroEntradas', 'iaCache', 'pesoFatores',
    'scanSel', 'pilotoCfg', 'paineisVis', 'agentesOn', 'autoReopt', 'regSoA',
    'modoSniper', 'tema', 'ctrlVisivel', 'cardsRecolhidos', 'tdKey'
];

function coletarBackup() {
    const o = { app: 'QUANT OPS', versao: 1, data: new Date().toISOString(), chaves: {} };
    BACKUP_CHAVES.forEach(k => {
        const v = localStorage.getItem(k);
        if (v != null) o.chaves[k] = v;
    });
    return o;
}

function aplicarBackup(o) {
    if (!o || o.app !== 'QUANT OPS' || !o.chaves) throw new Error('arquivo não é um backup do QUANT OPS');
    let n = 0;
    BACKUP_CHAVES.forEach(k => {
        if (k in o.chaves) { localStorage.setItem(k, o.chaves[k]); n++; }
    });
    return n;
}

function exportarBackup() {
    try {
        const blob = new Blob([JSON.stringify(coletarBackup(), null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'quantops-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        showToast('💾 Backup completo baixado — guarde em local seguro', 'ok');
    } catch (e) { showToast('Falha no backup: ' + e.message, 'err'); }
}

document.addEventListener('DOMContentLoaded', function () {
    const bE = document.getElementById('btnBackupExp');
    const bI = document.getElementById('backupImp');
    if (bE) bE.addEventListener('click', exportarBackup);
    if (bI) bI.addEventListener('change', function () {
        const f = this.files && this.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
            try {
                const n = aplicarBackup(JSON.parse(rd.result));
                showToast(`📂 Backup restaurado (${n} conjuntos) — recarregando…`, 'ok');
                setTimeout(() => location.reload(), 900);
            } catch (e) { showToast('Backup inválido: ' + e.message, 'err'); }
            this.value = '';
        };
        rd.readAsText(f);
    });
});
// ============================================================================
// BLOCO 27 — ÍCONES INFORMATIVOS (clique em qualquer ícone → cartão explicando)
// ============================================================================
// Todo ícone do app vira porta de entrada de conhecimento: clicar mostra um
// popover com o QUE é, COMO usar e (quando existe) o botão "abrir painel" que
// leva direto pra área responsável. Cobre: emoji dos títulos dos painéis,
// tiles da topbar, chips de fatores e elos do funil. O rail já navega sozinho.

// ---- Dicionário: painéis (id → explicação) ----
const INFO_PAINEIS = {
    painelIntel: ['🧠 Inteligência', 'Leituras compactas de Price Action, Liquidez, Smart Money e Volume/Delta da última vela — o resumo do que o mercado está fazendo agora.'],
    painelSub: ['📊 RSI & ATR', 'RSI mede o momentum (sobrevenda <30 / sobrecompra >70). ATR mede a volatilidade — acima da média = mercado com energia pra andar.'],
    painelFluxo: ['🔄 Fluxo de Volume', 'Delta compra×venda por vela (só cripto/Binance): barras verdes = agressão compradora dominou; vermelhas = vendedora.'],
    heatPanel: ['🗺️ Heatmap', 'Todos os ativos marcados, coloridos pela força do sinal agora. Clique num ativo pra abrir.'],
    scanPanel: ['🔎 Scanner', 'Varre as moedas marcadas e ranqueia as melhores entradas do momento pela confluência + parâmetros da IA. Atalho: S.'],
    iaPanel: ['🤖 IA', 'Busca em grade + walk-forward que encontra os parâmetros de maior acerto por par e regime. Roda em segundo plano (Web Worker). Atalho: I.'],
    agentesPanel: ['🕵️ Agentes', '6 agentes autônomos: otimizador em rodízio, sentinela de regime, auditor de calibração, professor de fatores, 🔧 configurador e ✅ validador — com conserto em 1 clique no log.'],
    pilotoPanel: ['🎮 Piloto Automático', 'Paper trading numa conta DEMO simulada: registra sozinho as entradas que passam no gatilho (nível A / funil ≥5) e acompanha saldo, acerto e drawdown. Não toca em corretora.'],
    riscoPanel: ['🛡 Gestão de Risco', 'Calcula o stake ideal (banca × risco%), a meta e o stop do dia em R$, e um guardião que lê o placar real de hoje: avisa quando você bate a meta, o stop ou uma sequência de perdas. Saber a hora de parar é a habilidade nº 1 em binárias.'],
    watchPanel: ['⭐ Watchlist', 'Lista de observação: acompanha preço e variação % de vários ativos ao vivo (atualiza a cada 30s), ordenada pela maior variação. Clique numa linha para abrir o ativo no gráfico — ache rápido quem está se mexendo mais.'],
    proPanel: ['📊 Volume Profile & Níveis', 'Perfil de volume com POC/área de valor + níveis automáticos no gráfico (Fibonacci e S/R).'],
    bookPanel: ['📖 Book & Times/Trades', 'Profundidade do book e fita de negócios ao vivo (Binance): pressão compra×venda e agressões grandes em destaque.'],
    painelPA: ['🧭 Price Action — Entradas', 'S/R + Fibonacci + LTA/LTB + micro×macro + padrões (doji, harami, CHoCH, topo/fundo duplo, triângulo). A entrada de qualidade nasce no TESTE de uma zona de confluência.'],
    painelEntradas: ['🔔 Avisos de Entrada', 'Tabela dos sinais gerados no histórico carregado, com horário, preço e expiração — a matéria-prima do backtest.'],
    painelMetricas: ['📈 Métricas de Análise', 'Backtest dos sinais: acerto, LB de Wilson 95%, expectativa por operação, sequência máxima de perdas e curva de capital.'],
    estudoPanel: ['📚 Estudos de Mercado', 'Análises por sessão, dia da semana e volatilidade — onde o setup rende mais.'],
    painelTV: ['📺 TradingView', 'Gráfico oficial do TradingView sincronizado com o par e timeframe abertos (precisa de internet).'],
    painelNews: ['📰 Notícias', 'Manchetes em tempo real; o filtro de notícias bloqueia entradas perto de evento (janela configurável).'],
    painelStatus: ['🎯 Status', 'Resumo da conexão, fonte de dados e estado geral do app.'],
    trainPanel: ['🎓 Treino de Leitura', 'Replay vela a vela para treinar a leitura: o app esconde o futuro e você decide antes de revelar.'],
    chartPanel: ['💹 Gráfico principal', 'Velas + EMAs 9/21/200 + sinais de entrada. Toggle 📐 traça LTA/LTB; toggle de níveis desenha Fibonacci e S/R.'],
    registroPanel: ['🗓️ Registro de Entradas', 'A memória REAL do app: cada virada de veredito vira uma linha, verificada como WIN/LOSS após a expiração. Alimenta a calibração, os pesos reais e o relatório. Clique numa linha pra ver o retrato completo.'],
    decisionPanel: ['🧠 Decisão Agora', 'O veredito ao vivo: fatores de confluência, portões (HTF/S-R/sessão/notícia/PA), selo A-B-C e funil de qualidade 0–6. Só notifica nível A.']
};

// ---- Dicionário: tiles da topbar (id do span → explicação) ----
const INFO_METRICAS = {
    qoMercado: ['Mercado Atual', 'Viés dominante da leitura ao vivo: BULLISH (compra), BEARISH (venda) ou NEUTRO — resumo dos fatores de confluência.'],
    qoConf: ['Confiança', 'Força do lado dominante: % dos fatores ligados apontando na mesma direção. Anel cheio = confluência total.'],
    qoRegime: ['Regime', 'Caráter do mercado agora: 📈 tendencial (segue), ↔ lateral (reverte nas bandas) ou 🔥 volátil (reduz exposição). A IA guarda parâmetros por regime.'],
    qoVolat: ['Volatilidade', 'ATR atual vs a média: Alta = movimento com energia (bom p/ rompimento), Baixa = mercado parado (sinais fracos).'],
    qoSessao: ['Sessão', 'Sessão de mercado ativa (Londres / Nova York / Ásia). Londres+NY concentram o volume — o portão de sessão opera só nelas.'],
    qoAprov: ['Operações Aprovadas', 'Sinais do histórico que passaram por TODOS os portões de qualidade.'],
    qoBloq: ['Bloqueadas', 'Sinais barrados pelos portões (HTF, S/R, sessão, notícia, PA) — o filtro trabalhando a seu favor.'],
    qoExpect: ['Expectativa Matemática', 'R$ esperado por R$1 arriscado, dado o acerto do backtest e o payout: positivo = paga no longo prazo; negativo = não opere.']
};

// ---- Dicionário: fatores de confluência (nome no chip → explicação) ----
const INFO_FATORES = {
    'Tendência': 'Cruzamento das EMAs rápida×lenta (9×21): rápida acima = viés de alta. É o fator de direção básico.',
    'EMA 200': 'Posição do preço vs a média de 200 períodos — o viés macro. Operar contra ela exige motivo forte.',
    'RSI': 'Reversão do momentum: saiu de sobrevenda cruzando pra cima = CALL; de sobrecompra pra baixo = PUT.',
    'ATR': 'Volatilidade acima da média (não-direcional): confirma que o mercado tem energia pro movimento.',
    'Estrutura': 'Rompimento do topo/fundo recente (lookback configurável) — o mercado saiu do range.',
    'Fluxo': 'Delta compra×venda na janela (só cripto): agressão dominante indica o lado do dinheiro.',
    'Correlação': 'Maioria dos pares de referência apontando na mesma direção — o setor confirma.',
    'Padrão': 'Vela de reversão (engolfo/martelo) confirmando o sinal na última vela.',
    'MACD': 'Histograma do MACD: positivo e subindo = momentum de alta; negativo e caindo = de baixa.',
    'Bollinger': 'Fechamento fora das bandas 2σ = esticado demais — sinal de reversão à média.',
    'PA zona': 'Portão de Price Action: mostra o lado da zona (suporte/LTA ▲ ou resistência/LTB ▼) a ≤ X ATR. Com o filtro ligado, só entra no TESTE de uma zona.'
};

// ---- Dicionário: elos do funil ----
const INFO_ELOS = {
    'Regime': 'Os fatores ligados casam com o preset do regime detectado? Estratégia errada pro mercado atual derruba o acerto.',
    'Confluência': 'Lado dominante com ≥4 fatores ou ≥70% dos ligados — sinal com participação de verdade, não empate.',
    'Portões': 'HTF a favor, longe de S/R contrário, sessão forte e sem notícia próxima — o contexto libera a entrada.',
    'Evidência': 'Amostra ≥10 operações E expectativa positiva no limite inferior de Wilson — edge provado, não sorte.',
    'Calibração': 'A previsão da IA está batendo com o placar REAL do Registro? IA otimista = reotimizar antes de confiar.',
    'Execução': 'Expiração 1–6× o timeframe e payout ≥80% — a mecânica da operação não pode sabotar o edge.'
};

// ---- Popover ----
let _infoPop = null;
function mostrarInfoPop(x, y, titulo, corpo, acaoRotulo, acaoFn) {
    fecharInfoPop();
    const p = document.createElement('div');
    p.id = 'infoPop';
    p.innerHTML = `<div class="ip-tit">${titulo}</div><div class="ip-corpo">${corpo}</div>` +
        (acaoRotulo ? `<button type="button" class="btn-mini ip-acao">${acaoRotulo}</button>` : '');
    document.body.appendChild(p);
    const W = p.offsetWidth || 300, H = p.offsetHeight || 120;
    p.style.left = Math.max(8, Math.min(window.innerWidth - W - 8, x - W / 2)) + 'px';
    p.style.top = Math.max(8, Math.min(window.innerHeight - H - 8, y + 14)) + 'px';
    if (acaoFn) p.querySelector('.ip-acao').addEventListener('click', () => { fecharInfoPop(); acaoFn(); });
    _infoPop = p;
}
function fecharInfoPop() { if (_infoPop) { _infoPop.remove(); _infoPop = null; } }

// Abre o painel responsável (mostra no rail, revela e rola até ele)
function irParaPainel(id) {
    try { if (typeof railMostrar === 'function') railMostrar(id); } catch (e) { }
    const el = document.getElementById(id);
    if (el) { el.style.display = ''; el.classList.remove('painel-oculto'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

// ---- Envolve o emoji inicial de cada título de painel num alvo clicável ----
function prepararIconesTitulos() {
    document.querySelectorAll('.chart-container').forEach(cc => {
        const h2 = cc.querySelector(':scope > h2');
        if (!h2 || !h2.firstChild || h2.firstChild.nodeType !== 3) return;
        if (!INFO_PAINEIS[cc.id]) return;    // só envolve quando há explicação p/ mostrar
        const txt = h2.firstChild.nodeValue;
        const m = txt.match(/^\s*(\S+)\s/);
        if (!m || /\w/.test(m[1])) return;   // só se o 1º token for ícone (sem letras/números)
        const span = document.createElement('span');
        span.className = 'ico-info';
        span.title = 'clique: o que é este painel';
        span.textContent = m[1];
        span.dataset.painel = cc.id;
        h2.firstChild.nodeValue = txt.slice(m[0].length - 1);
        h2.insertBefore(span, h2.firstChild);
    });
    // painel de decisão não é .chart-container: registra pelo seletor próprio
    const dp = document.querySelector('.decision-panel');
    if (dp && !dp.id) dp.id = 'decisionPanel';
}

// ---- Delegação global de cliques ----
document.addEventListener('click', function (e) {
    if (_infoPop && !_infoPop.contains(e.target)) fecharInfoPop();

    // 1) emoji do título do painel → info do painel (sem recolher o card)
    const ico = e.target.closest('.ico-info');
    if (ico) {
        e.stopPropagation();
        const id = ico.dataset.painel || (ico.closest('.chart-container') || {}).id;
        const inf = INFO_PAINEIS[id];
        if (inf) mostrarInfoPop(e.clientX, e.clientY, inf[0], inf[1]);
        return;
    }
    // 2) tile da topbar → info da métrica
    const stat = e.target.closest('.qo-stat');
    if (stat) {
        const id = [...stat.querySelectorAll('span[id]')].map(s => s.id).find(i => INFO_METRICAS[i]);
        const inf = id && INFO_METRICAS[id];
        if (inf) mostrarInfoPop(e.clientX, e.clientY, '📊 ' + inf[0], inf[1], 'abrir Decisão Agora', () => irParaPainel('decisionPanel'));
        return;
    }
    // 3) chip de fator → info do fator
    const chip = e.target.closest('.decision-chip');
    if (chip && chip.closest('#decisionChips')) {
        const nome = Object.keys(INFO_FATORES).find(n => chip.textContent.indexOf(n) === 0);
        if (nome) mostrarInfoPop(e.clientX, e.clientY, '🎯 ' + nome, INFO_FATORES[nome] +
            (chip.classList.contains('chip-off') ? '<br><em>Este fator está DESLIGADO — ligue nos controles p/ entrar na confluência.</em>' : ''));
        return;
    }
    // 4) elo do funil → info do elo
    const elo = e.target.closest('.funil-elo');
    if (elo) {
        const nome = Object.keys(INFO_ELOS).find(n => elo.textContent.includes(n));
        if (nome) mostrarInfoPop(e.clientX, e.clientY, '🔗 Elo: ' + nome,
            INFO_ELOS[nome] + '<br><em>Estado agora: ' + (elo.title || '—') + '</em>');
        return;
    }
}, true);

document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharInfoPop(); });
document.addEventListener('DOMContentLoaded', prepararIconesTitulos);
// ============================================================================
// BLOCO 28 — ZONAS S/R NO GRÁFICO + RÓTULOS DE ESTRUTURA + ANÁLISE MESTRE
// ============================================================================
// 1. Zonas de SUPORTE/RESISTÊNCIA (forte/média/fraca) desenhadas como FAIXAS
//    sombreadas sobre o gráfico (overlay posicionado por priceToCoordinate),
//    com rótulo "ZONA DE RESISTÊNCIA FORTE · 4 toques" como num gráfico
//    institucional. Força = nº de toques (3+ forte · 2 média · 1 fraca).
// 2. Rótulos HH/HL/LH/LL nos pivôs (marcadores da série de velas).
// 3. 🎓 ANÁLISE MESTRE: botão que gera a leitura completa do gráfico
//    (contexto, estrutura, tendências, zonas, pullback, liquidez, candles,
//    probabilidades, entradas/stops/alvos com RR, confluências, 3 cenários,
//    psicologia e notas) — calculada dos DADOS REAIS, nunca inventada.

let zonasSRAtivas = false, _zonasHooked = false;

// ---- Zonas por agrupamento de pivôs (toques = força) ----
function calcularZonasSR() {
    const piv = acharPivotsSR();
    const n = dados.length, close = dados[n - 1].close;
    const atrV = computed.atrValues[n - 1] || close * 0.002;
    const tol = atrV * 0.6;
    const cluster = pivos => {
        const zs = [];
        pivos.slice().sort((a, b) => a.price - b.price).forEach(p => {
            const z = zs.find(x => Math.abs(x.preco - p.price) <= tol);
            if (z) { z.preco = (z.preco * z.n + p.price) / (z.n + 1); z.n++; z.ultimoI = Math.max(z.ultimoI, p.i); }
            else zs.push({ preco: p.price, n: 1, ultimoI: p.i });
        });
        return zs;
    };
    const rot = z => z.n >= 3 ? 'FORTE' : z.n === 2 ? 'MÉDIA' : 'FRACA';
    const resist = cluster(piv.res).filter(z => z.preco > close).sort((a, b) => a.preco - b.preco)
        .slice(0, 2).map(z => ({ ...z, tipo: 'RESISTÊNCIA', forca: rot(z), meia: tol }));
    const supor = cluster(piv.sup).filter(z => z.preco < close).sort((a, b) => b.preco - a.preco)
        .slice(0, 2).map(z => ({ ...z, tipo: 'SUPORTE', forca: rot(z), meia: tol }));
    return { resist, supor, atrV, close };
}

// ---- Overlay: faixas sombreadas sobre o gráfico ----
// FLUIDEZ: pan/zoom dispara dezenas de eventos por segundo — coalesce em rAF
// (1 reposicionamento por frame, no máximo).
let _zonasRaf = false;
function reposicionarZonas() {
    if (_zonasRaf) return;
    _zonasRaf = true;
    requestAnimationFrame(() => { _zonasRaf = false; _reposicionarZonasAgora(); });
}
function _reposicionarZonasAgora() {
    const ov = document.getElementById('zonasOverlay');
    if (!ov || !dados || dados.length < 30 || !serieVelas || !computed || !computed.atrValues) return;
    const z = calcularZonasSR();
    const faixa = (zn, lado) => {
        const y1 = serieVelas.priceToCoordinate(zn.preco + zn.meia);
        const y2 = serieVelas.priceToCoordinate(zn.preco - zn.meia);
        if (y1 == null || y2 == null) return '';
        const forte = zn.forca === 'FORTE';
        const cor = lado === 'res'
            ? (forte ? 'rgba(239,68,68,0.13)' : 'rgba(239,68,68,0.05)')
            : (forte ? 'rgba(34,197,94,0.13)' : 'rgba(34,197,94,0.05)');
        const borda = lado === 'res' ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)';
        // rótulo CURTO, encostado na borda esquerda, num pill legível (não cobre as velas)
        const abrev = (lado === 'res' ? 'R' : 'S') + ' ' + (forte ? 'forte' : zn.forca === 'MÉDIA' ? 'média' : 'fraca');
        return `<div class="zona-faixa" style="top:${Math.min(y1, y2)}px;height:${Math.max(3, Math.abs(y2 - y1))}px;background:${cor};border-top:1px dashed ${borda};border-bottom:1px dashed ${borda};">` +
            `<span class="zona-rot" style="color:${borda}">${abrev} · ${zn.n}×</span></div>`;
    };
    ov.innerHTML = z.resist.map(x => faixa(x, 'res')).join('') + z.supor.map(x => faixa(x, 'sup')).join('');
}

function desenharZonasSR(on) {
    zonasSRAtivas = !!on;
    const cont = document.getElementById('chartPreco');
    let ov = document.getElementById('zonasOverlay');
    if (!on) { if (ov) ov.remove(); try { atualizarMarcadores(); } catch (e) { } return; }
    if (!ov && cont) { ov = document.createElement('div'); ov.id = 'zonasOverlay'; cont.appendChild(ov); }
    if (!_zonasHooked && typeof chartPreco !== 'undefined' && chartPreco) {
        _zonasHooked = true;
        chartPreco.timeScale().subscribeVisibleLogicalRangeChange(() => { if (zonasSRAtivas) reposicionarZonas(); });
        window.addEventListener('resize', () => { if (zonasSRAtivas) reposicionarZonas(); });
    }
    _reposicionarZonasAgora();   // ligar/desligar reflete na hora (sem esperar frame)
    try { atualizarMarcadores(); } catch (e) { }   // acrescenta HH/HL/LH/LL nos pivôs
}

// ---- Rótulos de estrutura (HH/HL/LH/LL) p/ os marcadores da série ----
function marcadoresEstrutura() {
    if (!dados || dados.length < 30) return [];
    const sw = estruturaSwings();
    let prevH = null, prevL = null;
    const out = [];
    sw.todos.forEach(p => {
        let r = null;
        if (p.tipo === 'H') { r = prevH == null ? null : p.price > prevH ? 'HH' : 'LH'; prevH = p.price; }
        else { r = prevL == null ? null : p.price > prevL ? 'HL' : 'LL'; prevL = p.price; }
        if (r && dados[p.i]) out.push({
            time: dados[p.i].time,
            position: p.tipo === 'H' ? 'aboveBar' : 'belowBar',
            color: p.tipo === 'H' ? (r === 'HH' ? '#22c55e' : '#ef4444') : (r === 'HL' ? '#22c55e' : '#ef4444'),
            shape: 'circle', size: 0, text: r
        });
    });
    return out;
}

// ============================================================================
// 🎓 ANÁLISE MESTRE — leitura completa calculada dos dados reais
// ============================================================================
function _amSec(titulo, corpo) { return `<section class="am-sec"><h3>${titulo}</h3>${corpo}</section>`; }
function _amFmt(v) { const c = dados[dados.length - 1].close; return (+v).toFixed(c < 10 ? 5 : 2); }

function gerarAnaliseMestre() {
    if (!dados || dados.length < 60 || !computed || !computed.atrValues) return '<p>Carregue dados primeiro (mín. 60 velas).</p>';
    const n = dados.length, last = n - 1, c = dados[last].close;
    const atrV = computed.atrValues[last] || c * 0.002;
    const lbl = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
    const sw = estruturaSwings();
    const ed = definirEstrutura(sw);
    const piv = acharPivotsSR();
    const micro = estruturaMicro(piv);
    const e2 = computed.ema200[last], e2a = computed.ema200[last - 21];
    const macro = (e2 != null && e2a != null) ? ((c > e2 && e2 > e2a) ? 1 : (c < e2 && e2 < e2a) ? -1 : 0) : 0;
    const lta = calcularLT(piv.sup, n, 'LTA', 0.35, atrV);
    const ltb = calcularLT(piv.res, n, 'LTB', 0.35, atrV);
    const z = calcularZonasSR();
    const rsi = computed.rsiValues[last];
    const atrR = computed.atrMedia[last] ? computed.atrValues[last] / computed.atrMedia[last] : 1;
    const pads = typeof padroesAtuais === 'function' ? padroesAtuais() : [];
    const pat = padraoVela(last);
    const cl = confLive, en = cl.enabled || 1;
    const dirDom = cl.long >= cl.short ? 1 : -1;
    const conf = Math.round(Math.max(cl.long, cl.short) / en * 100);
    let fn = null; try { fn = avaliarFunil(false); } catch (e) { }
    const rotD = d => d === 1 ? 'ALTA 📈' : d === -1 ? 'BAIXA 📉' : 'NEUTRA ↔';

    // pullback: retração da última perna
    const ultH = sw.todos.filter(p => p.tipo === 'H').slice(-1)[0];
    const ultL = sw.todos.filter(p => p.tipo === 'L').slice(-1)[0];
    let corr = null;
    if (ultH && ultL && ultH.price !== ultL.price) {
        corr = ed.dir === 1 ? (ultH.price - c) / (ultH.price - ultL.price) : (c - ultL.price) / (ultH.price - ultL.price);
        corr = Math.max(0, Math.min(1, corr));
    }
    const pull = corr == null ? '—' : corr < 0.15 ? 'sem retração (esticado)' : corr <= 0.38 ? 'MICRO pullback' : corr <= 0.62 ? 'MACRO pullback (saudável)' : 'correção PROFUNDA (estrutura em risco)';

    // entradas/stops/alvos p/ o lado da estrutura (ou da confluência, se neutra)
    const lado = ed.dir !== 0 ? ed.dir : dirDom;
    const zF = lado === 1 ? z.supor[0] : z.resist[0];        // zona a favor (defende a entrada)
    const zC1 = lado === 1 ? z.resist[0] : z.supor[0];       // 1º obstáculo = TP1
    const zC2 = lado === 1 ? z.resist[1] : z.supor[1];       // 2º = TP2
    let plano = '<p><em>Sem zonas suficientes p/ montar plano — espere o gráfico formar mais pivôs.</em></p>';
    if (zF && zC1) {
        const entrada = zF.preco + (lado === 1 ? zF.meia : -zF.meia);
        const stop = zF.preco - lado * (zF.meia + atrV * 0.5);
        const tp1 = zC1.preco - lado * zC1.meia;
        const tp2 = zC2 ? zC2.preco - lado * zC2.meia : null;
        const risco = Math.abs(entrada - stop);
        const rr1 = risco > 0 ? Math.abs(tp1 - entrada) / risco : 0;
        const rr2 = tp2 && risco > 0 ? Math.abs(tp2 - entrada) / risco : null;
        plano =
            `<div class="kv"><span>🎯 Entrada conservadora (teste da zona ${zF.forca.toLowerCase()})</span><b>${_amFmt(entrada)}</b></div>` +
            (lta && lado === 1 ? `<div class="kv"><span>🎯 Entrada moderada (teste da LTA · ${lta.toques} toques)</span><b>${_amFmt(lta.atual)}</b></div>` : '') +
            (ltb && lado === -1 ? `<div class="kv"><span>🎯 Entrada moderada (teste da LTB · ${ltb.toques} toques)</span><b>${_amFmt(ltb.atual)}</b></div>` : '') +
            `<div class="kv"><span>🎯 Entrada agressiva (a mercado, sem esperar o teste)</span><b>${_amFmt(c)} — só com vela de confirmação</b></div>` +
            `<div class="kv"><span>🛑 Stop técnico (além da zona + 0.5 ATR)</span><b>${_amFmt(stop)}</b></div>` +
            `<div class="kv"><span>🏁 TP1 (zona oposta mais próxima)</span><b>${_amFmt(tp1)} · RR 1:${rr1.toFixed(1)}</b></div>` +
            (tp2 ? `<div class="kv"><span>🏁 TP2 (segunda zona)</span><b>${_amFmt(tp2)} · RR 1:${rr2.toFixed(1)}</b></div>` : '') +
            `<p class="am-nota">💡 Parcial no TP1, resto corre pro TP2 com stop no 0×0. RR abaixo de 1:1.5 no TP1 = espere preço melhor. Em binárias o "RR" vem do payout — aqui os alvos servem de referência de força do movimento.</p>`;
    }

    // liquidez: pools = zonas com 2+ toques (equal highs/lows)
    const pools = [...z.resist, ...z.supor].filter(x => x.n >= 2);
    const liquidez = pools.length
        ? pools.map(x => `<div class="kv"><span>${x.tipo === 'RESISTÊNCIA' ? 'Equal highs (stops de venda acima)' : 'Equal lows (stops de compra abaixo)'}</span><b>${_amFmt(x.preco)} · ${x.n} toques</b></div>`).join('')
        : '<p>Sem pools claros (2+ toques no mesmo nível) no recorte atual.</p>';

    // notas 0–10 (heurísticas transparentes)
    const notas = {
        'Tendência': Math.round(conf / 10),
        'Estrutura': ed.dir !== 0 ? (/Virando/.test(ed.nome) ? 6 : 8) : /Compressão|Expansão/.test(ed.nome) ? 4 : 3,
        'Liquidez': Math.min(10, pools.length * 3),
        'Momentum': rsi != null ? Math.round(Math.min(10, Math.abs(rsi - 50) / 3)) : 5,
        'Pullback': corr == null ? 5 : corr <= 0.62 && corr >= 0.2 ? 8 : corr < 0.2 ? 4 : 3,
        'Confluência': fn ? Math.round(fn.okCount / 6 * 10) : 5,
        'Risco (10=controlado)': atrR > 1.6 ? 4 : atrR < 0.7 ? 5 : 8,
        'Prob. compra': Math.round(cl.long / en * 100) / 10,
        'Prob. venda': Math.round(cl.short / en * 100) / 10
    };
    notas['Qualidade geral'] = Math.round(Object.values(notas).reduce((s, v) => s + v, 0) / Object.keys(notas).length);

    const confls = [
        ['Tendência (micro=macro)', micro !== 0 && micro === macro],
        ['LTA válida (3+ toques)', !!(lta && lta.toques >= 3)],
        ['LTB válida (3+ toques)', !!(ltb && ltb.toques >= 3)],
        ['Pullback saudável', corr != null && corr >= 0.2 && corr <= 0.62],
        ['Estrutura definida', ed.dir !== 0],
        ['Zona forte por perto (≤1 ATR)', [...z.resist, ...z.supor].some(x => x.forca === 'FORTE' && Math.abs(x.preco - c) <= atrV)],
        ['Vela de confirmação', pat.up || pat.down],
        ['Padrão de preço presente', pads.length > 0],
        ['Funil ≥4/6', !!(fn && fn.okCount >= 4)]
    ];

    return [
        _amSec('1 · Contexto geral', `<p><strong>${lbl} · M${tfMinutes()}</strong> · Tendência principal (EMA200/21 barras): <strong>${rotD(macro)}</strong> · Secundária (estrutura de swings): <strong>${ed.nome}</strong> · Momentum: RSI ${rsi != null ? rsi.toFixed(0) : '—'} ${rsi > 55 ? '(comprador)' : rsi < 45 ? '(vendedor)' : '(neutro)'} · Volatilidade: ATR ${atrR.toFixed(2)}× a média ${atrR > 1.3 ? '— EXPANSÃO' : atrR < 0.75 ? '— consolidação' : '— normal'} · ${pull === '—' ? '' : 'Correção: ' + (corr * 100).toFixed(0) + '% (' + pull + ')'}</p><p class="am-nota">Fato observável: sequência de swings ${sw.rotulos.join('·') || '—'}. A conclusão de tendência vem daí + posição vs EMA200 — não de opinião.</p>`),
        _amSec('2 · Estrutura de mercado', `<div class="kv"><span>Últimos swings</span><b>${sw.rotulos.join(' · ') || '—'}</b></div><div class="kv"><span>Estrutura</span><b>${ed.nome}</b></div><div class="kv"><span>Micro (TF operado)</span><b>${rotD(micro)}</b></div><div class="kv"><span>Macro (EMA200)</span><b>${rotD(macro)}</b></div><div class="kv"><span>CHoCH</span><b>${/Virando/.test(ed.nome) ? '⚠ EM CURSO — ' + ed.nome : detectarCHoCH(piv, c) !== 0 ? 'sinalizado na última leitura' : 'não'}</b></div><p class="am-nota">HH+HL = compradores pagando mais caro e defendendo fundos mais altos. A QUEBRA do último fundo ascendente (CHoCH) é o primeiro aviso de que a mão forte mudou de lado.</p>`),
        _amSec('3 · Linhas de tendência', (lta ? `<div class="kv"><span>LTA (fundos ascendentes)</span><b>${lta.toques} toques · agora em ${_amFmt(lta.atual)} ${lta.toques >= 3 ? '— VÁLIDA' : '— só referência (2 toques)'}</b></div>` : '<div class="kv"><span>LTA</span><b>não há fundos ascendentes ligáveis</b></div>') + (ltb ? `<div class="kv"><span>LTB (topos descendentes)</span><b>${ltb.toques} toques · agora em ${_amFmt(ltb.atual)} ${ltb.toques >= 3 ? '— VÁLIDA' : '— só referência'}</b></div>` : '<div class="kv"><span>LTB</span><b>não há topos descendentes ligáveis</b></div>') + `<p class="am-nota">3+ toques validam a linha; ela PERDE validade com fechamento além dela + novo swing contra. Use como zona dinâmica de teste, nunca como gatilho sozinha.</p>`),
        _amSec('4 · Zonas de suporte e resistência', [...z.resist.map(x => `<div class="kv kv-bad"><span>ZONA DE RESISTÊNCIA ${x.forca}</span><b>${_amFmt(x.preco)} · ${x.n} toque${x.n > 1 ? 's' : ''}</b></div>`), ...z.supor.map(x => `<div class="kv kv-good"><span>ZONA DE SUPORTE ${x.forca}</span><b>${_amFmt(x.preco)} · ${x.n} toque${x.n > 1 ? 's' : ''}</b></div>`)].join('') + `<p class="am-nota">Força = nº de toques (3+ forte). Zona forte testada MUITAS vezes em pouco tempo enfraquece (liquidez consumida); zona forte + LT + fib no mesmo lugar = confluência institucional. Ligue 🟩 p/ ver as faixas no gráfico.</p>`),
        _amSec('5 · Pullback', `<div class="kv"><span>Retração da última perna</span><b>${corr == null ? '—' : (corr * 100).toFixed(0) + '%'}</b></div><div class="kv"><span>Classificação</span><b>${pull}</b></div><p class="am-nota">MICRO (≤38%): entrada de continuação curta. MACRO (38–62%): a entrada com mais segurança — o preço volta em zona relevante/LTA. &gt;62%: a "correção" já ameaça a estrutura — espere.</p>`),
        _amSec('6 · Liquidez', liquidez + `<p class="am-nota">Institucional executa ONDE HÁ STOPS: acima de equal highs e abaixo de equal lows. Sweep (mecha que varre o nível e volta) = coleta de liquidez, não rompimento — a armadilha clássica do varejo.</p>`),
        _amSec('7 · Candles agora', `<div class="kv"><span>Última vela</span><b>${pat.up ? 'reversão de ALTA (engolfo/martelo)' : pat.down ? 'reversão de BAIXA' : 'sem padrão de reversão'}</b></div>` + (pads.length ? pads.map(p => `<div class="kv"><span>${p.nome}</span><b>${p.dica}</b></div>`).join('') : '<div class="kv"><span>Padrões</span><b>nenhum no momento</b></div>')),
        _amSec('8 · Probabilidades (dados, não opinião)', `<div class="kv"><span>Confluência ao vivo</span><b>CALL ${cl.long}/${en} · PUT ${cl.short}/${en} (${conf}% p/ ${dirDom === 1 ? 'compra' : 'venda'})</b></div><div class="kv"><span>Funil de qualidade</span><b>${fn ? fn.okCount + '/6 elos' : '—'}</b></div><p class="am-nota">⚠ Probabilidade real só existe com amostra: veja o Registro (placar verificado) e a curva de calibração antes de confiar em %.</p>`),
        _amSec('9 · Plano de trade (lado da estrutura: ' + rotD(lado) + ')', plano),
        _amSec('10 · Confluências', confls.map(([nome, ok]) => `<div class="kv"><span>${ok ? '✔' : '✖'} ${nome}</span><b>${ok ? 'presente' : '—'}</b></div>`).join('') + `<p class="am-nota">${confls.filter(x => x[1]).length}/${confls.length} confluências — quanto mais, maior a probabilidade. Menos de 5: espere o gráfico montar o cenário.</p>`),
        _amSec('11 · Cenários', `<p><strong>📈 ALTA:</strong> preço testa ${z.supor[0] ? 'a zona de suporte ' + z.supor[0].forca.toLowerCase() + ' (' + _amFmt(z.supor[0].preco) + ')' : 'um suporte'}${lta ? ' ou a LTA' : ''} e imprime vela de reversão de alta → entrada no fechamento da confirmação, stop além da zona, alvo na resistência ${z.resist[0] ? '(' + _amFmt(z.resist[0].preco) + ')' : ''}.</p><p><strong>📉 BAIXA:</strong> perda da zona de suporte com fechamento + CHoCH (quebra do último HL) → entrada no reteste da zona perdida (que vira resistência), stop acima dela, alvo no próximo suporte.</p><p><strong>↔ LATERAL:</strong> ${/Compressão/.test(ed.nome) ? 'JÁ é o cenário atual (LH+HL) — ' : ''}opere só os extremos das zonas com confirmação, evite o meio do range, e espere o rompimento COM fechamento + reteste p/ mudar de estratégia.</p>`),
        _amSec('12 · Psicologia', `<p>A maioria compra rompimento esticado (sem pullback) e coloca stop óbvio ${pools.length ? 'nos pools listados acima' : 'no último swing'} — exatamente onde o institucional busca liquidez antes do movimento real. O profissional faz o contrário: ESPERA o teste da zona, exige a vela de confirmação e entra com o stop protegido pela estrutura, não pela dor.</p>`),
        _amSec('13 · Resumo — notas 0–10', '<table class="am-tabela">' + Object.keys(notas).map(k => `<tr><td>${k}</td><td><b>${notas[k]}</b></td><td><span class="am-barra"><span style="width:${Math.min(10, notas[k]) * 10}%"></span></span></td></tr>`).join('') + '</table>' + `<p class="am-nota">⚠ FERRAMENTA DE ESTUDO. Notas são heurísticas transparentes sobre o recorte atual — não previsão. Fatos = swings/zonas/toques medidos; hipóteses = cenários (cada um diz o que o confirmaria).</p>`)
    ].join('');
}

function abrirAnaliseMestre() {
    const m = document.getElementById('analiseModal');
    if (!m) return;
    document.getElementById('analiseBody').innerHTML = gerarAnaliseMestre();
    m.style.display = 'flex';
}

// ---- Ligações ----
document.addEventListener('DOMContentLoaded', function () {
    const tg = document.getElementById('zonasAtivo');
    if (tg) tg.addEventListener('change', function () {
        desenharZonasSR(this.checked);
        showToast(this.checked ? '🟩 Zonas de S/R desenhadas — força = nº de toques' : 'Zonas removidas', 'info');
    });
    // Botões de 1 clique no cabeçalho do gráfico (espelham os toggles do painel)
    const espelho = (btnId, chkId) => {
        const b = document.getElementById(btnId), chk = document.getElementById(chkId);
        if (!b || !chk) return;
        const pintar = () => b.classList.toggle('is-active', chk.checked);
        b.addEventListener('click', () => { chk.checked = !chk.checked; chk.dispatchEvent(new Event('change')); pintar(); });
        chk.addEventListener('change', pintar);
        pintar();
    };
    espelho('btnZonasChart', 'zonasAtivo');
    espelho('btnNiveisChart', 'niveisAtivo');
    // Estado persistido (BOOT_IDS): reaplica as zonas assim que os dados chegarem
    if (tg && tg.checked) {
        const t = setInterval(() => {
            if (dados && dados.length >= 30 && computed && computed.atrValues) { clearInterval(t); desenharZonasSR(true); }
        }, 800);
        setTimeout(() => clearInterval(t), 60000);
    }
    const b = document.getElementById('btnAnalise');
    if (b) b.addEventListener('click', abrirAnaliseMestre);
    const bT = document.getElementById('btnAnaliseTop');   // atalho na barra superior
    if (bT) bT.addEventListener('click', abrirAnaliseMestre);
    // ⛶: alterna a altura do gráfico principal (padrão 1200px ↔ compacto 500px)
    const bM = document.getElementById('btnChartMax');
    if (bM) {
        const pintarM = () => {
            const grande = localStorage.getItem('chartAlto') !== '0';
            bM.classList.toggle('is-active', grande);
            bM.textContent = grande ? '⛶ Reduzir gráfico' : '⛶ Ampliar gráfico';
        };
        bM.addEventListener('click', () => {
            localStorage.setItem('chartAlto', localStorage.getItem('chartAlto') === '0' ? '1' : '0');
            pintarM();
            window.dispatchEvent(new Event('resize'));           // reaplica altura/largura
            if (zonasSRAtivas) requestAnimationFrame(reposicionarZonas);
        });
        pintarM();
    }
    const x = document.getElementById('analiseFechar');
    if (x) x.addEventListener('click', () => document.getElementById('analiseModal').style.display = 'none');
    const m = document.getElementById('analiseModal');
    if (m) m.addEventListener('click', e => { if (e.target.id === 'analiseModal') m.style.display = 'none'; });
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const m = document.getElementById('analiseModal'); if (m) m.style.display = 'none'; }
});
// ============================================================================
// BLOCO 29 — TROCA RÁPIDA NO GRÁFICO (moeda + timeframe direto no topo)
// ============================================================================
// Seletor de moeda e botões de timeframe no cabeçalho do gráfico. Não duplicam
// lógica: escrevem em #symbol/#parPopular/#timeframe e disparam o MESMO evento
// 'change' que a sidebar já trata (recarrega + reconecta + sincroniza o widget).

// Cripto mais negociadas (as demais continuam no campo da sidebar/scanner)
const CHART_CRIPTO = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT'];

function montarSeletorMoeda() {
    const sel = document.getElementById('chartSym');
    if (!sel) return;
    const atual = symbolAtual();
    const forex = Object.keys(PARES_YAHOO);
    // se o par aberto não está nas listas conhecidas, entra como 1ª opção
    const extra = (!CHART_CRIPTO.includes(atual) && !forex.includes(atual)) ? [atual] : [];
    const opt = (v, txt) => `<option value="${v}"${v === atual ? ' selected' : ''}>${txt}</option>`;
    sel.innerHTML =
        (extra.length ? `<optgroup label="Atual">${extra.map(s => opt(s, s)).join('')}</optgroup>` : '') +
        `<optgroup label="📊 Índice">${opt('CRYPTOIDX', 'Crypto IDX (proxy Binomo)')}</optgroup>` +
        `<optgroup label="₿ Cripto (Binance)">${CHART_CRIPTO.map(s => opt(s, s.replace('USDT', '/USDT'))).join('')}</optgroup>` +
        `<optgroup label="💱 Forex / Índices / Ouro">${forex.map(s => opt(s, PARES_YAHOO[s].label)).join('')}</optgroup>`;
}

function pintarTfAtivo() {
    const tf = String(tfMinutes());
    document.querySelectorAll('#chartTf button').forEach(b => b.classList.toggle('is-active', b.dataset.tf === tf));
}

function sincronizarQuickbar() {
    const sel = document.getElementById('chartSym');
    if (sel) {
        // reflete o par atual (pode ter mudado pela sidebar/scanner/IA)
        if (![...sel.options].some(o => o.value === symbolAtual())) montarSeletorMoeda();
        else sel.value = symbolAtual();
    }
    pintarTfAtivo();
}

document.addEventListener('DOMContentLoaded', function () {
    montarSeletorMoeda();
    pintarTfAtivo();

    const sel = document.getElementById('chartSym');
    if (sel) sel.addEventListener('change', function () {
        const v = this.value;
        const fonteEl = document.getElementById('fonte');
        if (PARES_YAHOO[v]) {
            // forex/índice/ouro: escolhe a fonte que REALMENTE funciona para o par.
            // Sem chave própria do Twelve Data (vazia/"demo", que só serve EUR/USD),
            // vai direto pro Yahoo — keyless e cobre todos os pares — evitando o
            // gráfico em branco durante o fallback lento.
            const key = (document.getElementById('tdKey').value || '').trim().toLowerCase();
            const temChaveReal = key && key !== 'demo';
            if (!['twelvedata', 'yahoo', 'ambos', 'ambos3'].includes(fonteEl.value)) {
                fonteEl.value = temChaveReal ? 'twelvedata' : 'yahoo';
            } else if (fonteEl.value === 'twelvedata' && !temChaveReal) {
                fonteEl.value = 'yahoo';   // corrige demo → keyless
            }
        } else if (v === 'CRYPTOIDX') {
            fonteEl.value = 'binance';   // o índice é uma cesta Binance normalizada
        } else {
            // cripto: garante fonte que serve cripto (nunca fica preso no forex/sim)
            if (['yahoo', 'twelvedata', 'sim'].includes(fonteEl.value)) fonteEl.value = 'binance';
        }
        const symEl = document.getElementById('symbol');
        symEl.value = v;
        montarWidgetTV(); renderNoticias();
        carregar();   // recarrega já com a fonte certa (não depende do listener antigo)
    });

    document.getElementById('chartTf').addEventListener('click', function (e) {
        const b = e.target.closest('button[data-tf]');
        if (!b) return;
        const tfEl = document.getElementById('timeframe');
        if (tfEl.value === b.dataset.tf) return;
        tfEl.value = b.dataset.tf;
        pintarTfAtivo();
        tfEl.dispatchEvent(new Event('change'));
    });

    // mantém a barra em sincronia quando a troca vem de OUTRO lugar
    ['symbol', 'timeframe', 'fonte', 'parPopular'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => setTimeout(sincronizarQuickbar, 0));
    });
});
// ============================================================================
// BLOCO 30 — FERRAMENTAS DE EXECUÇÃO (countdown da vela · alertas de preço · ticker)
// ============================================================================
// 1. ⏳ COUNTDOWN: quanto falta pra vela atual fechar — em binárias, entrar no
//    começo da vela muda o resultado; o timer fica na barra do gráfico.
// 2. 🔔 ALERTAS DE PREÇO: arma o modo, clica no gráfico e nasce uma linha
//    tracejada âmbar; quando o preço cruza, toca som + notifica + toast e o
//    alerta se consome (one-shot). Persistidos por símbolo (localStorage).
// 3. 💲 TICKER: preço atual + variação % da janela carregada, ao vivo.

let alertasPreco = [];
try { alertasPreco = JSON.parse(localStorage.getItem('alertasPreco') || '[]'); } catch (e) { }
let _alertaLinhas = [];
let _armandoAlerta = false, _alertaClickHooked = false, _alertaPrevClose = null;

function _precoTxt(v) {
    const c = dados && dados.length ? dados[dados.length - 1].close : v;
    return (+v).toFixed(c < 10 ? 5 : 2);
}
function _salvarAlertas() { localStorage.setItem('alertasPreco', JSON.stringify(alertasPreco)); }

// ---- Linhas + chips dos alertas do símbolo aberto ----
function alertasRedesenhar() {
    _alertaLinhas.forEach(l => { try { serieVelas.removePriceLine(l); } catch (e) { } });
    _alertaLinhas = [];
    if (serieVelas) {
        alertasPreco.filter(a => a.sym === symbolAtual()).forEach(a => {
            _alertaLinhas.push(serieVelas.createPriceLine({
                price: a.price, color: '#F59E0B', lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true, title: '🔔 alerta'
            }));
        });
    }
    const box = document.getElementById('alertaChips');
    if (box) {
        const meus = alertasPreco.filter(a => a.sym === symbolAtual());
        box.innerHTML = meus.map(a =>
            `<span class="alerta-chip">🔔 ${_precoTxt(a.price)}<button type="button" data-preco="${a.price}" title="remover alerta">✕</button></span>`).join('');
    }
}

function criarAlertaPreco(price) {
    alertasPreco.push({ sym: symbolAtual(), price: +price });
    _salvarAlertas();
    alertasRedesenhar();
    showToast('🔔 Alerta criado em ' + _precoTxt(price) + ' — som + notificação quando o preço cruzar', 'ok');
}

function removerAlertaPreco(price) {
    alertasPreco = alertasPreco.filter(a => !(a.sym === symbolAtual() && Math.abs(a.price - price) < 1e-9));
    _salvarAlertas();
    alertasRedesenhar();
}

// Chamado a cada tick (03): dispara e consome alertas cruzados
function alertasVerificar() {
    if (!dados || !dados.length) return;
    const c = dados[dados.length - 1].close;
    if (_alertaPrevClose == null) { _alertaPrevClose = c; return; }
    const lbl = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
    let disparou = false;
    alertasPreco = alertasPreco.filter(a => {
        if (a.sym !== symbolAtual()) return true;
        const cruzou = (_alertaPrevClose <= a.price && c >= a.price) || (_alertaPrevClose >= a.price && c <= a.price);
        if (!cruzou) return true;
        disparou = true;
        showToast(`🔔 ALERTA: ${lbl} cruzou ${_precoTxt(a.price)} (agora ${_precoTxt(c)})`, 'ok');
        try { tocarSom(c >= a.price ? 1 : -1); } catch (e) { }
        try { notificar(`🔔 Alerta de preço — ${lbl}`, `cruzou ${_precoTxt(a.price)} · agora ${_precoTxt(c)}`); } catch (e) { }
        try { if (typeof registrarAlertaDisparado === 'function') registrarAlertaDisparado(a.sym, a.price, c); } catch (e) { }
        return false;   // one-shot: consome
    });
    if (disparou) { _salvarAlertas(); alertasRedesenhar(); }
    _alertaPrevClose = c;
}

// ---- Armar alerta: próximo clique no gráfico vira o nível ----
function armarAlertaPreco() {
    const btn = document.getElementById('btnAlerta');
    if (!chartPreco || !serieVelas) { showToast('Carregue o gráfico primeiro.', 'err'); return; }
    if (!_alertaClickHooked) {
        _alertaClickHooked = true;
        chartPreco.subscribeClick(p => {
            if (!_armandoAlerta || !p.point) return;
            const price = serieVelas.coordinateToPrice(p.point.y);
            if (price == null || !isFinite(price)) return;
            _armandoAlerta = false;
            if (btn) btn.classList.remove('is-active');
            criarAlertaPreco(+price);
        });
    }
    _armandoAlerta = !_armandoAlerta;
    if (btn) btn.classList.toggle('is-active', _armandoAlerta);
    showToast(_armandoAlerta ? '🎯 Clique no gráfico, no preço onde quer o alerta' : 'Modo alerta cancelado', 'info');
}

// ---- ⏳ Countdown da vela (função pura + timer de 1s) ----
function contagemVela(lastTime, tfMin, agoraSec) { return (lastTime + tfMin * 60) - agoraSec; }

function _fmtSeg(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

function atualizarExecucaoUI() {
    const timer = document.getElementById('velaTimer');
    const tp = document.getElementById('tickPreco');
    const tv = document.getElementById('tickVar');
    if (!dados || !dados.length) { if (timer) timer.textContent = ''; return; }
    const last = dados[dados.length - 1];
    // countdown: só faz sentido com vela "de agora" (feed ao vivo)
    if (timer) {
        const s = contagemVela(last.time, tfMinutes(), Math.floor(Date.now() / 1000));
        if (s > 0 && s <= tfMinutes() * 60) {
            timer.textContent = '⏳ ' + _fmtSeg(s);
            timer.classList.toggle('vela-urgente', s <= 10);
            timer.title = 'a vela ' + (typeof rotTf === 'function' ? rotTf(tfMinutes()) : '') + ' fecha em ' + _fmtSeg(s);
        } else { timer.textContent = ''; timer.classList.remove('vela-urgente'); }
    }
    // ticker: preço + variação da janela carregada
    if (tp && tv) {
        const c = last.close, base = dados[0].close;
        tp.textContent = _precoTxt(c);
        if (base) {
            const v = (c / base - 1) * 100;
            tv.textContent = (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
            tv.className = 'tick-var ' + (v >= 0 ? 'tick-up' : 'tick-down');
            tv.title = 'variação na janela carregada (' + dados.length + ' velas)';
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const b = document.getElementById('btnAlerta');
    if (b) b.addEventListener('click', armarAlertaPreco);
    const chips = document.getElementById('alertaChips');
    if (chips) chips.addEventListener('click', e => {
        const x = e.target.closest('button[data-preco]');
        if (x) removerAlertaPreco(+x.dataset.preco);
    });
    setInterval(() => { if (!document.hidden) atualizarExecucaoUI(); }, 1000);   // pausa com aba oculta
});
// ============================================================================
// BLOCO 31 — PLACAR DO DIA · SESSÕES NO GRÁFICO · MODO FOCO
// ============================================================================
// 1. 📅 PLACAR DO DIA: tile na topbar com o resultado REAL de hoje
//    (WIN/LOSS verificados + sequência atual) — o dia na cara do operador.
// 2. 🕐 SESSÕES NO GRÁFICO: faixas verticais suaves pintando Londres, NY e a
//    sobreposição (o horário de mais volume) atrás das velas.
// 3. 🖥 MODO FOCO: esconde sidebar/rail/dock — só decisão + gráfico (tecla F).

// ---- 📅 Placar do dia (função pura + tile) ----
function placarDoDia(regs, agoraSec) {
    const d0 = new Date((agoraSec || Math.floor(Date.now() / 1000)) * 1000);
    d0.setHours(0, 0, 0, 0);
    const ini = Math.floor(d0.getTime() / 1000);
    const hoje = (regs || []).filter(r => r.t >= ini);
    const res = hoje.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS');
    const w = res.filter(r => r.resultado === 'WIN').length;
    const l = res.length - w;
    // sequência atual (do fim pro começo): +N vitórias ou -N derrotas seguidas
    let seq = 0;
    for (let i = res.length - 1; i >= 0; i--) {
        const win = res[i].resultado === 'WIN';
        if (seq === 0) seq = win ? 1 : -1;
        else if (seq > 0 && win) seq++;
        else if (seq < 0 && !win) seq--;
        else break;
    }
    return { total: hoje.length, w, l, wr: res.length ? w / res.length : null, seq };
}

function renderPlacarDia() {
    const el = document.getElementById('qoHoje');
    if (!el) return;
    const p = placarDoDia(typeof registro !== 'undefined' ? registro : []);
    if (!p.total) { el.textContent = '—'; el.className = ''; el.title = 'sem entradas registradas hoje'; return; }
    const seqTxt = p.seq > 1 ? ` · 🔥${p.seq}` : p.seq < -1 ? ` · ❄${-p.seq}` : '';
    el.textContent = `${p.w}W · ${p.l}L${p.wr != null ? ' (' + Math.round(p.wr * 100) + '%)' : ''}${seqTxt}`;
    el.className = p.wr == null ? '' : p.wr >= 0.55 ? 'qo-good' : p.wr < 0.5 ? 'qo-bad' : '';
    el.title = `hoje: ${p.total} entrada(s) · ${p.w} WIN · ${p.l} LOSS` + (p.seq > 1 ? ` · ${p.seq} vitórias seguidas` : p.seq < -1 ? ` · ${-p.seq} derrotas seguidas — respire` : '');
}
setInterval(() => { if (!document.hidden) renderPlacarDia(); }, 15000);   // pausa com aba oculta

// ---- 🕐 Sessões pintadas no gráfico ----
const SESSAO_COR = {
    'Londres': 'rgba(59, 130, 246, 0.05)',
    'Nova York': 'rgba(139, 92, 246, 0.05)',
    'Londres+NY': 'rgba(34, 211, 238, 0.09)'   // sobreposição = mais volume
};
let sessoesOn = localStorage.getItem('sessoesOn') === '1';
let _sessRaf = false;

function desenharSessoes() {
    if (_sessRaf) return;
    _sessRaf = true;
    requestAnimationFrame(() => { _sessRaf = false; _desenharSessoesAgora(); });
}
function _desenharSessoesAgora() {
    const cont = document.getElementById('chartPreco');
    let ov = document.getElementById('sessoesOverlay');
    if (!sessoesOn) { if (ov) ov.remove(); return; }
    if (!cont || !dados || dados.length < 5 || !chartPreco) return;
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'sessoesOverlay';
        cont.insertBefore(ov, cont.firstChild);   // atrás do overlay de zonas
    }
    const ts = chartPreco.timeScale();
    // agrupa velas contíguas da mesma sessão em retângulos verticais
    const faixas = [];
    let atual = null;
    for (let i = 0; i < dados.length; i++) {
        const s = sessaoDe(dados[i].time);
        const x = ts.timeToCoordinate(dados[i].time);
        if (x == null) { atual = null; continue; }   // fora da área visível
        if (atual && atual.s === s) atual.x2 = x;
        else { atual = { s, x1: x, x2: x }; faixas.push(atual); }
    }
    ov.innerHTML = faixas.filter(f => SESSAO_COR[f.s] && f.x2 > f.x1).map(f =>
        `<div class="sess-faixa" style="left:${Math.round(f.x1)}px;width:${Math.round(f.x2 - f.x1)}px;background:${SESSAO_COR[f.s]};" title="${f.s}"></div>`
    ).join('');
}

function alternarSessoes(on) {
    sessoesOn = on == null ? !sessoesOn : !!on;
    localStorage.setItem('sessoesOn', sessoesOn ? '1' : '0');
    const b = document.getElementById('btnSessoes');
    if (b) b.classList.toggle('is-active', sessoesOn);
    _desenharSessoesAgora();
    if (!sessoesOn) { const ov = document.getElementById('sessoesOverlay'); if (ov) ov.remove(); }
}

// ---- 🖥 Modo foco: só decisão + gráfico (tecla F) ----
function alternarFoco(on) {
    const ativo = on == null ? !document.body.classList.contains('modo-foco') : !!on;
    document.body.classList.toggle('modo-foco', ativo);
    const b = document.getElementById('btnFoco');
    if (b) b.classList.toggle('is-active', ativo);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));   // gráfico ocupa a largura nova
    if (ativo) showToast('🖥 Modo foco — F ou Esc para sair', 'info');
}

document.addEventListener('DOMContentLoaded', function () {
    renderPlacarDia();
    const bS = document.getElementById('btnSessoes');
    if (bS) { bS.addEventListener('click', () => alternarSessoes()); bS.classList.toggle('is-active', sessoesOn); }
    const bF = document.getElementById('btnFoco');
    if (bF) bF.addEventListener('click', () => alternarFoco());
    // sessões acompanham pan/zoom e recargas
    const arma = setInterval(() => {
        if (typeof chartPreco !== 'undefined' && chartPreco) {
            clearInterval(arma);
            chartPreco.timeScale().subscribeVisibleLogicalRangeChange(() => { if (sessoesOn) desenharSessoes(); });
            if (sessoesOn) _desenharSessoesAgora();
        }
    }, 800);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('modo-foco')) { alternarFoco(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key.toLowerCase() === 'f') alternarFoco();
});
// ============================================================================
// BLOCO 32 — EXPORTAR GRÁFICO · HISTÓRICO DE ALERTAS · COMPARAR ATIVOS
// ============================================================================
// 1. 📷 EXPORTAR: baixa o gráfico atual como PNG (takeScreenshot da LWC) — pro
//    diário, pra compartilhar o setup, pro relatório.
// 2. 📜 ALERTAS DISPARADOS: histórico dos alertas de preço que já bateram
//    (par · preço · horário), persistido — memória do que aconteceu.
// 3. ⚖ COMPARAR: puxa um segundo ativo e mostra a FORÇA RELATIVA na janela
//    (quem subiu mais % — útil pra escolher o par mais forte do momento).

// ---- 📷 Exportar o gráfico como imagem ----
function exportarGraficoPNG() {
    if (!chartPreco || typeof chartPreco.takeScreenshot !== 'function') { showToast('Gráfico não está pronto.', 'err'); return null; }
    try {
        const canvas = chartPreco.takeScreenshot();
        const sym = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label.replace(/[^\w]/g, '') : symbolAtual();
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `quantops-${sym}-M${tfMinutes()}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        showToast('📷 Gráfico salvo como PNG', 'ok');
        return url;
    } catch (e) { showToast('Falha ao exportar: ' + e.message, 'err'); return null; }
}

// ---- 📜 Histórico de alertas disparados ----
let alertasHist = [];
try { alertasHist = JSON.parse(localStorage.getItem('alertasHist') || '[]'); } catch (e) { }

function registrarAlertaDisparado(sym, price, precoAtual) {
    alertasHist.unshift({ t: Math.floor(Date.now() / 1000), sym, price, close: precoAtual });
    if (alertasHist.length > 100) alertasHist = alertasHist.slice(0, 100);
    localStorage.setItem('alertasHist', JSON.stringify(alertasHist));
    const b = document.getElementById('btnAlertaHist');
    if (b) { const n = alertasHist.length; b.textContent = '📜 Histórico de alertas' + (n ? ' (' + n + ')' : ''); }
}

function abrirHistAlertas() {
    const m = document.getElementById('histAlertaModal');
    const body = document.getElementById('histAlertaBody');
    if (!m || !body) return;
    const fmtP = (v, sym) => (+v).toFixed((PARES_YAHOO[sym] ? 1 : (v < 10 ? 5 : 2)));
    body.innerHTML = alertasHist.length ? alertasHist.map(a => {
        const lbl = PARES_YAHOO[a.sym] ? PARES_YAHOO[a.sym].label : a.sym;
        const d = new Date(a.t * 1000);
        return `<div class="kv"><span>${d.toLocaleString('pt-BR').slice(0, 17)} · <strong>${lbl}</strong></span><b>cruzou ${fmtP(a.price, a.sym)}</b></div>`;
    }).join('') : '<p class="am-nota">Nenhum alerta disparado ainda. Arme um 🔔+ no gráfico.</p>';
    m.style.display = 'flex';
}

// ---- ⚖ Comparar dois ativos (força relativa na janela) ----
async function _carregarComparacao(sym) {
    const limit = Math.min(300, dados.length || 200);
    if (PARES_YAHOO[sym]) return carregarHistoricoYahoo(sym, tfMinutes(), Math.min(200, limit));
    const interval = tfMinutes() === 60 ? '1h' : tfMinutes() + 'm';   // TF Binance
    return carregarHistoricoBinance(sym, interval, limit);
}

function forcaRelativa(dA, dB) {
    if (!dA || !dB || dA.length < 2 || dB.length < 2) return null;
    const pctA = (dA[dA.length - 1].close / dA[0].close - 1) * 100;
    const pctB = (dB[dB.length - 1].close / dB[0].close - 1) * 100;
    return { pctA, pctB, diff: pctA - pctB, vencedor: pctA >= pctB ? 'A' : 'B' };
}

async function compararAtivos() {
    const inp = document.getElementById('cmpSym');
    const out = document.getElementById('cmpResultado');
    if (!inp || !out) return;
    // símbolos são alfanuméricos: sanitiza (rejeita lixo e neutraliza injeção)
    const symB = (inp.value || '').trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    inp.value = symB;
    if (!symB) { showToast('Digite o ativo para comparar (ex.: ETHUSDT ou EURUSD).', 'err'); return; }
    if (symB === symbolAtual()) { showToast('Escolha um ativo diferente do atual.', 'err'); return; }
    out.textContent = '⏳ carregando ' + symB + '…';
    try {
        const dB = await _carregarComparacao(symB);
        const fr = forcaRelativa(dados, dB);
        if (!fr) throw new Error('sem dados suficientes');
        const lblA = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
        const lblB = PARES_YAHOO[symB] ? PARES_YAHOO[symB].label : symB;
        const fmt = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
        const forte = fr.vencedor === 'A' ? lblA : lblB;
        out.innerHTML = `<span class="${fr.pctA >= 0 ? 'tick-up' : 'tick-down'}">${lblA} ${fmt(fr.pctA)}</span> · ` +
            `<span class="${fr.pctB >= 0 ? 'tick-up' : 'tick-down'}">${lblB} ${fmt(fr.pctB)}</span> → ` +
            `<strong>${forte} mais forte</strong> (${fmt(Math.abs(fr.diff))})`;
    } catch (e) {
        out.textContent = '⚠ não consegui carregar ' + symB + ' (' + (e.message || e) + ')';
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const bP = document.getElementById('btnExportPNG');
    if (bP) bP.addEventListener('click', exportarGraficoPNG);
    const bH = document.getElementById('btnAlertaHist');
    if (bH) { bH.addEventListener('click', abrirHistAlertas); bH.textContent = '📜 Histórico de alertas' + (alertasHist.length ? ' (' + alertasHist.length + ')' : ''); }
    const bCmp = document.getElementById('btnComparar2');
    if (bCmp) bCmp.addEventListener('click', () => {
        const bar = document.querySelector('.cmp-bar');
        if (bar) { bar.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        const ci = document.getElementById('cmpSym'); if (ci) ci.focus();
    });
    const hx = document.getElementById('histAlertaFechar');
    if (hx) hx.addEventListener('click', () => document.getElementById('histAlertaModal').style.display = 'none');
    const hl = document.getElementById('histAlertaLimpar');
    if (hl) hl.addEventListener('click', () => {
        alertasHist = []; localStorage.removeItem('alertasHist');
        const b = document.getElementById('btnAlertaHist'); if (b) b.textContent = '📜 Histórico de alertas';
        abrirHistAlertas();
    });
    const hm = document.getElementById('histAlertaModal');
    if (hm) hm.addEventListener('click', e => { if (e.target.id === 'histAlertaModal') hm.style.display = 'none'; });
    const bC = document.getElementById('btnComparar');
    if (bC) bC.addEventListener('click', compararAtivos);
    const ci = document.getElementById('cmpSym');
    if (ci) ci.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); compararAtivos(); } });
});
// ============================================================================
// BLOCO 33 — MENU ⋯ FERRAMENTAS (agrupa as ferramentas do gráfico)
// ============================================================================
// Abre/fecha o menu; fecha ao clicar num item, clicar fora ou Esc. Um ponto no
// botão ⋯ acende quando alguma ferramenta de exibição está LIGADA (zonas, LTs,
// sessões, ampliar, foco, alerta armado) — o estado não some quando o menu fecha.

function _algumaFerramentaAtiva() {
    return ['btnZonasChart', 'btnNiveisChart', 'btnSessoes', 'btnChartMax', 'btnFoco', 'btnAlerta']
        .some(id => { const b = document.getElementById(id); return b && b.classList.contains('is-active'); });
}
function atualizarIndicadorFerramentas() {
    const b = document.getElementById('btnFerramentas');
    if (b) b.classList.toggle('tem-ativo', _algumaFerramentaAtiva());
}

function abrirMenuFerramentas(mostrar) {
    const menu = document.getElementById('toolsMenu');
    const btn = document.getElementById('btnFerramentas');
    if (!menu || !btn) return;
    const abrir = mostrar == null ? menu.style.display === 'none' : mostrar;
    menu.style.display = abrir ? 'flex' : 'none';
    btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    btn.classList.toggle('is-open', abrir);
}

document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('btnFerramentas');
    const menu = document.getElementById('toolsMenu');
    if (!btn || !menu) return;
    btn.addEventListener('click', e => { e.stopPropagation(); abrirMenuFerramentas(); });
    // clicar num item de ação (não-toggle) fecha o menu; toggles deixam aberto
    // pra ver o efeito, mas atualizam o indicador
    menu.addEventListener('click', e => {
        const it = e.target.closest('.tools-item');
        if (!it) return;
        setTimeout(atualizarIndicadorFerramentas, 0);
        if (['btnExportPNG', 'btnAlertaHist', 'btnComparar2'].includes(it.id)) abrirMenuFerramentas(false);
    });
    document.addEventListener('click', e => {
        if (menu.style.display !== 'none' && !e.target.closest('#chartTools')) abrirMenuFerramentas(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') abrirMenuFerramentas(false); });
    // indicador acompanha ações que mudam estado por atalho/tecla (F, etc.)
    setInterval(atualizarIndicadorFerramentas, 1200);
    atualizarIndicadorFerramentas();
});
// ============================================================================
// BLOCO 34 — GESTÃO DE RISCO + GUARDIÃO DE BANCA
// ============================================================================
// Dinheiro é o que separa quem sobrevive de quem quebra. Este painel calcula o
// STAKE ideal (banca × risco%), a META e o STOP do dia em R$, e um GUARDIÃO que
// lê o placar REAL de hoje (Registro) para avisar quando bateu a meta, o stop
// ou uma sequência de perdas — a hora de PARAR. Não bloqueia nada; alerta.

// ---- Plano de risco (função pura) ----
function planoRisco(cfg) {
    const banca = Math.max(0, +cfg.banca || 0);
    const riscoPct = Math.max(0, +cfg.riscoPct || 0);
    const stake = banca * riscoPct / 100;
    const metaRS = banca * (+cfg.metaPct || 0) / 100;
    const stopRS = banca * (+cfg.stopPct || 0) / 100;
    const payout = Math.max(0.01, (+cfg.payout || 87) / 100);
    // quantas perdas SEGUIDAS a banca aguenta até bater o stop do dia
    const perdasAguenta = stake > 0 ? Math.floor(stopRS / stake) : 0;
    return { banca, stake, metaRS, stopRS, payout, beWR: 1 / (1 + payout), perdasAguenta };
}

// ---- Situação do dia (função pura): P&L estimado × meta/stop/sequência ----
function situacaoDia(placar, plano, seqMax) {
    const w = placar.w || 0, l = placar.l || 0, seq = placar.seq || 0;
    // P&L do dia estimado com o stake atual: WIN = +stake·payout · LOSS = −stake
    const plRS = w * plano.stake * plano.payout - l * plano.stake;
    let estado = 'ok', msg = 'Dentro do plano — siga disciplinado.';
    if (plano.stopRS > 0 && plRS <= -plano.stopRS) {
        estado = 'stop'; msg = '🛑 STOP DIÁRIO ATINGIDO — pare por hoje. Amanhã a banca ainda está de pé.';
    } else if (plano.metaRS > 0 && plRS >= plano.metaRS) {
        estado = 'meta'; msg = '🎯 META DO DIA BATIDA — considere encerrar e proteger o lucro.';
    } else if (seq <= -(seqMax || 3)) {
        estado = 'seq'; msg = `❄ ${-seq} perdas seguidas — respire, revise o setup antes da próxima.`;
    }
    return { plRS, estado, msg };
}

function _rMoney(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function riscoCfgAtual() {
    const g = id => document.getElementById(id);
    return {
        banca: parseFloat(g('riscoBanca').value) || 0,
        riscoPct: parseFloat(g('riscoPct').value) || 0,
        metaPct: parseFloat(g('riscoMeta').value) || 0,
        stopPct: parseFloat(g('riscoStop').value) || 0,
        payout: parseFloat((document.getElementById('payout') || {}).value) || 87
    };
}

let _riscoUltimoEstado = '';
function renderRisco() {
    if (!document.getElementById('riscoPlano')) return;
    const cfg = riscoCfgAtual();
    const plano = planoRisco(cfg);
    const seqMax = parseInt(document.getElementById('riscoSeqMax').value) || 3;
    document.getElementById('riscoPlano').innerHTML =
        kv('Stake sugerido por operação', _rMoney(plano.stake), 'kv-good') +
        kv('Meta do dia', _rMoney(plano.metaRS)) +
        kv('Stop do dia', _rMoney(plano.stopRS), 'kv-bad') +
        kv('Break-even do payout', pctTxt(plano.beWR)) +
        kv('Perdas seguidas que a banca aguenta', plano.perdasAguenta + ' ops');

    const placar = typeof placarDoDia === 'function' ? placarDoDia(typeof registro !== 'undefined' ? registro : []) : { w: 0, l: 0, seq: 0 };
    const sit = situacaoDia(placar, plano, seqMax);
    const g = document.getElementById('riscoGuardiao');
    const cls = sit.estado === 'stop' || sit.estado === 'seq' ? 'guard-stop' : sit.estado === 'meta' ? 'guard-meta' : 'guard-ok';
    g.className = 'risco-guardiao ' + cls;
    g.innerHTML = `<div class="guard-pl">Hoje: <strong>${sit.plRS >= 0 ? '+' : ''}${_rMoney(sit.plRS)}</strong> · ${placar.w || 0}W · ${placar.l || 0}L</div><div class="guard-msg">${sit.msg}</div>`;

    const tag = document.getElementById('riscoTag');
    if (tag) { tag.textContent = sit.estado === 'stop' ? '🛑 STOP' : sit.estado === 'meta' ? '🎯 META' : sit.estado === 'seq' ? '❄ pausa' : '● ativo'; }

    // avisa UMA vez quando cruza p/ stop/meta/sequência (não repete a cada render)
    const chave = sit.estado + Math.round(sit.plRS);
    if (sit.estado !== 'ok' && chave !== _riscoUltimoEstado) {
        _riscoUltimoEstado = chave;
        showToast(sit.msg, sit.estado === 'meta' ? 'ok' : 'err');
    }
    if (sit.estado === 'ok') _riscoUltimoEstado = '';
}

document.addEventListener('DOMContentLoaded', function () {
    ['riscoBanca', 'riscoPct', 'riscoMeta', 'riscoStop', 'riscoSeqMax'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderRisco);
    });
    renderRisco();
    setInterval(() => { if (!document.hidden) renderRisco(); }, 10000);   // acompanha o placar; pausa oculto
});
// ============================================================================
// BLOCO 35 — WATCHLIST (lista de observação multi-ativo ao vivo)
// ============================================================================
// Monitora vários ativos de uma vez: preço, variação % da janela e mini-
// tendência. Clique numa linha abre o ativo no gráfico. Reusa
// carregarHistoricoTF (fonte resolvida por símbolo + cache). Sem duplicar rede.

let watchlist = [];
try { watchlist = JSON.parse(localStorage.getItem('watchlist') || 'null') || ['BTCUSDT', 'ETHUSDT', 'EURUSD', 'XAUUSD']; } catch (e) { watchlist = ['BTCUSDT', 'ETHUSDT']; }
let _watchTimer = null, _watchRodando = false;

function _watchSalvar() { localStorage.setItem('watchlist', JSON.stringify(watchlist)); }

// Linha da watchlist a partir das velas (função pura): preço, variação, direção
function linhaWatch(velas) {
    if (!velas || velas.length < 2) return null;
    const c = velas[velas.length - 1].close, base = velas[0].close;
    const pct = base ? (c / base - 1) * 100 : 0;
    // mini-tendência: inclinação das últimas ~10 velas
    const n = velas.length, k = Math.min(10, n - 1);
    const dir = velas[n - 1].close > velas[n - 1 - k].close ? 1 : velas[n - 1].close < velas[n - 1 - k].close ? -1 : 0;
    return { price: c, pct, dir };
}

function watchlistAdd(sym) {
    sym = (sym || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!sym) return;
    if (watchlist.includes(sym)) { showToast(sym + ' já está na watchlist', 'info'); return; }
    if (watchlist.length >= 20) { showToast('Watchlist cheia (máx. 20).', 'err'); return; }
    watchlist.push(sym); _watchSalvar(); renderWatchlist(); atualizarWatchlist();
}
function watchlistRemove(sym) {
    watchlist = watchlist.filter(s => s !== sym); _watchSalvar(); renderWatchlist();
}

function _watchLabel(s) { return PARES_YAHOO[s] ? PARES_YAHOO[s].label : s; }

function renderWatchlist(dadosPorSym) {
    const box = document.getElementById('watchBody');
    if (!box) return;
    if (!watchlist.length) { box.innerHTML = '<div class="metric-empty" style="padding:8px 4px;">Adicione ativos para acompanhar preço e variação ao vivo.</div>'; return; }
    const dd = dadosPorSym || _watchCache || {};
    // ordena por variação desc quando há dados
    const ordem = watchlist.slice().sort((a, b) => ((dd[b] && dd[b].pct) || -1e9) - ((dd[a] && dd[a].pct) || -1e9));
    box.innerHTML = ordem.map(s => {
        const d = dd[s];
        const dec = PARES_YAHOO[s] ? (s.includes('JPY') ? 3 : 5) : (d && d.price < 10 ? 5 : 2);
        const aberto = s === symbolAtual();
        if (!d) return `<div class="watch-row${aberto ? ' watch-atual' : ''}" data-sym="${escHTML(s)}"><span class="watch-par">${escHTML(_watchLabel(s))}</span><span class="watch-load">…</span><button class="watch-x" data-rm="${escHTML(s)}" title="remover">✕</button></div>`;
        const seta = d.dir === 1 ? '▲' : d.dir === -1 ? '▼' : '·';
        return `<div class="watch-row${aberto ? ' watch-atual' : ''}" data-sym="${escHTML(s)}" title="abrir ${escHTML(_watchLabel(s))} no gráfico">` +
            `<span class="watch-par">${seta} ${escHTML(_watchLabel(s))}</span>` +
            `<span class="watch-preco">${d.price.toFixed(dec)}</span>` +
            `<span class="watch-var ${d.pct >= 0 ? 'tick-up' : 'tick-down'}">${d.pct >= 0 ? '+' : ''}${d.pct.toFixed(2)}%</span>` +
            `<button class="watch-x" data-rm="${escHTML(s)}" title="remover">✕</button></div>`;
    }).join('');
}

let _watchCache = {};
async function atualizarWatchlist() {
    if (_watchRodando || !watchlist.length) return;
    if (document.getElementById('watchPanel') && document.getElementById('watchPanel').classList.contains('painel-oculto')) return;
    _watchRodando = true;
    try {
        // concorrência limitada (3 por vez) p/ não martelar as fontes
        const fila = watchlist.slice();
        while (fila.length) {
            const lote = fila.splice(0, 3);
            await Promise.all(lote.map(async s => {
                try {
                    const v = await carregarHistoricoTF(s, tfMinutes(), 60);
                    const ln = linhaWatch(v);
                    if (ln) _watchCache[s] = ln;
                } catch (e) { }
            }));
            renderWatchlist();
        }
    } finally { _watchRodando = false; }
}

document.addEventListener('DOMContentLoaded', function () {
    renderWatchlist();
    const add = document.getElementById('watchAddBtn');
    const inp = document.getElementById('watchAddSym');
    if (add && inp) add.addEventListener('click', () => { watchlistAdd(inp.value); inp.value = ''; });
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); watchlistAdd(inp.value); inp.value = ''; } });
    const body = document.getElementById('watchBody');
    if (body) body.addEventListener('click', e => {
        const rm = e.target.closest('[data-rm]');
        if (rm) { watchlistRemove(rm.dataset.rm); return; }
        const row = e.target.closest('.watch-row');
        if (!row) return;
        const s = row.dataset.sym;
        // abre no gráfico pela mesma rota do seletor (cripto→Binance, forex→keyless)
        const sel = document.getElementById('chartSym');
        if (sel && [...sel.options].some(o => o.value === s)) { sel.value = s; sel.dispatchEvent(new Event('change')); }
        else {
            const fEl = document.getElementById('fonte');
            if (PARES_YAHOO[s]) { const key = (document.getElementById('tdKey').value || '').trim().toLowerCase(); fEl.value = (key && key !== 'demo') ? 'twelvedata' : 'yahoo'; }
            else if (['yahoo', 'twelvedata', 'sim'].includes(fEl.value)) fEl.value = 'binance';
            document.getElementById('symbol').value = s;
            if (typeof montarWidgetTV === 'function') montarWidgetTV();
            carregar();
        }
    });
    const bR = document.getElementById('watchRefresh');
    if (bR) bR.addEventListener('click', atualizarWatchlist);
    _watchTimer = setInterval(() => { if (!document.hidden) atualizarWatchlist(); }, 30000);
    setTimeout(atualizarWatchlist, 2500);
});
// ============================================================================
// BLOCO 36 — DIVERGÊNCIAS RSI × PREÇO
// ============================================================================
// Divergência = o preço faz um novo extremo mas o RSI NÃO confirma — sinal
// clássico de perda de força (possível reversão). Quatro tipos:
//   • Regular de baixa: preço faz TOPO MAIS ALTO, RSI faz topo mais BAIXO.
//   • Regular de alta:  preço faz FUNDO MAIS BAIXO, RSI faz fundo mais ALTO.
//   • Oculta de baixa:  preço faz topo mais baixo, RSI faz topo mais alto
//     (continuação de baixa).
//   • Oculta de alta:   preço faz fundo mais alto, RSI faz fundo mais baixo
//     (continuação de alta).
// Leitura DESCRITIVA (não entra na pontuação) — aparece no painel 🧭 e no
// retrato da entrada, como os padrões de vela.

// Detecta divergência entre os 2 últimos pivôs do mesmo lado (função pura).
// pivos: [{i, price}] já confirmados; rsi: array alinhado por índice de barra.
function _divLado(pivos, rsi, lado, tol) {
    if (!pivos || pivos.length < 2 || !rsi) return null;
    const b = pivos[pivos.length - 1], a = pivos[pivos.length - 2];
    const rb = rsi[b.i], ra = rsi[a.i];
    if (rb == null || ra == null) return null;
    const dPrice = b.price - a.price, dRsi = rb - ra;
    const t = tol || 0.4;   // ignora movimentos ínfimos do RSI
    if (Math.abs(dRsi) < t) return null;
    if (lado === 'topo') {
        if (dPrice > 0 && dRsi < 0) return { tipo: 'Divergência REGULAR de baixa', dir: -1, oculta: false, i0: a.i, i1: b.i };
        if (dPrice < 0 && dRsi > 0) return { tipo: 'Divergência OCULTA de baixa', dir: -1, oculta: true, i0: a.i, i1: b.i };
    } else {
        if (dPrice < 0 && dRsi > 0) return { tipo: 'Divergência REGULAR de alta', dir: 1, oculta: false, i0: a.i, i1: b.i };
        if (dPrice > 0 && dRsi < 0) return { tipo: 'Divergência OCULTA de alta', dir: 1, oculta: true, i0: a.i, i1: b.i };
    }
    return null;
}

// Divergências ativas na leitura atual (topo e fundo).
function detectarDivergencias() {
    if (!dados || dados.length < 30 || !computed || !computed.rsiValues) return [];
    const piv = acharPivotsSR();
    const rsi = computed.rsiValues;
    const out = [];
    const topo = _divLado(piv.res, rsi, 'topo');
    const fundo = _divLado(piv.sup, rsi, 'fundo');
    // só as recentes valem (último pivô nas ~15 velas finais)
    const recente = d => d && (dados.length - 1 - d.i1) <= 15;
    if (recente(topo)) out.push(topo);
    if (recente(fundo)) out.push(fundo);
    return out;
}
// ============================================================================
// BLOCO 37 — SEMÁFORO DE DECISÃO + CONFIRMAÇÃO MULTI-TIMEFRAME
// ============================================================================
// Uma resposta única, no topo do painel de decisão: 🟢 ENTRAR / 🟡 ESPERAR /
// 🔴 EVITAR — fundindo tudo que já existe (confluência, selo A/B/C, funil,
// Price Action, alinhamento de timeframes e o guardião de banca). E uma linha
// MTF mostrando a tendência de M1/M5/M15: só é "ENTRAR" quando alinham.

// ---- Multi-Timeframe: viés por EMA (função pura) ----
// alta = EMA rápida > lenta E preço acima da EMA200 (ou só as EMAs se sem 200).
function biasTF(velas) {
    if (!velas || velas.length < 25) return 0;
    const closes = velas.map(v => v.close);
    const ema = (arr, n) => { const k = 2 / (n + 1); let e = arr[0]; for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k); return e; };
    const er = ema(closes.slice(-30), 9), el = ema(closes.slice(-30), 21);
    const c = closes[closes.length - 1];
    const e200 = closes.length >= 200 ? ema(closes, 200) : null;
    if (er > el && (e200 == null || c > e200)) return 1;
    if (er < el && (e200 == null || c < e200)) return -1;
    return 0;
}

let mtfEstado = { m1: null, m5: null, m15: null, alinhado: null, dir: 0 };
let _mtfRodando = false;
const MTF_TFS = [1, 5, 15];

async function atualizarMTF() {
    if (_mtfRodando) return;
    // sem dados por-TF no Simulado; nas fontes ao vivo busca leve (60 velas, com cache)
    if (fonte() === 'sim' || !dados || !dados.length) { mtfEstado = { m1: null, m5: null, m15: null, alinhado: null, dir: 0 }; renderMTF(); return; }
    _mtfRodando = true;
    try {
        const sym = symbolAtual();
        const vieses = {};
        for (const tf of MTF_TFS) {
            try { const v = await carregarHistoricoTF(sym, tf, 60); vieses[tf] = biasTF(v); }
            catch (e) { vieses[tf] = null; }
        }
        const vals = MTF_TFS.map(tf => vieses[tf]).filter(x => x != null && x !== 0);
        const alinhado = vals.length >= 2 && vals.every(v => v === vals[0]);
        mtfEstado = { m1: vieses[1], m5: vieses[5], m15: vieses[15], alinhado, dir: alinhado ? vals[0] : 0 };
        renderMTF();
        try { renderSemaforo(_ultimoRiscoNoticia); } catch (e) { }
    } finally { _mtfRodando = false; }
}

function renderMTF() {
    const el = document.getElementById('mtfRow');
    if (!el) return;
    const chip = (tf, v) => {
        const s = v === 1 ? '▲' : v === -1 ? '▼' : v === 0 ? '·' : '—';
        const cls = v === 1 ? 'mtf-up' : v === -1 ? 'mtf-down' : 'mtf-nt';
        return `<span class="mtf-chip ${cls}">M${tf} ${s}</span>`;
    };
    el.innerHTML = chip(1, mtfEstado.m1) + chip(5, mtfEstado.m5) + chip(15, mtfEstado.m15) +
        (mtfEstado.alinhado === true ? '<span class="mtf-ok">alinhados ✓</span>' : mtfEstado.alinhado === false ? '<span class="mtf-no">divergentes</span>' : '');
}

// ---- Semáforo (função pura sobre o estado atual) ----
function semaforoDecisao(riscoNoticia) {
    const cl = confLive;
    if (!cl || !cl.fatores) return { nivel: 'esperar', dir: 0, titulo: 'ESPERAR', motivo: 'carregando dados…' };
    // config inválida tem prioridade
    try { if (typeof configProblemas === 'function' && configProblemas().length) return { nivel: 'evitar', dir: 0, titulo: 'EVITAR', motivo: 'configuração inválida — corrija nos controles' }; } catch (e) { }
    // guardião de banca em STOP → não opere hoje
    try {
        if (typeof placarDoDia === 'function' && typeof planoRisco === 'function' && typeof situacaoDia === 'function') {
            const plano = planoRisco(riscoCfgAtual());
            const sit = situacaoDia(placarDoDia(typeof registro !== 'undefined' ? registro : []), plano, parseInt((document.getElementById('riscoSeqMax') || {}).value) || 3);
            if (sit.estado === 'stop') return { nivel: 'evitar', dir: 0, titulo: 'EVITAR', motivo: '🛑 stop diário atingido — pare por hoje' };
        }
    } catch (e) { }
    if (riscoNoticia) return { nivel: 'evitar', dir: 0, titulo: 'EVITAR', motivo: '⚠ notícia próxima — fora da janela' };

    const en = cl.enabled || 1;
    const alvo = cl.confMode === 'estrita' ? en : Math.min(cl.minScore || 3, en);
    const dir = (cl.long >= alvo && cl.long > cl.short) ? 1 : (cl.short >= alvo && cl.short > cl.long) ? -1 : 0;
    if (dir === 0) return { nivel: 'esperar', dir: 0, titulo: 'ESPERAR', motivo: `sem confluência (CALL ${cl.long}/${en} · PUT ${cl.short}/${en})` };

    // filtro Price Action (se ligado): longe da zona = esperar
    if (cl.usePA) { const paOk = dir === 1 ? cl.paOkLong : cl.paOkShort; if (!paOk) return { nivel: 'esperar', dir, titulo: 'ESPERAR', motivo: `📐 ${dir === 1 ? 'CALL' : 'PUT'} longe da zona — espere o teste` }; }

    let grade = null, funil = null;
    try { grade = calcularGrade(dir).grade; } catch (e) { }
    try { funil = avaliarFunil(riscoNoticia).okCount; } catch (e) { }
    const ladoTxt = dir === 1 ? 'CALL ▲' : 'PUT ▼';

    // MTF contra o lado = evitar; alinhado a favor = bônus
    const mtfContra = mtfEstado.alinhado === true && mtfEstado.dir === -dir;
    const mtfFavor = mtfEstado.alinhado === true && mtfEstado.dir === dir;
    if (mtfContra) return { nivel: 'evitar', dir, titulo: 'EVITAR', motivo: `${ladoTxt} contra os timeframes maiores (M1/M5/M15)` };
    if (grade === 'C') return { nivel: 'evitar', dir, titulo: 'EVITAR', motivo: `${ladoTxt} · selo C — qualidade baixa` };

    // ENTRAR: selo A + funil ≥5 + (MTF a favor OU desconhecido)
    if (grade === 'A' && funil != null && funil >= 5 && !mtfContra) {
        return { nivel: 'entrar', dir, titulo: `ENTRAR ${ladoTxt}`, motivo: `selo A · funil ${funil}/6${mtfFavor ? ' · timeframes alinhados ✓' : ''}` };
    }
    // senão: sinal existe mas falta qualidade
    return { nivel: 'esperar', dir, titulo: 'ESPERAR', motivo: `${ladoTxt} · ${grade ? 'selo ' + grade : ''}${funil != null ? ' · funil ' + funil + '/6' : ''} — aguarde grau A + funil ≥5` };
}

let _ultimoRiscoNoticia = false, _semNivelAnt = null;
function renderSemaforo(riscoNoticia) {
    _ultimoRiscoNoticia = riscoNoticia;
    const box = document.getElementById('semaforo');
    if (!box) return;
    const s = semaforoDecisao(riscoNoticia);
    box.className = 'semaforo semaforo-' + s.nivel;
    const luz = s.nivel === 'entrar' ? '🟢' : s.nivel === 'evitar' ? '🔴' : '🟡';
    const l = box.querySelector('.sem-luz'); if (l) l.textContent = luz;
    const t = document.getElementById('semTitulo'); if (t) t.textContent = s.titulo;
    const m = document.getElementById('semMotivo'); if (m) m.textContent = s.motivo;

    // GATILHO ACIONÁVEL: quando o semáforo ABRE no verde (transição p/ ENTRAR),
    // avisa sem você olhar — som + notificação + toast. É o gatilho mais
    // confiável (já funde selo A + funil + MTF + risco). Uma vez por transição.
    if (s.nivel === 'entrar' && _semNivelAnt !== 'entrar' && !(typeof treino !== 'undefined' && treino)) {
        const lbl = (typeof PARES_YAHOO !== 'undefined' && PARES_YAHOO[symbolAtual()]) ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
        // som fica com a virada do veredito (bloco 6); aqui, notificação + toast
        try { if (typeof showToast === 'function') showToast('🟢 ' + s.titulo + ' — ' + s.motivo, 'ok'); } catch (e) { }
        try { if (typeof notificar === 'function') notificar('🟢 ' + s.titulo + ' — ' + lbl, s.motivo, typeof _ultimaEntradaIdx !== 'undefined' ? _ultimaEntradaIdx : undefined); } catch (e) { }
    }
    _semNivelAnt = s.nivel;
}

document.addEventListener('DOMContentLoaded', function () {
    renderMTF();
    ['symbol', 'timeframe', 'fonte', 'parPopular'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => setTimeout(atualizarMTF, 300));
    });
    setTimeout(atualizarMTF, 3500);
    setInterval(() => { if (!document.hidden) atualizarMTF(); }, 30000);
});
// ============================================================================
// BLOCO 38 — PACOTE MOBILE (nav inferior + atalhos ao alcance do polegar)
// ============================================================================
// A barra inferior (só ≤760px, via CSS) leva direto ao que importa quando se
// opera do celular: semáforo/decisão, gráfico, watchlist, gestão de risco e os
// controles — sem caçar ícones no rail lateral.

function _mnavIrPainel(id) {
    try { if (typeof railMostrar === 'function') railMostrar(id); } catch (e) { }
    const el = document.getElementById(id);
    if (el) { el.classList.remove('painel-oculto'); el.style.display = ''; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

const MNAV_ACOES = {
    decisao: () => { const d = document.querySelector('.decision-panel'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    grafico: () => { const c = document.getElementById('chartPanel'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    watch: () => _mnavIrPainel('watchPanel'),
    risco: () => _mnavIrPainel('riscoPanel'),
    controles: () => { const b = document.getElementById('btnControles'); if (b) b.click(); const s = document.querySelector('.sidebar'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
};

document.addEventListener('DOMContentLoaded', function () {
    const nav = document.getElementById('mobileNav');
    if (!nav) return;
    nav.addEventListener('click', e => {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const fn = MNAV_ACOES[b.dataset.act];
        if (fn) { fn(); nav.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)); }
    });
});
