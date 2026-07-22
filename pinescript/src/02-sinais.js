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

