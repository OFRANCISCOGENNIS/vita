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
