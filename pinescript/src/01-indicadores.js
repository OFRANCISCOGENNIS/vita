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

