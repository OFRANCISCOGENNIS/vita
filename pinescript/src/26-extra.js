// ============================================================================
// BLOCO 31 — PLACAR DO DIA · SESSÕES NO GRÁFICO · MODO FOCO
// ============================================================================
// 1. 📅 PLACAR DO DIA: tile na topbar com o resultado REAL de hoje
//    (WIN/LOSS verificados + sequência atual) — o dia na cara do operador.
// 2. 🕐 SESSÕES NO GRÁFICO: faixas verticais suaves pintando Londres, NY e a
//    sobreposição (o horário de mais volume) atrás das velas.
// 3. 🖥 MODO FOCO: esconde sidebar/rail/dock — só decisão + gráfico (tecla F).

// ---- 📅 Placar do dia (função pura + tile) ----
function placarDoDia(regs, agoraSec) {
    const d0 = new Date((agoraSec || Math.floor(Date.now() / 1000)) * 1000);
    d0.setHours(0, 0, 0, 0);
    const ini = Math.floor(d0.getTime() / 1000);
    const hoje = (regs || []).filter(r => r.t >= ini);
    const res = hoje.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS');
    const w = res.filter(r => r.resultado === 'WIN').length;
    const l = res.length - w;
    // sequência atual (do fim pro começo): +N vitórias ou -N derrotas seguidas
    let seq = 0;
    for (let i = res.length - 1; i >= 0; i--) {
        const win = res[i].resultado === 'WIN';
        if (seq === 0) seq = win ? 1 : -1;
        else if (seq > 0 && win) seq++;
        else if (seq < 0 && !win) seq--;
        else break;
    }
    return { total: hoje.length, w, l, wr: res.length ? w / res.length : null, seq };
}

function renderPlacarDia() {
    const el = document.getElementById('qoHoje');
    if (!el) return;
    const p = placarDoDia(typeof registro !== 'undefined' ? registro : []);
    if (!p.total) { el.textContent = '—'; el.className = ''; el.title = 'sem entradas registradas hoje'; return; }
    const seqTxt = p.seq > 1 ? ` · 🔥${p.seq}` : p.seq < -1 ? ` · ❄${-p.seq}` : '';
    el.textContent = `${p.w}W · ${p.l}L${p.wr != null ? ' (' + Math.round(p.wr * 100) + '%)' : ''}${seqTxt}`;
    el.className = p.wr == null ? '' : p.wr >= 0.55 ? 'qo-good' : p.wr < 0.5 ? 'qo-bad' : '';
    el.title = `hoje: ${p.total} entrada(s) · ${p.w} WIN · ${p.l} LOSS` + (p.seq > 1 ? ` · ${p.seq} vitórias seguidas` : p.seq < -1 ? ` · ${-p.seq} derrotas seguidas — respire` : '');
}
setInterval(() => { if (!document.hidden) renderPlacarDia(); }, 15000);   // pausa com aba oculta

// ---- 🕐 Sessões pintadas no gráfico ----
const SESSAO_COR = {
    'Londres': 'rgba(59, 130, 246, 0.05)',
    'Nova York': 'rgba(139, 92, 246, 0.05)',
    'Londres+NY': 'rgba(34, 211, 238, 0.09)'   // sobreposição = mais volume
};
let sessoesOn = localStorage.getItem('sessoesOn') === '1';
let _sessRaf = false;

function desenharSessoes() {
    if (_sessRaf) return;
    _sessRaf = true;
    requestAnimationFrame(() => { _sessRaf = false; _desenharSessoesAgora(); });
}
function _desenharSessoesAgora() {
    const cont = document.getElementById('chartPreco');
    let ov = document.getElementById('sessoesOverlay');
    if (!sessoesOn) { if (ov) ov.remove(); return; }
    if (!cont || !dados || dados.length < 5 || !chartPreco) return;
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'sessoesOverlay';
        cont.insertBefore(ov, cont.firstChild);   // atrás do overlay de zonas
    }
    const ts = chartPreco.timeScale();
    // agrupa velas contíguas da mesma sessão em retângulos verticais
    const faixas = [];
    let atual = null;
    for (let i = 0; i < dados.length; i++) {
        const s = sessaoDe(dados[i].time);
        const x = ts.timeToCoordinate(dados[i].time);
        if (x == null) { atual = null; continue; }   // fora da área visível
        if (atual && atual.s === s) atual.x2 = x;
        else { atual = { s, x1: x, x2: x }; faixas.push(atual); }
    }
    ov.innerHTML = faixas.filter(f => SESSAO_COR[f.s] && f.x2 > f.x1).map(f =>
        `<div class="sess-faixa" style="left:${Math.round(f.x1)}px;width:${Math.round(f.x2 - f.x1)}px;background:${SESSAO_COR[f.s]};" title="${f.s}"></div>`
    ).join('');
}

function alternarSessoes(on) {
    sessoesOn = on == null ? !sessoesOn : !!on;
    localStorage.setItem('sessoesOn', sessoesOn ? '1' : '0');
    const b = document.getElementById('btnSessoes');
    if (b) b.classList.toggle('is-active', sessoesOn);
    _desenharSessoesAgora();
    if (!sessoesOn) { const ov = document.getElementById('sessoesOverlay'); if (ov) ov.remove(); }
}

// ---- 🖥 Modo foco: só decisão + gráfico (tecla F) ----
function alternarFoco(on) {
    const ativo = on == null ? !document.body.classList.contains('modo-foco') : !!on;
    document.body.classList.toggle('modo-foco', ativo);
    const b = document.getElementById('btnFoco');
    if (b) b.classList.toggle('is-active', ativo);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));   // gráfico ocupa a largura nova
    if (ativo) showToast('🖥 Modo foco — F ou Esc para sair', 'info');
}

document.addEventListener('DOMContentLoaded', function () {
    renderPlacarDia();
    const bS = document.getElementById('btnSessoes');
    if (bS) { bS.addEventListener('click', () => alternarSessoes()); bS.classList.toggle('is-active', sessoesOn); }
    const bF = document.getElementById('btnFoco');
    if (bF) bF.addEventListener('click', () => alternarFoco());
    // sessões acompanham pan/zoom e recargas
    const arma = setInterval(() => {
        if (typeof chartPreco !== 'undefined' && chartPreco) {
            clearInterval(arma);
            chartPreco.timeScale().subscribeVisibleLogicalRangeChange(() => { if (sessoesOn) desenharSessoes(); });
            if (sessoesOn) _desenharSessoesAgora();
        }
    }, 800);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('modo-foco')) { alternarFoco(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key.toLowerCase() === 'f') alternarFoco();
});
