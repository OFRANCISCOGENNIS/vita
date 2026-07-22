// ============================================================================
// BLOCO 19 — MEUS FILTROS (presets do usuário: salvar/aplicar/excluir)
// ============================================================================
// Fotografa TODOS os fatores, portões e tolerâncias atuais sob um nome e
// restaura tudo de uma vez. Persistido em localStorage ('filtrosSalvos').

// O que entra na fotografia: fatores de confluência + portões + tolerâncias
// + modo/pontuação. Fonte, par e expiração ficam de fora (são da sessão).
const FILTRO_IDS = [
    // fatores de confluência
    'useTendencia', 'useEma200', 'useMomentum', 'useVolatilidade', 'useEstrutura',
    'useFluxo', 'useCorrelacao', 'usePadrao', 'useMacd', 'useBollinger',
    // portões e tolerâncias
    'useHtf', 'useSessao', 'useSR', 'srAtr', 'usePA', 'paAtr',
    'useNewsFilter', 'newsJanela', 'usePesoIA', 'useGrade', 'modoSniper',
    // parâmetros da confluência e dos indicadores dos fatores
    'confMode', 'minScore', 'confJanela', 'fluxoJanela',
    'estruturaLookback', 'cooldownVelas', 'rsiSobrevenda', 'rsiSobrecompra'
];

function _filtrosLer() { try { return JSON.parse(localStorage.getItem('filtrosSalvos') || '{}'); } catch (e) { return {}; } }
function _filtrosGravar(o) { localStorage.setItem('filtrosSalvos', JSON.stringify(o)); }

function filtroFotografar() {
    const f = {};
    FILTRO_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        f[id] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
    });
    return f;
}

function filtroAplicarValores(f) {
    FILTRO_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !(id in f)) return;
        if (el.type === 'checkbox') el.checked = !!f[id]; else el.value = f[id];
    });
}

function filtrosRenderSelect() {
    const sel = document.getElementById('filtrosSalvos');
    if (!sel) return;
    const nomes = Object.keys(_filtrosLer()).sort((a, b) => a.localeCompare(b));
    const atual = sel.value;
    sel.innerHTML = '<option value="">— aplicar filtro salvo —</option>' +
        nomes.map(n => `<option value="${escHTML(n)}">${escHTML(n)}</option>`).join('');
    if (nomes.includes(atual)) sel.value = atual;
}

function filtroSalvar() {
    const inp = document.getElementById('filtroNome');
    const nome = (inp.value || '').trim();
    if (!nome) { showToast('Dê um nome ao filtro antes de salvar.', 'err'); inp.focus(); return; }
    const todos = _filtrosLer();
    const existia = !!todos[nome];
    todos[nome] = filtroFotografar();
    _filtrosGravar(todos);
    filtrosRenderSelect();
    document.getElementById('filtrosSalvos').value = nome;
    showToast(existia ? `💾 Filtro "${nome}" atualizado` : `💾 Filtro "${nome}" salvo`, 'ok');
}

function filtroAplicar(nome) {
    const f = _filtrosLer()[nome];
    if (!f) return;
    filtroAplicarValores(f);
    document.getElementById('filtroNome').value = nome;
    showToast(`🎛️ Filtro "${nome}" aplicado`, 'ok');
    // mesmo pós-processo do preset de regime: HTF recarrega se preciso; senão só recalcula
    if (document.getElementById('useHtf').checked && fonte() !== 'sim' && dados.length) {
        carregarHtf().then(() => recalcularSinaisApenas());
    } else { htfTrend = []; recalcularSinaisApenas(); }
}

function filtroExcluir() {
    const sel = document.getElementById('filtrosSalvos');
    const nome = sel.value;
    if (!nome) { showToast('Escolha no seletor o filtro a excluir.', 'err'); return; }
    const todos = _filtrosLer();
    delete todos[nome];
    _filtrosGravar(todos);
    filtrosRenderSelect();
    sel.value = '';
    showToast(`🗑 Filtro "${nome}" excluído`, 'ok');
}

document.addEventListener('DOMContentLoaded', function () {
    filtrosRenderSelect();
    const bS = document.getElementById('btnFiltroSalvar');
    const bX = document.getElementById('btnFiltroExcluir');
    const sel = document.getElementById('filtrosSalvos');
    const inp = document.getElementById('filtroNome');
    if (bS) bS.addEventListener('click', filtroSalvar);
    if (bX) bX.addEventListener('click', filtroExcluir);
    if (sel) sel.addEventListener('change', function () { if (this.value) filtroAplicar(this.value); });
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); filtroSalvar(); } });
});
