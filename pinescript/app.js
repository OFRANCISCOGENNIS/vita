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
let graficosMontados = false;

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
function expMinutes() { return parseInt(document.getElementById('expiracao').value); }
function fonte() { return document.getElementById('fonte').value; }
function symbolAtual() { return (document.getElementById('symbol').value || 'BTCUSDT').trim().toUpperCase(); }
function binanceInterval() { const v = tfMinutes(); return v === 60 ? '1h' : v + 'm'; }

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
        out.push({
            time: baseTime - (numCandles - 1 - i) * stepSec,
            open: +open.toFixed(4), high: +high.toFixed(4),
            low: +low.toFixed(4), close: +close.toFixed(4),
            volume: Math.floor(Math.random() * 1e6) + 1e5
        });
        preco = close;
    }
    return out;
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

function rotuloFatores(fat) {
    const ok = fat.filter(f => f.on && f.ok).map(f => f.k);
    return ok.length ? ok.join('·') : '—';
}

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

    const enabledCount = [useTendencia, useEma200, useMomentum, useVolatilidade, useEstrutura].filter(Boolean).length;

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
        const eL = closes[i] > maxRec[i - 1];
        const eS = closes[i] < minRec[i - 1];

        const fatL = [
            { k: 'T', on: useTendencia, ok: tL }, { k: 'Ma', on: useEma200, ok: maL },
            { k: 'Mo', on: useMomentum, ok: moL }, { k: 'V', on: useVolatilidade, ok: vo },
            { k: 'E', on: useEstrutura, ok: eL }
        ];
        const fatS = [
            { k: 'T', on: useTendencia, ok: tS }, { k: 'Ma', on: useEma200, ok: maS },
            { k: 'Mo', on: useMomentum, ok: moS }, { k: 'V', on: useVolatilidade, ok: vo },
            { k: 'E', on: useEstrutura, ok: eS }
        ];
        const longScore = fatL.filter(f => f.on && f.ok).length;
        const shortScore = fatS.filter(f => f.on && f.ok).length;

        let longSig, shortSig;
        if (confMode === 'estrita') {
            longSig = enabledCount > 0 && longScore === enabledCount;
            shortSig = enabledCount > 0 && shortScore === enabledCount;
        } else {
            longSig = longScore >= minScore && longScore > shortScore;
            shortSig = shortScore >= minScore && shortScore > longScore;
        }

        const cool = barras >= cooldownVelas;
        if (longSig && cool) {
            sinaisLong.push({ index: i, preco: closes[i], score: longScore, enabled: enabledCount, fatores: rotuloFatores(fatL) });
            barras = 0;
        } else if (shortSig && cool) {
            sinaisShort.push({ index: i, preco: closes[i], score: shortScore, enabled: enabledCount, fatores: rotuloFatores(fatS) });
            barras = 0;
        }

        if (i === closes.length - 1) confLive = { long: longScore, short: shortScore, enabled: enabledCount };
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
}

function fmtHora(sec) {
    const d = new Date(sec * 1000), p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============================================================================
// BLOCO 6 — GRÁFICOS (montados uma vez; atualizados de forma incremental)
// ============================================================================

function opcoesBase() {
    return {
        layout: { background: { color: '#ffffff' }, textColor: '#2c3e50' },
        grid: { vertLines: { color: '#eef2f5' }, horzLines: { color: '#eef2f5' } },
        rightPriceScale: { borderColor: '#d5dbdf' },
        timeScale: { borderColor: '#d5dbdf', timeVisible: true, secondsVisible: false },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        localization: { timeFormatter: t => fmtHora(t) }
    };
}

function montarGraficos() {
    if (graficosMontados) return;

    chartPreco = LightweightCharts.createChart(document.getElementById('chartPreco'), { ...opcoesBase(), height: 340 });
    serieVelas = chartPreco.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a',
        borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350'
    });
    serieEma9 = chartPreco.addLineSeries({ color: '#3498db', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    serieEma21 = chartPreco.addLineSeries({ color: '#f39c12', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    serieEma200 = chartPreco.addLineSeries({ color: '#9b59b6', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });

    chartRsi = LightweightCharts.createChart(document.getElementById('chartRsi'), { ...opcoesBase(), height: 180 });
    serieRsi = chartRsi.addLineSeries({ color: '#e74c3c', lineWidth: 2, priceLineVisible: false });
    const sobrec = parseInt(document.getElementById('rsiSobrecompra').value);
    const sobrev = parseInt(document.getElementById('rsiSobrevenda').value);
    serieRsi.createPriceLine({ price: sobrec, color: 'rgba(0,0,0,0.25)', lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: String(sobrec) });
    serieRsi.createPriceLine({ price: sobrev, color: 'rgba(0,0,0,0.25)', lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: String(sobrev) });

    chartAtr = LightweightCharts.createChart(document.getElementById('chartAtr'), { ...opcoesBase(), height: 180 });
    serieAtr = chartAtr.addLineSeries({ color: '#27ae60', lineWidth: 2, priceLineVisible: false });
    serieAtrMedia = chartAtr.addLineSeries({ color: '#16a085', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });

    // Curva de capital (baseline em 0: verde acima, vermelho abaixo)
    chartEquity = LightweightCharts.createChart(document.getElementById('chartEquity'), { ...opcoesBase(), height: 200 });
    serieEquity = chartEquity.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topLineColor: '#27ae60', topFillColor1: 'rgba(39,174,96,0.28)', topFillColor2: 'rgba(39,174,96,0.05)',
        bottomLineColor: '#e74c3c', bottomFillColor1: 'rgba(231,76,60,0.05)', bottomFillColor2: 'rgba(231,76,60,0.28)',
        priceLineVisible: false
    });

    sincronizarTempo([chartPreco, chartRsi, chartAtr]);
    graficosMontados = true;
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

    atualizarMarcadores();
    atualizarPaineis();
    atualizarLegenda();

    if (ajustarZoom) {
        chartPreco.timeScale().fitContent();
        chartRsi.timeScale().fitContent();
        chartAtr.timeScale().fitContent();
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

    const cards = [
        ['Win rate geral', wr.toFixed(1) + '%', wr >= beWR ? 'good' : 'bad'],
        ['Win rate p/ empatar', beWR.toFixed(1) + '%', ''],
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
    // Binance kline: [openTime, open, high, low, close, volume, closeTime, ...]
    return arr.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5]
    }));
}

function fecharWS() {
    if (ws) {
        try { ws.onclose = null; ws.close(); } catch (e) {}
        ws = null;
    }
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
    const bar = { time: t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
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

async function carregar() {
    fecharWS();
    if (fonte() === 'sim') {
        conexaoAtual = '';
        setStatus('off', 'Simulado (offline)');
        const numCandles = parseInt(document.getElementById('numCandles').value);
        const volatilidade = parseFloat(document.getElementById('volatility').value);
        dados = gerarDadosSim(numCandles, volatilidade);
        redesenharTudo(true);
        return;
    }

    // Binance ao vivo
    const symbol = symbolAtual();
    const interval = binanceInterval();
    const limit = Math.min(1000, Math.max(50, parseInt(document.getElementById('numCandles').value) || 300));
    setStatus('connecting', 'Carregando histórico…');
    try {
        dados = await carregarHistoricoBinance(symbol, interval, limit);
        if (!dados.length) throw new Error('sem dados para ' + symbol);
        redesenharTudo(true);
        conectarWS(symbol, interval);
    } catch (err) {
        setStatus('err', 'Falha: ' + (err.message || err));
        console.error('Erro ao carregar Binance:', err);
        // fallback visual: gera simulado para não deixar a tela vazia
        dados = gerarDadosSim(parseInt(document.getElementById('numCandles').value), 2);
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

// ============================================================================
// BLOCO 9.5 — WIDGET OFICIAL DO TRADINGVIEW (gráfico real, requer internet)
// ============================================================================

let tvWidget = null;

function tvSymbolTV() { return 'BINANCE:' + symbolAtual(); }   // ex.: BINANCE:BTCUSDT
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
            theme: 'light',
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
    } catch (err) {
        status.textContent = 'Indisponível (requer internet)';
        document.getElementById('newsList').innerHTML =
            '<div class="news-empty">Não foi possível carregar notícias agora (requer internet). O restante do simulador continua funcionando.</div>';
    }
}

// Termos de busca da moeda atual (para filtrar notícias)
function termosMoeda() {
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
document.getElementById('fonte').addEventListener('change', carregar);
document.getElementById('timeframe').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial com o novo timeframe
    carregar();
});
document.getElementById('symbol').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial com o novo par
    renderNoticias();   // re-filtra notícias pela nova moeda
    if (fonte() === 'binance') carregar();
});
document.getElementById('btnNews').addEventListener('click', carregarNoticias);
document.getElementById('btnExport').addEventListener('click', exportarCSV);
document.getElementById('newsSoMoeda').addEventListener('change', renderNoticias);
// Confluência: mudar modo/pontuação/janela recalcula os sinais na hora
['confMode', 'minScore', 'confJanela'].forEach(id =>
    document.getElementById(id).addEventListener('change', recalcularSinaisApenas));
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
});

// Inicializa em DOMContentLoaded (NÃO em 'load') para não depender do tv.js:
// se o widget do TradingView estiver lento/bloqueado, o resto do app não trava.
function iniciar() {
    montarWidgetTV();   // gráfico oficial do TradingView no topo (assíncrono, com retry)
    carregarSimbolos();
    carregar();
    carregarNoticias(); // notícias em tempo real
    newsTimer = setInterval(carregarNoticias, 60000);  // auto-refresh a cada 60s
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
