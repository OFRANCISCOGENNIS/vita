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
