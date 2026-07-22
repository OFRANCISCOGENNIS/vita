// ============================================================================
// BLOCO 33 — MENU ⋯ FERRAMENTAS (agrupa as ferramentas do gráfico)
// ============================================================================
// Abre/fecha o menu; fecha ao clicar num item, clicar fora ou Esc. Um ponto no
// botão ⋯ acende quando alguma ferramenta de exibição está LIGADA (zonas, LTs,
// sessões, ampliar, foco, alerta armado) — o estado não some quando o menu fecha.

function _algumaFerramentaAtiva() {
    return ['btnZonasChart', 'btnNiveisChart', 'btnSessoes', 'btnChartMax', 'btnFoco', 'btnAlerta']
        .some(id => { const b = document.getElementById(id); return b && b.classList.contains('is-active'); });
}
function atualizarIndicadorFerramentas() {
    const b = document.getElementById('btnFerramentas');
    if (b) b.classList.toggle('tem-ativo', _algumaFerramentaAtiva());
}

function abrirMenuFerramentas(mostrar) {
    const menu = document.getElementById('toolsMenu');
    const btn = document.getElementById('btnFerramentas');
    if (!menu || !btn) return;
    const abrir = mostrar == null ? menu.style.display === 'none' : mostrar;
    menu.style.display = abrir ? 'flex' : 'none';
    btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    btn.classList.toggle('is-open', abrir);
}

document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('btnFerramentas');
    const menu = document.getElementById('toolsMenu');
    if (!btn || !menu) return;
    btn.addEventListener('click', e => { e.stopPropagation(); abrirMenuFerramentas(); });
    // clicar num item de ação (não-toggle) fecha o menu; toggles deixam aberto
    // pra ver o efeito, mas atualizam o indicador
    menu.addEventListener('click', e => {
        const it = e.target.closest('.tools-item');
        if (!it) return;
        setTimeout(atualizarIndicadorFerramentas, 0);
        if (['btnExportPNG', 'btnAlertaHist', 'btnComparar2'].includes(it.id)) abrirMenuFerramentas(false);
    });
    document.addEventListener('click', e => {
        if (menu.style.display !== 'none' && !e.target.closest('#chartTools')) abrirMenuFerramentas(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') abrirMenuFerramentas(false); });
    // indicador acompanha ações que mudam estado por atalho/tecla (F, etc.)
    setInterval(atualizarIndicadorFerramentas, 1200);
    atualizarIndicadorFerramentas();
});
