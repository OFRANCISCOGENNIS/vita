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
// Coalescência de ticks: em rajada (WS manda vários ticks por segundo, ainda
// mais no Crypto IDX que combina 5 streams), fazer a recomputação completa em
// cada um desperdiça CPU e trava a UI. Agrupamos por FRAME (requestAnimationFrame)
// e recomputamos no máximo 1×/frame. O fechamento de vela nunca é perdido: o
// flag "fechou" é acumulado (OR) até o flush.
let _tickPend = false, _tickFechou = false;
function agendarTick(fechou) {
    _tickFechou = _tickFechou || fechou;
    if (_tickPend) return;
    _tickPend = true;
    requestAnimationFrame(() => {
        _tickPend = false;
        const f = _tickFechou; _tickFechou = false;
        // Guarda: um erro no tick não pode derrubar o gráfico ao vivo.
        try { atualizarUltimoCandle(f); } catch (e) { QLOG.erro('tick:', e); }
    });
}

function atualizarUltimoCandle(fechou) {
    if (!dados || !dados.length || !serieVelas) return;   // feed vazio: nada a atualizar
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
    const newsJan = lerNum('newsJanela');
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
        const gGrade = ehEntrada && dados.length ? calcularGrade(dirN).grade : null;
        let fn = null;
        if (ehEntrada && dados.length) { try { fn = avaliarFunil(riscoNoticia); } catch (e) { } }
        // Registro em tempo real: a virada do veredito para CALL/PUT entra na
        // timeline do Registro de Entradas com o selo A/B/C e o funil do momento
        if (ehEntrada && dados.length) {
            const lbl = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
            const funilN = fn ? fn.okCount : null;
            const extra = { grade: gGrade, funil: funilN, live: 1, exp: parseInt(document.getElementById('expiracao').value) || 5, sym: symbolAtual(), fonte: fonte() };
            // Piloto Automático: se a virada passa no gatilho, vira operação paper (conta demo)
            if (typeof pilotoQualifica === 'function' && pilotoQualifica(gGrade, funilN)) {
                extra.paper = 1; extra.stake = pilotoStakeAtual(); extra.payout = pilotoPayout();
            }
            registrarEntrada(lbl, dirN, Math.max(long, short), enabled, extra);
            renderRegistro();
        }
        if (document.getElementById('somAtivo').checked && !treino) {
            if (verdictKey === 'CALL') tocarSom(1);
            else if (verdictKey === 'PUT') tocarSom(-1);
        }
        // Notificação de navegador — SÓ nível A; no 🎯 Modo Sniper, exige também
        // funil ≥5 (o topo do topo — pouquíssimas, mas as melhores).
        const sniperEl = document.getElementById('modoSniper');
        const sniper = sniperEl && sniperEl.checked;
        if (ehEntrada && gGrade === 'A' && (!sniper || (fn && fn.okCount >= 5))) {
            const lbl = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
            notificar(`🅰 ${verdictKey === 'CALL' ? '▲ CALL' : '▼ PUT'} — ${lbl}`, `Nível A${fn ? ' · funil ' + fn.okCount + '/6' : ''} · ${Math.max(long, short)}/${enabled} fatores · exp ${document.getElementById('expiracao').value}m`);
        }
        ultimoVerdictSom = verdictKey;
    }

    // Funil de qualidade: mostra quais dos 6 elos de assertividade estão fechados
    try { renderFunilQualidade(riscoNoticia); } catch (e) { }
    // Ferramentas Pro (VP/níveis/book) acompanham os recálculos
    try { if (typeof proAtualizar === 'function') proAtualizar(); } catch (e) { }
    try { if (typeof renderPriceAction === 'function') renderPriceAction(); } catch (e) { }

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

