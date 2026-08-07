// ============================================================================
// BLOCO 38 — PACOTE MOBILE (nav inferior + atalhos ao alcance do polegar)
// ============================================================================
// A barra inferior (só ≤760px, via CSS) leva direto ao que importa quando se
// opera do celular: semáforo/decisão, gráfico, watchlist, gestão de risco e os
// controles — sem caçar ícones no rail lateral.

function _mnavIrPainel(id) {
    try { if (typeof railMostrar === 'function') railMostrar(id); } catch (e) { }
    const el = document.getElementById(id);
    if (el) { el.classList.remove('painel-oculto'); el.style.display = ''; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

const MNAV_ACOES = {
    decisao: () => { const d = document.querySelector('.decision-panel'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    grafico: () => { const c = document.getElementById('chartPanel'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    watch: () => _mnavIrPainel('watchPanel'),
    risco: () => _mnavIrPainel('riscoPanel'),
    controles: () => { const b = document.getElementById('btnControles'); if (b) b.click(); const s = document.querySelector('.sidebar'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
};

document.addEventListener('DOMContentLoaded', function () {
    const nav = document.getElementById('mobileNav');
    if (!nav) return;
    nav.addEventListener('click', e => {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const fn = MNAV_ACOES[b.dataset.act];
        if (fn) { fn(); nav.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)); }
    });
});
