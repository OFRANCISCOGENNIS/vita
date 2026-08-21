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
    if (symbol === 'CRYPTOIDX') return carregarHistoricoCryptoIDX(intervalPorFonte('binance', tfMin), limit);
    return loaderPorFonte(fonte())(symbol, intervalPorFonte(fonte(), tfMin), limit);
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
    const emaRapidaLen = parseInt(document.getElementById('emaRapida').value);
    const emaLentaLen = parseInt(document.getElementById('emaLenta').value);
    const rsiLen = parseInt(document.getElementById('rsiLen').value);
    const atrLen = parseInt(document.getElementById('atrLen').value);
    const atrMediaLen = parseInt(document.getElementById('atrMediaLen').value);

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
    trend: { T: 1.4, Ma: 1.3, Mo: 0.7, V: 1.0, E: 1.4, F: 1.1, C: 1.0, P: 0.9 },
    range: { T: 0.7, Ma: 0.7, Mo: 1.4, V: 0.8, E: 0.8, F: 1.2, C: 1.0, P: 1.4 },
    vol:   { T: 1.0, Ma: 1.0, Mo: 0.9, V: 1.4, E: 1.1, F: 1.3, C: 1.0, P: 1.1 }
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
const SR_W = 5;
function acharPivotsSR() {
    const { highs, lows } = computed;
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
    return { res, sup };
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
    const rsiSobrevenda = parseInt(document.getElementById('rsiSobrevenda').value);
    const rsiSobrecompra = parseInt(document.getElementById('rsiSobrecompra').value);
    const useVolatilidade = document.getElementById('useVolatilidade').checked;
    const useEstrutura = document.getElementById('useEstrutura').checked;
    const estruturaLookback = parseInt(document.getElementById('estruturaLookback').value);
    const cooldownVelas = parseInt(document.getElementById('cooldownVelas').value);
    const confMode = document.getElementById('confMode').value;              // 'score' | 'estrita'
    const minScore = parseInt(document.getElementById('minScore').value);
    const janela = Math.max(1, parseInt(document.getElementById('confJanela').value));
    const useFluxo = document.getElementById('useFluxo').checked;
    const useCorrelacao = document.getElementById('useCorrelacao').checked;
    const fluxoJanela = Math.max(2, parseInt(document.getElementById('fluxoJanela').value));
    // Filtro Multi-Timeframe: htfTrend[i] = 1 (alta) / -1 (baixa) / 0 no TF maior
    const useHtf = document.getElementById('useHtf').checked && htfTrend.length === computed.closes.length;
    const usePadrao = document.getElementById('usePadrao').checked;
    const useSessao = document.getElementById('useSessao').checked;
    const useSR = document.getElementById('useSR').checked;
    const srK = Math.max(0.1, parseFloat(document.getElementById('srAtr').value) || 0.5);
    const usePeso = document.getElementById('usePesoIA').checked;
    const pesos = usePeso ? (pesoFatores[symbolAtual()] || {}) : null;
    const piv = useSR ? acharPivotsSR() : null;
    const regimes = usePeso ? regimePorBarra() : null;   // pesos dinâmicos por regime

    const { closes, emaR, emaL, ema200, rsiValues, atrValues, atrMedia, highs, lows } = computed;

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

    const enabledCount = [useTendencia, useEma200, useMomentum, useVolatilidade, useEstrutura, useFluxo, useCorrelacao, usePadrao].filter(Boolean).length;

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

        const fatL = [
            { k: 'T', on: useTendencia, ok: tL }, { k: 'Ma', on: useEma200, ok: maL },
            { k: 'Mo', on: useMomentum, ok: moL }, { k: 'V', on: useVolatilidade, ok: vo },
            { k: 'E', on: useEstrutura, ok: eL },
            { k: 'F', on: useFluxo, ok: fluxoDir === 1 }, { k: 'C', on: useCorrelacao, ok: corrDir === 1 },
            { k: 'P', on: usePadrao, ok: pat.up }
        ];
        const fatS = [
            { k: 'T', on: useTendencia, ok: tS }, { k: 'Ma', on: useEma200, ok: maS },
            { k: 'Mo', on: useMomentum, ok: moS }, { k: 'V', on: useVolatilidade, ok: vo },
            { k: 'E', on: useEstrutura, ok: eS },
            { k: 'F', on: useFluxo, ok: fluxoDir === -1 }, { k: 'C', on: useCorrelacao, ok: corrDir === -1 },
            { k: 'P', on: usePadrao, ok: pat.down }
        ];
        const longScore = fatL.filter(f => f.on && f.ok).length;
        const shortScore = fatS.filter(f => f.on && f.ok).length;
        // Pontuação dinâmica: peso do fator = (acerto histórico IA) × (peso do
        // regime de mercado da vela) — aprendizado contínuo + contexto.
        const wReg = regimes ? PESOS_REGIME[regimes[i]] : null;
        const pesoTotal = f => pesoDe(pesos, f.k) * (wReg ? wReg[f.k] : 1);
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
            confLive = {
                long: longScore, short: shortScore, enabled: enabledCount,
                longW, shortW, usePeso,
                regime: regimes ? regimes[i] : null,
                minScore, confMode,
                htfDir: useHtf ? htfTrend[i] : 0, useHtf,
                srVetoLong: vsLast.vetoLong, srVetoShort: vsLast.vetoShort, useSR,
                sessao: sessaoDe(dados[i].time), sessaoForte: sessaoForte(dados[i].time), useSessao,
                fatores: [
                    { nome: 'Tendência', on: useTendencia, dir: tL ? 1 : tS ? -1 : 0 },
                    { nome: 'EMA 200', on: useEma200, dir: maL ? 1 : maS ? -1 : 0 },
                    { nome: 'RSI', on: useMomentum, dir: moL ? 1 : moS ? -1 : 0 },
                    { nome: 'ATR', on: useVolatilidade, dir: vo ? 2 : 0 },   // 2 = ok (não direcional)
                    { nome: 'Estrutura', on: useEstrutura, dir: eL ? 1 : eS ? -1 : 0 },
                    { nome: 'Fluxo', on: useFluxo, dir: fluxoDir },
                    { nome: 'Correlação', on: useCorrelacao, dir: corrDir },
                    { nome: 'Padrão', on: usePadrao, dir: pat.up ? 1 : pat.down ? -1 : 0 }
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
    // Tema QUANT OPS (navy): superfície #0b1220, grid #1c2740, tinta #c8d3e8
    return {
        layout: { background: { color: '#0b1220' }, textColor: '#c8d3e8' },
        grid: { vertLines: { color: '#1c2740' }, horzLines: { color: '#1c2740' } },
        rightPriceScale: { borderColor: '#22304e' },
        timeScale: { borderColor: '#22304e', timeVisible: true, secondsVisible: false, tickMarkFormatter: t => fmtHora(t) },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        localization: { timeFormatter: t => fmtHora(t) }
    };
}

function montarGraficos() {
    if (graficosMontados) return;

    chartPreco = LightweightCharts.createChart(document.getElementById('chartPreco'), { ...opcoesBase(), height: 360 });
    serieVelas = chartPreco.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a',
        borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350'
    });
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

let sincronizando = false;
function sincronizarTempo(charts) {
    charts.forEach(src => {
        src.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (sincronizando || !range) return;
            sincronizando = true;
            charts.forEach(t => { if (t !== src) t.timeScale().setVisibleLogicalRange(range); });
            sincronizando = false;
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
    serieFluxo.setData(dados.map(barraFluxo));

    atualizarMarcadores();
    atualizarPaineis();
    atualizarLegenda();

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
function atualizarUltimoCandle(fechou) {
    recomputarIndicadores();
    const last = dados.length - 1;
    const t = dados[last].time;
    serieVelas.update({ time: t, open: dados[last].open, high: dados[last].high, low: dados[last].low, close: dados[last].close });
    const upd = (serie, val) => { if (val !== null && val !== undefined) serie.update({ time: t, value: val }); };
    upd(serieEma9, computed.emaR[last]);
    upd(serieEma21, computed.emaL[last]);
    if (document.getElementById('useEma200').checked) upd(serieEma200, computed.ema200[last]);
    upd(serieRsi, computed.rsiValues[last]);
    upd(serieAtr, computed.atrValues[last]);
    upd(serieAtrMedia, computed.atrMedia[last]);
    serieFluxo.update(barraFluxo(dados[last]));
    atualizarLegenda();

    if (fechou) {
        recomputarSinais();
        recomputarEntradas();
        atualizarMarcadores();
        atualizarPaineis();
    }
}

function atualizarMarcadores() {
    const marc = entradas.map(e => ({
        time: dados[e.index].time,
        position: e.dir === 'CALL' ? 'belowBar' : 'aboveBar',
        color: e.dir === 'CALL' ? '#26a69a' : '#ef5350',
        shape: e.dir === 'CALL' ? 'arrowUp' : 'arrowDown',
        text: `${e.dir} ${e.score}/${e.enabled} • ${e.expMin}m`
    })).sort((a, b) => a.time - b.time);
    serieVelas.setMarkers(marc);
}

function atualizarLegenda() {
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
    document.getElementById('confScoreCall').textContent = confLive.long + '/' + confLive.enabled;
    document.getElementById('confScorePut').textContent = confLive.short + '/' + confLive.enabled;

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
    let prevH = null, prevL = null;
    todos.forEach(p => {
        if (p.tipo === 'H') { rotulos.push(prevH == null ? 'H' : p.price > prevH ? 'HH' : 'LH'); prevH = p.price; }
        else { rotulos.push(prevL == null ? 'L' : p.price > prevL ? 'HL' : 'LL'); prevL = p.price; }
    });
    return { rotulos: rotulos.slice(-4), todos };
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
    mercado.textContent = biasTxt;
    mercado.className = 'qo-big ' + (biasTxt === 'BULLISH' ? 'qo-good' : biasTxt === 'BEARISH' ? 'qo-bad' : '');
    document.getElementById('qoConf').textContent = conf + '%';
    document.getElementById('qoRing').style.background =
        `conic-gradient(${dirDom === 1 ? 'var(--call)' : 'var(--put)'} ${conf * 3.6}deg, var(--grid) 0deg)`;
    const regs = regimePorBarra();
    document.getElementById('qoRegime').textContent = REGIME_ROTULO[regs[last]] || '—';
    const atrR = (computed.atrValues[last] != null && computed.atrMedia[last] != null)
        ? computed.atrValues[last] / computed.atrMedia[last] : null;
    document.getElementById('qoVolat').textContent = atrR == null ? '—' : atrR >= 1.3 ? 'Alta' : atrR <= 0.75 ? 'Baixa' : 'Média';
    document.getElementById('qoSessao').textContent = dados.length ? sessaoDe(dados[last].time) : '—';
    // aprovadas/bloqueadas: entradas do histórico fora/dentro da janela de notícia
    const newsOn = document.getElementById('useNewsFilter').checked;
    const newsJan = parseInt(document.getElementById('newsJanela').value);
    const bloqueadas = newsOn ? entradas.filter(e => noticiaProxima(e.entryTime, newsJan)).length : 0;
    document.getElementById('qoAprov').textContent = entradas.length - bloqueadas;
    document.getElementById('qoBloq').textContent = bloqueadas;
    const exEl = document.getElementById('qoExpect');
    if (metricasAtuais) {
        const v = parseFloat(metricasAtuais.expect);
        exEl.textContent = (v >= 0 ? '+' : '') + v.toFixed(2) + 'R';
        exEl.className = v >= 0 ? 'qo-good' : 'qo-bad';
    } else { exEl.textContent = '—'; exEl.className = ''; }

    // ---- PRICE ACTION ----
    const sw = estruturaSwings();
    const seq = sw.rotulos.join(' · ') || '—';
    const altaSeq = sw.rotulos.filter(r => r === 'HH' || r === 'HL').length;
    const baixaSeq = sw.rotulos.filter(r => r === 'LH' || r === 'LL').length;
    const estrut = altaSeq > baixaSeq ? 'Altista' : baixaSeq > altaSeq ? 'Baixista' : 'Indefinida';
    // BOS: rompimento de estrutura nas últimas 5 velas (sinal E presente)
    const bosRecente = [...sinaisLong, ...sinaisShort].some(s => s.index >= last - 5 && /E/.test(s.fatores));
    // correção: retração desde o último extremo relevante
    let correcao = null;
    const ultH = sw.todos.filter(p => p.tipo === 'H').slice(-1)[0];
    const ultL = sw.todos.filter(p => p.tipo === 'L').slice(-1)[0];
    if (ultH && ultL && ultH.price !== ultL.price) {
        const c = computed.closes[last];
        correcao = estrut === 'Altista'
            ? Math.round((ultH.price - c) / (ultH.price - ultL.price) * 100)
            : Math.round((c - ultL.price) / (ultH.price - ultL.price) * 100);
        correcao = Math.max(0, Math.min(100, correcao));
    }
    const pullOk = correcao != null && correcao >= 20 && correcao <= 62;
    document.getElementById('qoPA').innerHTML =
        kv('Estrutura', estrut, estrut === 'Altista' ? 'kv-good' : estrut === 'Baixista' ? 'kv-bad' : '') +
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
        const payout = Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100);
        const expectOp = g.pEst != null ? g.pEst * payout - (1 - g.pEst) : null;
        document.getElementById('qoOp').innerHTML =
            kv('Direção', dirDom === 1 ? '▲ COMPRA (CALL)' : '▼ VENDA (PUT)', dirDom === 1 ? 'kv-good' : 'kv-bad') +
            kv('Score', g.score + '/100 ' + '⭐'.repeat(g.estrelas)) +
            kv('Probabilidade', g.pEst == null ? '—' : Math.round(g.pEst * 100) + '%', g.pEst != null && g.pEst >= 0.55 ? 'kv-good' : '') +
            kv('Expectancy', expectOp == null ? '—' : (expectOp >= 0 ? '+' : '') + expectOp.toFixed(2) + 'R', expectOp >= 0 ? 'kv-good' : 'kv-bad') +
            kv('Risco sugerido (½ Kelly)', g.kelly == null ? '—' : (g.kelly * 100).toFixed(2) + '%') +
            kv('Expiração', expMinutes() + 'm');
        const aprovada = g.grade !== 'C' && (expectOp == null || expectOp >= 0);
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
    if (dados.length < 120) { alert('Carregue pelo menos 120 velas para treinar (aumente o Nº de velas).'); return; }
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

    // probabilidade estimada: histórico do score atual neste gráfico > WF do par
    const payout = Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100);
    const beWR = 1 / (1 + payout);
    let pEst = null;
    const key = Math.max(cl.long, cl.short) + '/' + enabled;
    if (byScoreGlobal && byScoreGlobal.scores[key] && byScoreGlobal.scores[key].t >= 5)
        pEst = byScoreGlobal.scores[key].w / byScoreGlobal.scores[key].t;
    else if (pairWr != null) pEst = pairWr;

    let score = Math.round(scoreRatio * 40);
    if (pEst != null) score += Math.round(Math.max(0, Math.min(1, (pEst - beWR) / 0.15)) * 20);
    else score += 10;   // sem histórico: meio-termo
    if (htfOk) score += 10;
    if (srOk) score += 10;
    if (sessOk) score += 10;
    if (pairOk && pairWr != null) score += 10; else if (pairWr == null) score += 5;
    score = Math.max(0, Math.min(100, score));

    // Kelly fracionário (½) p/ binária: f* = (p(1+b) − 1)/b; sugere risco por operação
    let kelly = null;
    if (pEst != null) kelly = Math.max(0, Math.min(0.05, ((pEst * (1 + payout) - 1) / payout) / 2));

    let grade;
    if (forte && htfOk && srOk && sessOk && pairOk) grade = 'A';
    else if (scoreRatio >= 0.5 && srOk && htfOk) grade = 'B';
    else grade = 'C';
    const motivos = [];
    if (!forte) motivos.push('score baixo');
    if (!htfOk) motivos.push('contra o TF maior');
    if (!srOk) motivos.push('colado em S/R');
    if (!sessOk) motivos.push('sessão fraca (' + cl.sessao + ')');
    if (pairWr != null && pairWr < 0.55) motivos.push('par com histórico fraco (' + (pairWr * 100).toFixed(0) + '%)');
    if (pEst != null && pEst < beWR) motivos.push('expectativa negativa no payout atual');
    return { grade, motivos, score, estrelas: Math.max(1, Math.round(score / 20)), pEst, kelly, regime: cl.regime };
}

function atualizarDecisao() {
    const v = document.getElementById('decisionVerdict');
    const r = document.getElementById('decisionReason');
    const chips = document.getElementById('decisionChips');
    const ctx = document.getElementById('decisionContext');
    const painel = document.querySelector('.decision-panel');
    if (!v || !confLive.fatores) return;

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
    const newsJan = parseInt(document.getElementById('newsJanela').value);
    const lastT = dados.length ? dados[dados.length - 1].time : 0;
    const riscoNoticia = newsOn && lastT && noticiaProxima(lastT, newsJan);

    let cor, verdictKey = 'WAIT';
    if (riscoNoticia) {
        v.textContent = 'AGUARDAR ⚠';
        v.className = 'decision-verdict verdict-news';
        r.textContent = `Notícia recente sobre ${baseAsset()} — dentro da janela de risco de ${newsJan} min. Não entrar agora.`;
        cor = 'var(--warning)';
        verdictKey = 'NEWS';
    } else if (enabled > 0 && long >= alvo && long > short) {
        v.textContent = 'ENTRAR CALL ▲';
        v.className = 'decision-verdict verdict-call';
        r.textContent = `Confluência de alta ${long}/${enabled} — atingiu o mínimo de ${alvo} fatores.`;
        cor = 'var(--call)';
        verdictKey = 'CALL';
    } else if (enabled > 0 && short >= alvo && short > long) {
        v.textContent = 'ENTRAR PUT ▼';
        v.className = 'decision-verdict verdict-put';
        r.textContent = `Confluência de baixa ${short}/${enabled} — atingiu o mínimo de ${alvo} fatores.`;
        cor = 'var(--put)';
        verdictKey = 'PUT';
    } else {
        v.textContent = 'AGUARDAR';
        v.className = 'decision-verdict verdict-wait';
        r.textContent = `Confluência insuficiente: CALL ${long}/${enabled} · PUT ${short}/${enabled} — mínimo ${alvo}. Espere o alinhamento.`;
        cor = 'var(--ink-muted)';
    }
    if (painel) painel.style.borderLeftColor = cor;

    // Selo de qualidade A/B/C — amarra confluência + IA + HTF + S/R + sessão
    const grEl = document.getElementById('decisionGrade');
    const usaGrade = document.getElementById('useGrade').checked;
    if (usaGrade && (verdictKey === 'CALL' || verdictKey === 'PUT')) {
        const g = calcularGrade(verdictKey === 'CALL' ? 1 : -1);
        const stars = '⭐'.repeat(g.estrelas);
        grEl.textContent = `${g.grade === 'A' ? 'A · ENTRAR' : g.grade === 'B' ? 'B · OBSERVAR' : 'C · EVITAR'} · ${g.score}/100 ${stars}`;
        grEl.className = 'decision-grade grade-' + g.grade;
        grEl.style.display = 'inline-flex';
        const extras = [];
        if (g.regime) extras.push('regime ' + REGIME_ROTULO[g.regime]);
        if (g.pEst != null) extras.push('WR estimado ' + (g.pEst * 100).toFixed(0) + '%');
        if (g.kelly != null) extras.push('risco sugerido (½ Kelly) ' + (g.kelly * 100).toFixed(2) + '%');
        if (extras.length) r.textContent += ' ' + extras.join(' · ') + '.';
        if (g.motivos.length) r.textContent += ' Ressalvas: ' + g.motivos.join(', ') + '.';
    } else {
        grEl.style.display = 'none';
    }

    // Som apenas na TRANSIÇÃO para CALL/PUT (não repete enquanto o veredito se
    // mantém; silenciado durante o treino de leitura para não apitar no replay)
    if (verdictKey !== ultimoVerdictSom) {
        // Registro em tempo real: a virada do veredito para CALL/PUT entra na
        // timeline do Registro de Entradas com o selo A/B/C do momento
        if ((verdictKey === 'CALL' || verdictKey === 'PUT') && !treino && dados.length) {
            const dirN = verdictKey === 'CALL' ? 1 : -1;
            const lbl = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
            const g = usaGrade ? calcularGrade(dirN).grade : null;
            registrarEntrada(lbl, dirN, Math.max(long, short), enabled, { grade: g, live: 1 });
            renderRegistro();
        }
        if (document.getElementById('somAtivo').checked && !treino) {
            if (verdictKey === 'CALL') tocarSom(1);
            else if (verdictKey === 'PUT') tocarSom(-1);
        }
        ultimoVerdictSom = verdictKey;
    }

    // Contexto histórico: o score atual costuma acertar quanto? (assertividade medida)
    const scoreAtivo = Math.max(long, short);
    const key = scoreAtivo + '/' + enabled;
    if (byScoreGlobal && byScoreGlobal.scores[key]) {
        const o = byScoreGlobal.scores[key];
        const wrK = (o.w / o.t * 100).toFixed(0);
        ctx.innerHTML = `Histórico neste gráfico: score <strong>${key}</strong> acertou <strong>${wrK}%</strong> em ${o.t} operações · empate exige <strong>${byScoreGlobal.beWR.toFixed(1)}%</strong> (payout atual).`;
    } else if (byScoreGlobal) {
        ctx.innerHTML = `Sem histórico avaliado para o score <strong>${key}</strong> neste gráfico ainda · empate exige <strong>${byScoreGlobal.beWR.toFixed(1)}%</strong>.`;
    } else {
        ctx.textContent = 'Aguardando operações avaliadas para medir a assertividade por score.';
    }

    const hint = document.getElementById('entryHint');
    if (entradas.length === 0) {
        const poucas = dados.length < 200 && document.getElementById('useEma200').checked;
        hint.textContent = poucas
            ? '💡 Filtro EMA 200 ativo com menos de 200 velas — aumente o histórico ou desligue a EMA 200.'
            : '💡 Nenhuma entrada com estes filtros. A confluência estrita gera poucos sinais (por design) — afrouxe um filtro (ex.: Estrutura ou Momentum).';
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

    const cards = [
        ['Win rate geral', wr.toFixed(1) + '%', wr >= beWR ? 'good' : 'bad'],
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
        const o = byScore[k], r = o.w / o.t * 100;
        return `<tr><td>${k}</td><td>${o.t}</td><td>${o.w}</td><td class="${r >= beWR ? 'res-win' : 'res-loss'}">${r.toFixed(0)}%</td></tr>`;
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
    if (!entradasValidas.length && !entradas.length) { alert('Sem entradas para exportar. Gere/carregue dados primeiro.'); return; }
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
}

async function carregarHistoricoBinance(symbol, interval, limit) {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const resp = await fetch(url);
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
    if (last && bar.time === last.time) { dados[dados.length - 1] = bar; atualizarUltimoCandle(fechou); }
    else if (!last || bar.time > last.time) { dados.push(bar); atualizarUltimoCandle(fechou); }
}

function conectarIdxWS(interval) {
    fecharIdxWS();
    const streams = idxSyms.map(s => s.toLowerCase() + '@kline_' + interval).join('/');
    const conn = 'IDX@' + interval; idxConn = conn;
    const sock = new WebSocket(`${BINANCE_WS}/stream?streams=${streams}`);
    idxWS = sock;
    sock.onopen = () => { if (idxConn === conn) setStatus('on', 'AO VIVO (tick a tick) • Crypto IDX ≈ cesta Binance'); };
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
        setStatus('connecting', 'Reconectando Crypto IDX…');
        setTimeout(() => { if (idxConn === conn && fonte() === 'binance' && symbolAtual() === 'CRYPTOIDX') conectarIdxWS(interval); }, 2000);
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

    sock.onopen = () => { if (conexaoAtual === stream) setStatus('on', `AO VIVO • ${symbol} ${interval}`); };
    sock.onmessage = (ev) => {
        if (conexaoAtual !== stream) return;
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg.k) return;
        onKline(msg.k);
    };
    sock.onerror = () => { if (conexaoAtual === stream) setStatus('err', 'Erro de conexão'); };
    sock.onclose = () => {
        if (conexaoAtual !== stream) return;              // troca de par/tf: ignore
        setStatus('connecting', 'Reconectando…');
        setTimeout(() => { if (conexaoAtual === stream && fonte() === 'binance') conectarWS(symbol, interval); }, 2000);
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
        atualizarUltimoCandle(k.x === true);
    } else if (!last || t > last.time) {
        dados.push(bar);                            // nova vela
        atualizarUltimoCandle(k.x === true);
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
    for (let r = 0; r < rodadas; r++) {
        for (const p of YAHOO_PROXIES) {
            try {
                const resp = await fetch(p.montar(url));
                if (!resp.ok) throw new Error(p.nome + ' HTTP ' + resp.status);
                const inner = JSON.parse(await p.texto(resp));
                if (inner.chart && inner.chart.error) throw new Error(inner.chart.error.description || 'erro Yahoo');
                if (!inner.chart || !inner.chart.result || !inner.chart.result[0]) throw new Error('resposta vazia');
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

// Fonte "Forex-like" (Forex/índices/ouro): sem volume agressor real
function ehForex() { const f = fonte(); return f === 'yahoo' || f === 'twelvedata'; }

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
    const resp = await fetch(url);
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
        const numCandles = parseInt(document.getElementById('numCandles').value);
        const volatilidade = parseFloat(document.getElementById('volatility').value);
        dados = gerarDadosSim(numCandles, volatilidade);
        refPares = gerarRefParesSim(dados);
        redesenharTudo(true);
        return;
    }

    if (fonte() === 'twelvedata') {
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

    if (fonte() === 'yahoo') {
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
        dados = gerarDadosSim(parseInt(document.getElementById('numCandles').value), 2);
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

async function escanear() {
    const f = fonte();
    if (f === 'sim') { alert('Troque a fonte para Binance ou Forex para escanear.'); return; }
    const btn = document.getElementById('btnScan');
    btn.disabled = true; btn.textContent = 'Escaneando…';
    const loader = f === 'binance' ? carregarHistoricoBinance : f === 'twelvedata' ? carregarHistoricoTwelveData : carregarHistoricoYahoo;
    const lista = f === 'binance' ? SCAN_CRIPTO : Object.keys(PARES_YAHOO);
    const arg = f === 'binance' ? binanceInterval() : tfMinutes();
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
            const d = await loader(s, arg, 250);
            if (!d || d.length < 210) continue;
            // Scanner + IA: aplica os melhores parâmetros já otimizados para este par
            const cc = iaCache[s];
            const tuned = !!cc;
            if (cc) { el('minScore').value = cc.ms; el('rsiSobrevenda').value = cc.sv; el('rsiSobrecompra').value = cc.sc; el('estruturaLookback').value = cc.lk; el('cooldownVelas').value = cc.cd; }
            else { el('minScore').value = pSave.minScore; el('rsiSobrevenda').value = pSave.rsiSobrevenda; el('rsiSobrecompra').value = pSave.rsiSobrecompra; el('estruturaLookback').value = pSave.estruturaLookback; el('cooldownVelas').value = pSave.cooldownVelas; }
            const minScore = cc ? cc.ms : minScoreG;
            dados = d; recomputarIndicadores(); recomputarSinais();
            const { long, short, enabled } = confLive;
            const alvo = confMode === 'estrita' ? enabled : Math.min(minScore, enabled);
            const domScore = Math.max(long, short);
            heatData.push({
                s, label: PARES_YAHOO[s] ? PARES_YAHOO[s].label : s,
                score: Math.round(domScore / (enabled || 1) * 100),
                dir: long > short ? 1 : short > long ? -1 : 0
            });
            if (long >= alvo && long > short) res.push({ s, dir: 1, score: long, enabled, tuned });
            else if (short >= alvo && short > long) res.push({ s, dir: -1, score: short, enabled, tuned });
        } catch (e) { }
    }
    renderHeat();
    pIds.forEach(i => { if (el(i).type === 'checkbox') el(i).checked = pSave[i]; else el(i).value = pSave[i]; });
    dados = dSave; recomputarIndicadores();
    if (el('useHtf').checked) { await carregarHtf(); }
    recomputarSinais();
    res.sort((a, b) => b.score - a.score);
    document.getElementById('scanMeta').textContent = res.length + '/' + lista.length;
    const elList = document.getElementById('scanList');
    elList.innerHTML = res.length ? res.map(r => {
        const lbl = PARES_YAHOO[r.s] ? PARES_YAHOO[r.s].label : r.s;
        const tag = r.tuned ? ' <span class="scan-tuned" title="parâmetros otimizados pela IA">✦</span>' : '';
        return `<span class="decision-chip scan-item" data-s="${r.s}">${lbl}${tag} <span class="${r.dir === 1 ? 'chip-dir-up' : 'chip-dir-down'}">${r.dir === 1 ? '▲ CALL' : '▼ PUT'} ${r.score}/${r.enabled}</span></span>`;
    }).join('') : '<span class="decision-context">Nenhuma moeda com entrada agora — afrouxe a confluência ou troque o timeframe.</span>';
    elList.querySelectorAll('.scan-item').forEach(x => x.addEventListener('click', () => {
        const s = x.getAttribute('data-s');
        document.getElementById('fonte').value = PARES_YAHOO[s] ? (ehForex() ? f : 'twelvedata') : 'binance';
        document.getElementById('symbol').value = s;
        montarWidgetTV(); carregar();
    }));
    document.getElementById('scanPanel').style.display = 'block';
    res.forEach(r => registrarEntrada(PARES_YAHOO[r.s] ? PARES_YAHOO[r.s].label : r.s, r.dir, r.score, r.enabled));
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

function renderRegistro() {
    const panel = document.getElementById('registroPanel');
    if (!registro.length) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    if (!chartRegistro) {
        chartRegistro = LightweightCharts.createChart(document.getElementById('chartRegistro'), { ...opcoesBase(), height: 150 });
        serieRegistro = chartRegistro.addLineSeries({ color: 'rgba(120,120,120,0.35)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        chartRegistro.priceScale('right').applyOptions({ visible: false });
    }
    // Notícias dentro da janela do registro entram como marcadores ⚡ na timeline
    const tMin = registro[0].t - 3600, tMax = registro[registro.length - 1].t + 3600;
    const news = noticias
        .map(n => ({ t: Math.floor(n.date.getTime() / 1000), title: n.title }))
        .filter(n => n.t >= tMin && n.t <= tMax);
    const times = [...new Set([...registro.map(r => r.t), ...news.map(n => n.t)])].sort((a, b) => a - b);
    serieRegistro.setData(times.map(t => ({ time: t, value: 0 })));
    serieRegistro.setMarkers([
        ...registro.map(r => ({
            time: r.t,
            position: r.dir === 1 ? 'aboveBar' : 'belowBar',
            color: r.dir === 1 ? '#26a69a' : '#ef5350',
            shape: r.dir === 1 ? 'arrowUp' : 'arrowDown',
            text: r.par + (r.grade ? ' [' + r.grade + ']' : '')
        })),
        ...news.map(n => ({ time: n.t, position: 'inBar', color: '#fab219', shape: 'circle', text: '⚡' }))
    ].sort((a, b) => a.time - b.time));
    chartRegistro.timeScale().fitContent();
    document.getElementById('registroMeta').textContent =
        registro.length + ' entrada' + (registro.length > 1 ? 's' : '') + (news.length ? ' · ⚡ ' + news.length + ' notícias' : '');
    document.getElementById('registroBody').innerHTML = registro.slice().reverse().map(r =>
        `<div class="reg-row"><span class="reg-hora">${fmtHora(r.t)}</span>` +
        `<span class="reg-par">${r.par}${r.live ? ' <span class="reg-tag">IA ao vivo</span>' : ''}</span>` +
        (r.grade ? `<span class="reg-grade grade-${r.grade}">${r.grade}</span>` : '') +
        `<span class="${r.dir === 1 ? 'chip-dir-up' : 'chip-dir-down'}">${r.dir === 1 ? '▲ CALL' : '▼ PUT'} ${r.score}/${r.enabled}</span></div>`
    ).join('');
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
const IA_MIN_OPS = 6;    // amostra mínima no TREINO
const IA_MIN_VAL = 3;    // amostra mínima na VALIDAÇÃO (out-of-sample)

// Melhores parâmetros memorizados por par (usados pelo scanner). Persistente.
let iaCache = JSON.parse(localStorage.getItem('iaCache') || '{}');

function statsEnt(ents) {
    const av = ents.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    const w = av.filter(e => e.resultado === 'WIN').length;
    return { ops: av.length, w, wr: av.length ? w / av.length : 0 };
}

// Avalia a combinação já aplicada (inputs) sobre o `dados` atual, dividindo em
// treino (primeiros 70% das velas) e validação (30% finais) — walk-forward.
function avaliarWalkForward() {
    recomputarIndicadores(); recomputarSinais(); recomputarEntradas();
    const nCut = Math.floor(dados.length * 0.7);
    return { treino: statsEnt(entradas.filter(e => e.index < nCut)), val: statsEnt(entradas.filter(e => e.index >= nCut)) };
}

async function otimizarIA() {
    if (!dados || dados.length < 210) { alert('Carregue um par primeiro (mín. ~210 velas).'); return; }
    const btn = document.getElementById('btnIA');
    btn.disabled = true; btn.textContent = 'Analisando TFs…';
    const el = id => document.getElementById(id);
    const isSim = fonte() === 'sim';
    const symbol = symbolAtual();
    const ids = ['minScore', 'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas', 'confMode', 'timeframe', 'useHtf', 'usePesoIA'];
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

    const tfs = isSim ? [tfMinutes()] : TFS_IA;
    const porTf = [];   // melhor combo por timeframe (inclui expiração ideal)
    let totalCombos = 0;
    for (const tf of tfs) {
        let dTf = dSave;
        if (!isSim) {
            try { dTf = await carregarHistoricoTF(symbol, tf, 300); } catch (e) { continue; }
            if (!dTf || dTf.length < 210) continue;
        }
        dados = dTf; el('timeframe').value = tf;
        const exps = EXP_OPCOES.filter(e => e >= tf && e % tf === 0 && e / tf <= 12);
        let best = null;
        for (const exp of exps)
            for (const ms of IA_GRID.minScore)
                for (const [sv, sc] of IA_GRID.rsi)
                    for (const lk of IA_GRID.estruturaLookback)
                        for (const cd of IA_GRID.cooldownVelas) {
                            el('minScore').value = ms; el('rsiSobrevenda').value = sv; el('rsiSobrecompra').value = sc;
                            el('estruturaLookback').value = lk; el('cooldownVelas').value = cd;
                            expOverride = exp;
                            const wf = avaliarWalkForward();
                            expOverride = null;
                            totalCombos++;
                            if (wf.treino.ops < IA_MIN_OPS || wf.val.ops < IA_MIN_VAL) continue;
                            // robustez = pior das duas janelas (penaliza overfit no treino)
                            const robust = Math.min(wf.treino.wr, wf.val.wr);
                            if (!best || robust > best.robust || (robust === best.robust && wf.val.ops > best.val.ops))
                                best = { tf, exp, ms, sv, sc, lk, cd, robust, treino: wf.treino, val: wf.val };
                        }
        await Promise.resolve();
        if (best) porTf.push(best);
    }
    // restaura estado do usuário
    ids.forEach(i => { if (el(i).type === 'checkbox') el(i).checked = save[i]; else el(i).value = save[i]; });
    dados = dSave; recomputarIndicadores();
    if (el('useHtf').checked) await carregarHtf();
    recomputarSinais();

    // ranqueia pelo EDGE LÍQUIDO fora da amostra (acerto − break-even do payout)
    porTf.forEach(r => r.edge = r.val.wr - beWR);
    porTf.sort((a, b) => b.edge - a.edge || b.robust - a.robust);
    const par = PARES_YAHOO[symbol] ? PARES_YAHOO[symbol].label : symbol;
    document.getElementById('iaPanel').style.display = 'block';
    document.getElementById('iaMeta').textContent = totalCombos + ' combinações · ' + tfs.length + ' timeframes · break-even ' + (beWR * 100).toFixed(1) + '%';

    if (!porTf.length) {
        document.getElementById('iaContext').textContent = `Nenhuma combinação passou na validação fora da amostra para ${par}. Carregue mais velas (300+) ou troque o par.`;
        document.getElementById('iaList').innerHTML = '';
        btn.disabled = false; btn.textContent = '🤖 IA: otimizar parâmetros';
        return;
    }

    // memoriza o melhor TF/combo deste par para o scanner
    const rec = porTf[0];
    iaCache[symbol] = { tf: rec.tf, exp: rec.exp, ms: rec.ms, sv: rec.sv, sc: rec.sc, lk: rec.lk, cd: rec.cd, wr: rec.val.wr };
    localStorage.setItem('iaCache', JSON.stringify(iaCache));

    const edgeTxt = e => (e >= 0 ? '+' : '') + (e * 100).toFixed(1) + ' pp';
    document.getElementById('iaContext').textContent =
        `${par}: melhor setup é ${rotTf(rec.tf)} com expiração ${rec.exp}m — ${(rec.val.wr * 100).toFixed(0)}% fora da amostra (edge líquido ${edgeTxt(rec.edge)} vs break-even). Clique para aplicar.`;
    document.getElementById('iaList').innerHTML = porTf.map((r, i) => {
        const vwr = (r.val.wr * 100).toFixed(0), twr = (r.treino.wr * 100).toFixed(0);
        const cls = r.edge >= 0.05 ? 'chip-dir-up' : r.edge >= 0 ? '' : 'chip-dir-down';
        const star = i === 0 ? '<span class="scan-tuned">✦</span> ' : '';
        return `<div class="reg-row ia-row" data-i="${i}">` +
            `<span class="reg-hora">${star}${rotTf(r.tf)}·${r.exp}m</span>` +
            `<span class="reg-par"><span class="${cls}">${vwr}% val · ${edgeTxt(r.edge)}</span> <span class="ia-params">(${twr}% treino · ${r.val.w}/${r.val.ops} ops)</span></span>` +
            `<span class="ia-params">score≥${r.ms} · RSI ${r.sv}/${r.sc} · estrut ${r.lk} · cd ${r.cd}</span></div>`;
    }).join('');
    document.getElementById('iaList').querySelectorAll('.ia-row').forEach(row => row.addEventListener('click', () => {
        const r = porTf[+row.getAttribute('data-i')];
        el('confMode').value = 'score'; el('minScore').value = r.ms;
        el('rsiSobrevenda').value = r.sv; el('rsiSobrecompra').value = r.sc;
        el('estruturaLookback').value = r.lk; el('cooldownVelas').value = r.cd;
        el('expiracao').value = r.exp;
        iaCache[symbol] = { tf: r.tf, exp: r.exp, ms: r.ms, sv: r.sv, sc: r.sc, lk: r.lk, cd: r.cd, wr: r.val.wr };
        localStorage.setItem('iaCache', JSON.stringify(iaCache));
        row.parentElement.querySelectorAll('.ia-row').forEach(x => x.classList.remove('ia-sel'));
        row.classList.add('ia-sel');
        // se o TF recomendado difere do atual, recarrega nesse TF; senão só recalcula
        if (!isSim && String(r.tf) !== String(tfMinutes())) { el('timeframe').value = r.tf; carregar(); }
        else recalcularSinaisApenas();
    }));
    btn.disabled = false; btn.textContent = '🤖 IA: otimizar parâmetros';
}

function rotTf(m) { return m === 60 ? 'H1' : 'M' + m; }

// ============================================================================
// BLOCO 8.7 — ESTUDOS DE MERCADO (regime, horário e fatores com mais acerto)
// ============================================================================
// Lê as entradas backtestadas do par atual e extrai padrões que ajudam o
// trader a ESTUDAR o mercado: em que horário o setup mais acerta, qual fator
// de confluência mais aparece nos WINs, e qual o regime atual (tendência ×
// lateral, volatilidade alta × baixa).

const FATORES_NOMES = { T: 'Tendência', Ma: 'EMA 200', Mo: 'RSI', V: 'ATR', E: 'Estrutura', F: 'Fluxo', C: 'Correlação', P: 'Padrão de vela' };

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
    document.getElementById('estudoPanel').style.display = 'block';
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
        const resp = await fetch(`${BINANCE_REST}/api/v3/exchangeInfo`);
        if (!resp.ok) return;
        const info = await resp.json();
        const dl = document.getElementById('listaSimbolos');
        const frag = document.createDocumentFragment();
        info.symbols
            .filter(s => s.status === 'TRADING')
            .map(s => s.symbol)
            .sort()
            .forEach(sym => { const o = document.createElement('option'); o.value = sym; frag.appendChild(o); });
        dl.appendChild(frag);
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
                const resp = await fetch(NEWS_PROXY + encodeURIComponent(feed.url));
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

document.getElementById('btnGerar').addEventListener('click', carregar);
document.getElementById('btnRecalcular').addEventListener('click', recalcularSinaisApenas);
document.getElementById('fonte').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial (prefixo BINANCE:/FX:/TVC: muda com a fonte)
    carregar();
});
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
// Trocar a chave do Twelve Data recarrega se essa for a fonte ativa
document.getElementById('tdKey').addEventListener('change', function () {
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
document.getElementById('btnIA').addEventListener('click', otimizarIA);
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
// Confluência: mudar modo/pontuação/janela recalcula os sinais na hora
['confMode', 'minScore', 'confJanela', 'useFluxo', 'fluxoJanela',
    'usePadrao', 'useSessao', 'useSR', 'srAtr', 'usePesoIA', 'useGrade'].forEach(id =>
    document.getElementById(id).addEventListener('change', recalcularSinaisApenas));
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
    if (chartPreco) chartPreco.applyOptions({ width: document.getElementById('chartPreco').clientWidth });
    if (chartRsi) chartRsi.applyOptions({ width: document.getElementById('chartRsi').clientWidth });
    if (chartAtr) chartAtr.applyOptions({ width: document.getElementById('chartAtr').clientWidth });
    if (chartEquity) chartEquity.applyOptions({ width: document.getElementById('chartEquity').clientWidth });
    if (chartFluxo) chartFluxo.applyOptions({ width: document.getElementById('chartFluxo').clientWidth });
});

// Inicializa em DOMContentLoaded (NÃO em 'load') para não depender do tv.js:
// se o widget do TradingView estiver lento/bloqueado, o resto do app não trava.
function iniciar() {
    montarWidgetTV();   // gráfico oficial do TradingView no topo (assíncrono, com retry)
    carregarSimbolos();
    carregar();
    carregarNoticias(); // notícias em tempo real
    newsTimer = setInterval(carregarNoticias, 60000);  // auto-refresh a cada 60s
    renderRegistro();   // restaura o registro de entradas salvo
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
