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
