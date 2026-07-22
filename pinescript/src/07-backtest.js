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
