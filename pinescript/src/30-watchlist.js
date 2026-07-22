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
