// ============================================================================
// BLOCO 20 — PERFIL DE ABERTURA (abre ajustado, balanceado e em qualidade máxima)
// ============================================================================
// Três garantias ao abrir o app:
//   1. PRIMEIRA VEZ: aplica o Perfil Máxima Qualidade (fatores + portões mais
//      assertivos) e, assim que houver dados, afina os fatores pro REGIME real
//      do mercado (preset 🎯 Auto).
//   2. SEMPRE: restaura TODOS os controles como você deixou (persistência
//      automática — mudou, salvou; fechou, reabriu igual).
//   3. IA SEM CACHE: se o par aberto ainda não tem parâmetros otimizados, a IA
//      aquece sozinha em segundo plano (uma vez; o resultado fica salvo).
// Automação de teste (navigator.webdriver) pula os automatismos 1 e 3 para os
// testes serem determinísticos — as funções são testadas por chamada direta.

// O que persiste entre sessões: tudo do filtro (FILTRO_IDS, bloco 19) + os
// parâmetros da sessão de estudo (fonte, timeframe, expiração, payout, velas,
// períodos dos indicadores, amostra da IA e som).
const BOOT_IDS = FILTRO_IDS.concat([
    'fonte', 'timeframe', 'expiracao', 'payout', 'numCandles', 'volatility',
    'emaRapida', 'emaLenta', 'rsiLen', 'atrLen', 'atrMediaLen', 'iaMinVal', 'somAtivo',
    'zonasAtivo', 'niveisAtivo',   // marcações do gráfico voltam como você deixou
    'riscoBanca', 'riscoPct', 'riscoMeta', 'riscoStop', 'riscoSeqMax'   // plano de risco
]);

let _bootUltimoEstado = '';
function salvarEstadoControles() {
    const o = {};
    BOOT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        o[id] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
    });
    const j = JSON.stringify(o);
    if (j === _bootUltimoEstado) return false;
    _bootUltimoEstado = j;
    localStorage.setItem('ctrlEstado', j);
    return true;
}

function restaurarEstadoControles() {
    let o; try { o = JSON.parse(localStorage.getItem('ctrlEstado') || 'null'); } catch (e) { o = null; }
    if (!o) return false;
    BOOT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !(id in o)) return;
        if (el.type === 'checkbox') el.checked = !!o[id]; else el.value = o[id];
    });
    return true;
}

// ---- Perfil Máxima Qualidade (primeira abertura) ----
// Liga os fatores direcionais + confirmações e TODOS os portões que elevam o
// acerto (HTF, sessão, S/R, Price Action, notícia, pesos por regime, selo).
// minScore 4: exige confluência de verdade sem estrangular as entradas.
function aplicarPerfilMaximo() {
    const on = ['useTendencia', 'useEma200', 'useMomentum', 'useVolatilidade', 'useEstrutura',
        'useFluxo', 'usePadrao', 'useMacd',
        'useHtf', 'useSessao', 'useSR', 'usePA', 'useNewsFilter', 'usePesoIA', 'useGrade'];
    const off = ['useBollinger', 'useCorrelacao'];   // reversão/correlação: opcionais, não no perfil base
    on.forEach(id => { const el = document.getElementById(id); if (el) el.checked = true; });
    off.forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
    document.getElementById('minScore').value = 4;
    document.getElementById('srAtr').value = 0.5;
    document.getElementById('paAtr').value = 0.8;
}

// Espera os dados chegarem (qualquer fonte) sem travar o boot
async function _bootEsperarDados(minVelas, tentativas) {
    for (let i = 0; i < tentativas && (!dados || dados.length < minVelas); i++) {
        await new Promise(r => setTimeout(r, 500));
    }
    return dados && dados.length >= minVelas;
}

// Primeira abertura: com os dados na tela, afina os fatores pro regime REAL
async function _bootAfinarRegime() {
    if (await _bootEsperarDados(60, 40)) {
        try { aplicarPreset('auto'); } catch (e) { }
        salvarEstadoControles();
    }
}

// IA sem cache para o par aberto: aquece sozinha (1×; nas fontes ao vivo,
// treina SÓ o par aberto — a seleção do scanner é preservada e restaurada)
let _bootIAJaRodou = false;
async function aquecerIAsePreciso() {
    if (_bootIAJaRodou || iaRodando) return false;
    if ((_params.get('treinar') || '')) return false;      // ?treinar=1 já cuida do treino
    if (!await _bootEsperarDados(210, 60)) return false;
    const sym = symbolAtual();
    if (iaCache[sym] || iaCache[sym + '|' + regimeUltimo()]) return false;   // já tem parâmetros
    if (PARES_YAHOO[sym] && typeof forexFechado === 'function' && forexFechado()) return false;
    _bootIAJaRodou = true;
    let bak = null;
    if (fonte() !== 'sim') {
        bak = Object.assign({}, scanSel);
        scanUniverse().forEach(s => scanSel[s] = false);
        scanSel[sym] = true; salvarScanSel(); renderScanFiltro();
    }
    showToast('🤖 IA aquecendo o par aberto (1ª vez) — buscando os parâmetros de maior acerto…', 'info');
    try { await otimizarIA(); } catch (e) { }
    if (bak) {
        Object.keys(scanSel).forEach(k => delete scanSel[k]);
        Object.assign(scanSel, bak); salvarScanSel(); renderScanFiltro();
    }
    return true;
}

// ---- Boot (roda no parse, ANTES do iniciar() do bloco de eventos) ----
// Os scripts ficam no fim do <body>: os controles já existem aqui, e o
// DOMContentLoaded (que chama iniciar/carregar) só dispara depois.
const _bootAutomacao = !!navigator.webdriver;
// PWA offline: registra o Service Worker (só em http/https — file:// não suporta;
// o arquivo único aberto do disco já é offline por natureza)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register('sw.js').catch(() => { }); } catch (e) { }
}
const _bootRestaurou = restaurarEstadoControles();
const _bootPrimeiraVez = !_bootRestaurou;
if (_bootPrimeiraVez && !_bootAutomacao) aplicarPerfilMaximo();

// Persistência automática: qualquer mudança de controle salva (change sobe por
// bolha); presets/filtros/IA mudam sem evento — o intervalo e o beforeunload cobrem.
document.addEventListener('change', e => {
    if (e.target && e.target.id && BOOT_IDS.includes(e.target.id)) salvarEstadoControles();
});
setInterval(salvarEstadoControles, 10000);
window.addEventListener('beforeunload', salvarEstadoControles);

document.addEventListener('DOMContentLoaded', function () {
    if (_bootAutomacao) return;   // testes: sem automatismos
    if (_bootPrimeiraVez) {
        showToast('✨ Perfil Máxima Qualidade aplicado — fatores, portões e tolerâncias já balanceados', 'ok');
        _bootAfinarRegime();
    } else {
        showToast('🎛️ Controles restaurados como você deixou', 'info');
    }
    aquecerIAsePreciso();
    salvarEstadoControles();
});
