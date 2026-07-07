// ============================================================================
// BLOCO 11 — EVENTOS
// ============================================================================

document.getElementById('btnGerar').addEventListener('click', carregar);
document.getElementById('btnRecalcular').addEventListener('click', recalcularSinaisApenas);
document.getElementById('fonte').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial (prefixo BINANCE:/FX:/TVC: muda com a fonte)
    renderScanFiltro(); // a lista de moedas do scanner muda entre cripto e forex
    carregar();
});
document.getElementById('scanFilTodas').addEventListener('click', function () {
    scanUniverse().forEach(s => scanSel[s] = true); salvarScanSel(); renderScanFiltro();
});
document.getElementById('scanFilLimpar').addEventListener('click', function () {
    scanUniverse().forEach(s => scanSel[s] = false); salvarScanSel(); renderScanFiltro();
});

// ---- Botão "⚙️ Controles": recolhe/expande a barra de configurações ----
function aplicarControles(mostrar) {
    const sb = document.querySelector('.sidebar');
    const btn = document.getElementById('btnControles');
    if (!sb || !btn) return;
    sb.classList.toggle('oculta', !mostrar);
    btn.classList.toggle('is-off', !mostrar);
    btn.setAttribute('aria-expanded', mostrar ? 'true' : 'false');
    btn.textContent = mostrar ? '⚙️ Controles' : '⚙️ Mostrar controles';
}
document.getElementById('btnControles').addEventListener('click', function () {
    // se está oculta, o clique deve MOSTRAR; senão, ocultar
    const mostrar = document.querySelector('.sidebar').classList.contains('oculta');
    localStorage.setItem('ctrlVisivel', mostrar ? '1' : '0');
    aplicarControles(mostrar);
});

// ---- Toasts: avisos elegantes que substituem alert() (não travam a página) ----
function showToast(msg, tipo, ms) {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toastWrap'; wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast toast-' + (tipo || 'info');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('toast-out'), (ms || 4200) - 400);
    setTimeout(() => t.remove(), ms || 4200);
}

// ---- Tema claro/escuro (CSS por variáveis + recolore os gráficos existentes) ----
const CORES_TEMA = {
    dark: { bg: '#0b1220', text: '#c8d3e8', grid: '#1c2740', border: '#22304e' },
    light: { bg: '#ffffff', text: '#3a4761', grid: '#e7ecf7', border: '#c9d4ea' }
};
function temaAtual() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function aplicarTema(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem('tema', t);
    const c = CORES_TEMA[t];
    [chartPreco, chartRsi, chartAtr, chartEquity, chartFluxo, chartRegistro].forEach(ch => {
        if (ch) ch.applyOptions({
            layout: { background: { color: c.bg }, textColor: c.text },
            grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
            rightPriceScale: { borderColor: c.border },
            timeScale: { borderColor: c.border }
        });
    });
}
document.getElementById('btnTema').addEventListener('click', () => aplicarTema(temaAtual() === 'dark' ? 'light' : 'dark'));

// ---- Notificação de navegador (aba em 2º plano) ----
function notificar(titulo, corpo) {
    if (!document.getElementById('notifAtivo').checked) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;   // só quando a aba NÃO está em foco (senão o som já basta)
    try { new Notification(titulo, { body: corpo, tag: 'quantops-veredito', silent: false }); } catch (e) { }
}
document.getElementById('notifAtivo').addEventListener('change', function () {
    if (!this.checked) return;
    if (!('Notification' in window)) { showToast('Este navegador não suporta notificações.', 'err'); this.checked = false; return; }
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') showToast('🔔 Notificações ativadas — você será avisado com a aba em 2º plano', 'ok');
        else { showToast('Permissão de notificação negada pelo navegador.', 'err'); this.checked = false; }
    });
});

// ---- Painel de ajuda (atalho ?) ----
function toggleAjuda(mostrar) {
    const m = document.getElementById('ajudaModal');
    m.style.display = (mostrar == null ? m.style.display === 'none' : mostrar) ? 'flex' : 'none';
}
document.getElementById('btnAjuda').addEventListener('click', () => toggleAjuda());
document.getElementById('ajudaFechar').addEventListener('click', () => toggleAjuda(false));
document.getElementById('ajudaModal').addEventListener('click', e => { if (e.target.id === 'ajudaModal') toggleAjuda(false); });

// ---- Atalhos de teclado: C controles · S escanear · R recarregar · I IA · T tema · ? ajuda ----
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { toggleAjuda(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') { toggleAjuda(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    if (k === 'c') document.getElementById('btnControles').click();
    else if (k === 's') document.getElementById('btnScan').click();
    else if (k === 'r') document.getElementById('btnGerar').click();
    else if (k === 'i') document.getElementById('btnIA').click();
    else if (k === 't') document.getElementById('btnTema').click();
});

// ---- Exportar / importar o "cérebro" da IA (iaCache + pesos + seleção de moedas) ----
document.getElementById('btnIAExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ iaCache, pesoFatores, scanSel }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'quantops_ia.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('💾 Cérebro da IA exportado (quantops_ia.json)', 'ok');
});
document.getElementById('btnIAImport').addEventListener('click', () => document.getElementById('iaImportFile').click());
document.getElementById('iaImportFile').addEventListener('change', function () {
    const f = this.files && this.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
        try {
            const j = JSON.parse(rd.result);
            Object.assign(iaCache, j.iaCache || {});
            Object.assign(pesoFatores, j.pesoFatores || {});
            Object.assign(scanSel, j.scanSel || {});
            localStorage.setItem('iaCache', JSON.stringify(iaCache));
            localStorage.setItem('pesoFatores', JSON.stringify(pesoFatores));
            salvarScanSel(); renderScanFiltro();
            showToast('📂 IA importada: ' + Object.keys(j.iaCache || {}).length + ' conjunto(s) de parâmetros', 'ok');
        } catch (e) { showToast('Arquivo inválido: ' + e.message, 'err'); }
        this.value = '';
    };
    rd.readAsText(f);
});

// ---- Auto-reotimização da IA (a cada 60 min, se não estiver rodando) ----
function configurarAutoReopt() {
    if (autoReoptTimer) { clearInterval(autoReoptTimer); autoReoptTimer = null; }
    if (!document.getElementById('autoReopt').checked) return;
    autoReoptTimer = setInterval(() => {
        if (!iaRodando && fonte() !== 'sim') { showToast('🤖 Auto-reotimização da IA iniciada', 'info'); otimizarIA(); }
    }, 60 * 60000);
}
document.getElementById('autoReopt').addEventListener('change', function () {
    localStorage.setItem('autoReopt', this.checked ? '1' : '0');
    configurarAutoReopt();
    showToast(this.checked ? '🤖 Auto-reotimização LIGADA (a cada 60 min)' : 'Auto-reotimização desligada', 'info');
});

// ---- Cache de velas (TTL 60s): IA em lote + Scanner reusam o mesmo histórico ----
const cacheVelas = new Map();
const CACHE_VELAS_TTL = 60000;
async function comCache(chave, fn) {
    const hit = cacheVelas.get(chave);
    if (hit && Date.now() - hit.t < CACHE_VELAS_TTL) return hit.d;
    const d = await fn();
    if (d && d.length) cacheVelas.set(chave, { t: Date.now(), d });
    if (cacheVelas.size > 400) cacheVelas.delete(cacheVelas.keys().next().value);
    return d;
}

// ---- Regime da última vela (para o iaCache ciente de regime) ----
function regimeUltimo() {
    try { const r = regimePorBarra(); return r[r.length - 1] || 'range'; } catch (e) { return 'range'; }
}
document.getElementById('timeframe').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial com o novo timeframe
    carregar();
});
document.getElementById('symbol').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial com o novo par
    renderNoticias();   // re-filtra notícias pela nova moeda
    if (fonte() !== 'sim') carregar();
});
document.getElementById('parPopular').addEventListener('change', function () {
    const cod = this.value;
    if (!cod) return;
    // Padrão = Twelve Data (mais estável); se falhar, o carregar() cai p/ Yahoo sozinho.
    // Se a fonte Forex já estiver escolhida, respeita a escolha do usuário.
    if (!ehForex()) document.getElementById('fonte').value = 'twelvedata';
    document.getElementById('symbol').value = cod;
    montarWidgetTV();
    carregar();
});
// Trocar a chave do Twelve Data: persiste e recarrega se essa for a fonte ativa
document.getElementById('tdKey').addEventListener('change', function () {
    localStorage.setItem('tdKey', this.value.trim());
    if (fonte() === 'twelvedata') carregar();
});
document.getElementById('btnNews').addEventListener('click', carregarNoticias);
document.getElementById('btnExport').addEventListener('click', exportarCSV);
// Treino de leitura
document.getElementById('btnTreinar').addEventListener('click', function () {
    if (treino) return;   // já treinando
    iniciarTreino();
});
document.getElementById('btnTreinoCall').addEventListener('click', () => responderTreino(1));
document.getElementById('btnTreinoPut').addEventListener('click', () => responderTreino(-1));
document.getElementById('btnTreinoPular').addEventListener('click', () => responderTreino(0));
document.getElementById('btnTreinoSair').addEventListener('click', () => encerrarTreino(true));

document.getElementById('btnScan').addEventListener('click', escanear);
document.getElementById('btnIA').addEventListener('click', function () {
    // durante a execução, o mesmo botão vira o CANCELAR
    if (iaRodando) { iaCancelar = true; this.textContent = 'Cancelando…'; return; }
    otimizarIA();
});
document.getElementById('btnEstudo').addEventListener('click', renderEstudo);
document.getElementById('btnCryptoIdx').addEventListener('click', function () {
    document.getElementById('fonte').value = 'binance';
    document.getElementById('symbol').value = 'CRYPTOIDX';
    montarWidgetTV(); carregar();
});
document.getElementById('useHtf').addEventListener('change', async function () {
    if (!dados.length) return;
    await carregarHtf();
    recalcularSinaisApenas();
});
document.getElementById('btnLimparReg').addEventListener('click', () => {
    registro = []; localStorage.removeItem('registroEntradas');
    document.getElementById('registroPanel').style.display = 'none';
});
document.getElementById('btnTestarSom').addEventListener('click', function () {
    tocarSom(1);
    setTimeout(() => tocarSom(-1), 600);   // demonstra os dois tons: CALL e PUT
});
// Qualquer primeiro clique na página desbloqueia o áudio (exigência dos navegadores)
document.addEventListener('click', function desbloquear() {
    garantirAudio();
    document.removeEventListener('click', desbloquear);
}, { once: true });
document.getElementById('newsSoMoeda').addEventListener('change', renderNoticias);
// Confluência: mudar modo/pontuação/janela recalcula os sinais na hora
['confMode', 'minScore', 'confJanela', 'useFluxo', 'fluxoJanela',
    'usePadrao', 'useSessao', 'useSR', 'srAtr', 'usePesoIA', 'useGrade', 'useMacd', 'useBollinger'].forEach(id =>
    document.getElementById(id).addEventListener('change', recalcularSinaisApenas));
// Correlação/pares de referência: recarrega os pares e recalcula
['useCorrelacao', 'refPairs'].forEach(id =>
    document.getElementById(id).addEventListener('change', async function () {
        await carregarRefPares();
        recalcularSinaisApenas();
    }));
// Filtro de notícias + payout: só reavalia o painel/métricas (não recarrega dados)
['useNewsFilter', 'newsJanela', 'payout'].forEach(id =>
    document.getElementById(id).addEventListener('change', atualizarPaineis));
document.getElementById('expiracao').addEventListener('change', function () {
    if (!dados.length) { carregar(); return; }
    recomputarEntradas();
    atualizarMarcadores();
    atualizarPaineis();
});

window.addEventListener('resize', function () {
    if (chartPreco) chartPreco.applyOptions({ width: document.getElementById('chartPreco').clientWidth });
    if (chartRsi) chartRsi.applyOptions({ width: document.getElementById('chartRsi').clientWidth });
    if (chartAtr) chartAtr.applyOptions({ width: document.getElementById('chartAtr').clientWidth });
    if (chartEquity) chartEquity.applyOptions({ width: document.getElementById('chartEquity').clientWidth });
    if (chartFluxo) chartFluxo.applyOptions({ width: document.getElementById('chartFluxo').clientWidth });
});

// Inicializa em DOMContentLoaded (NÃO em 'load') para não depender do tv.js:
// se o widget do TradingView estiver lento/bloqueado, o resto do app não trava.
function iniciar() {
    // chave Twelve Data: URL (?tdkey=) tem prioridade, senão a salva no navegador
    const tdParam = _params.get('tdkey'), tdSalva = localStorage.getItem('tdKey');
    if (tdParam) { document.getElementById('tdKey').value = tdParam; localStorage.setItem('tdKey', tdParam); }
    else if (tdSalva) document.getElementById('tdKey').value = tdSalva;
    montarWidgetTV();   // gráfico oficial do TradingView no topo (assíncrono, com retry)
    carregarSimbolos();
    renderScanFiltro(); // checklist de moedas do scanner
    // Sidebar: restaura a preferência; em telas pequenas começa recolhida (minimalista)
    const ctrlPref = localStorage.getItem('ctrlVisivel');
    aplicarControles(ctrlPref == null ? window.innerWidth > 900 : ctrlPref !== '0');
    aplicarTema(localStorage.getItem('tema') === 'light' ? 'light' : 'dark');
    document.getElementById('autoReopt').checked = localStorage.getItem('autoReopt') === '1';
    configurarAutoReopt();
    carregar();
    carregarNoticias(); // notícias em tempo real
    newsTimer = setInterval(carregarNoticias, 60000);  // auto-refresh a cada 60s
    renderRegistro();   // restaura o registro de entradas salvo
    setTimeout(verificarEntradasPendentes, 4000);              // resolve WIN/LOSS pendentes ao abrir
    setInterval(verificarEntradasPendentes, 30000);            // e a cada 30s enquanto o app roda
    autoTreinar();      // ?treinar=1 → dispara a IA sozinha ao abrir
}

// Treino automático via URL — "colocar a IA pra treinar" vira só abrir o link:
//   ?treinar=1                          usa a fonte/moedas atuais
//   ?treinar=1&fonte=binance            escolhe a fonte
//   ?treinar=1&moedas=BTCUSDT,ETHUSDT   treina só essas moedas
//   ?treinar=1&minval=5                 exige amostra mínima maior
async function autoTreinar() {
    if (!['1', 'true', 'ia', 'sim'].includes((_params.get('treinar') || '').toLowerCase())) return;
    const fonteEl = document.getElementById('fonte');
    const fonteParam = _params.get('fonte');
    if (fonteParam && fonteEl.querySelector(`option[value="${fonteParam}"]`)) {
        fonteEl.value = fonteParam;
        fonteEl.dispatchEvent(new Event('change'));
    }
    const minval = parseInt(_params.get('minval'));
    if (minval >= 3) document.getElementById('iaMinVal').value = minval;
    // aguarda o exchangeInfo (pares forex Binance) e a carga inicial
    await new Promise(r => setTimeout(r, 1600));
    // pré-seleção de moedas: marca só as pedidas na URL
    const moedas = (_params.get('moedas') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (moedas.length) {
        scanUniverse().forEach(s => scanSel[s] = false);
        moedas.forEach(s => scanSel[s] = true);
        salvarScanSel(); renderScanFiltro();
    }
    // no Simulado a IA precisa dos dados carregados (nas fontes ao vivo ela busca sozinha)
    for (let i = 0; i < 20 && fonte() === 'sim' && (!dados || dados.length < 210); i++) await new Promise(r => setTimeout(r, 300));
    if (!iaRodando) { showToast('🤖 Treino automático iniciado…', 'info'); otimizarIA(); }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
