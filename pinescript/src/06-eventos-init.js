// ============================================================================
// BLOCO 11 — EVENTOS
// ============================================================================

// ---- Ripple discreto nos botões (delegado; nasce no ponto do clique) ----
// Respeita prefers-reduced-motion — não cria o elemento se o usuário pediu
// menos movimento (a animação em si já é bloqueada por CSS como reforço).
const _reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('click', (ev) => {
    if (_reduceMotion()) return;
    const btn = ev.target.closest('.btn-primary, .btn-mini, .btn-preset, .qo-toggle');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const span = document.createElement('span');
    span.className = 'qo-ripple';
    span.style.width = span.style.height = d + 'px';
    span.style.left = (ev.clientX - r.left - d / 2) + 'px';
    span.style.top = (ev.clientY - r.top - d / 2) + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove());
});

document.getElementById('btnGerar').addEventListener('click', carregar);
document.getElementById('btnRecalcular').addEventListener('click', recalcularSinaisApenas);
document.getElementById('fonte').addEventListener('change', function () {
    montarWidgetTV();   // sincroniza o widget oficial (prefixo BINANCE:/FX:/TVC: muda com a fonte)
    renderScanFiltro(); // a lista de moedas do scanner muda entre cripto e forex
    atualizarAvisoOTC(); // aviso de fim de semana segue a fonte
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
    // a largura útil mudou: gráficos remedem no próximo frame
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
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
    dark: { bg: '#0e1520', text: '#AAB5C5', grid: '#1a2230', border: 'rgba(170,181,197,0.12)' },
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
function notificar(titulo, corpo, idx) {
    if (!document.getElementById('notifAtivo').checked) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;   // só quando a aba NÃO está em foco (senão o som já basta)
    try {
        const n = new Notification(titulo, { body: corpo, tag: 'quantops-veredito', silent: false });
        // um clique na notificação traz a aba de volta e abre o detalhe da entrada
        n.onclick = () => {
            window.focus();
            try { if (typeof abrirDetalheEntrada === 'function') abrirDetalheEntrada(idx != null ? idx : _ultimaEntradaIdx); } catch (e) { }
            n.close();
        };
    } catch (e) { }
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
// Filtro "só nível A" do registro (persistente)
document.getElementById('regSoA').addEventListener('change', function () {
    localStorage.setItem('regSoA', this.checked ? '1' : '0');
    renderRegistro();
});
// 🎯 Modo Sniper: notificar só nível A com funil ≥5 (persistente)
document.getElementById('modoSniper').addEventListener('change', function () {
    localStorage.setItem('modoSniper', this.checked ? '1' : '0');
    if (this.checked) showToast('🎯 Modo Sniper: só notifica A com funil ≥5', 'ok');
});

// ---- Aviso OTC / fim de semana: forex real fechado, sem espelho do OTC ----
function atualizarAvisoOTC() {
    const el = document.getElementById('otcAviso');
    if (!el) return;
    const usaForex = ehForex() || modoCombinado();
    el.style.display = (usaForex && forexFechado()) ? 'flex' : 'none';
}
document.getElementById('btnIrCripto').addEventListener('click', () => {
    document.getElementById('fonte').value = 'binance';
    document.getElementById('symbol').value = 'BTCUSDT';
    document.getElementById('fonte').dispatchEvent(new Event('change'));
    showToast('₿ Cripto: mercado real 24/7', 'ok');
});
setInterval(atualizarAvisoOTC, 60000);   // revalida a cada minuto (vira o dia/hora)

// ---- Presets de estratégia por regime (fatores + portões mais assertivos) ----
// Baseados nos pesos por regime (PESOS_REGIME): tendencial premia tendência/
// estrutura/MACD; lateral premia reversão (RSI/Bollinger/padrão); volátil premia
// ATR/fluxo. Cada preset também liga os portões (Sessão/S-R e HTF quando faz
// sentido) que mais elevam o acerto.
const PRESETS_REGIME = {
    trend: { nome: '📈 Tendência', minScore: 4, htf: 1, sessao: 1, sr: 1,
        fatores: { useTendencia: 1, useEma200: 1, useMomentum: 0, useVolatilidade: 1, useEstrutura: 1, useFluxo: 1, useCorrelacao: 0, usePadrao: 0, useMacd: 1, useBollinger: 0 } },
    range: { nome: '↔ Lateral', minScore: 3, htf: 0, sessao: 1, sr: 1,
        fatores: { useTendencia: 0, useEma200: 0, useMomentum: 1, useVolatilidade: 0, useEstrutura: 0, useFluxo: 1, useCorrelacao: 0, usePadrao: 1, useMacd: 0, useBollinger: 1 } },
    vol: { nome: '🔥 Volátil', minScore: 4, htf: 1, sessao: 1, sr: 1,
        fatores: { useTendencia: 1, useEma200: 1, useMomentum: 0, useVolatilidade: 1, useEstrutura: 1, useFluxo: 1, useCorrelacao: 0, usePadrao: 0, useMacd: 0, useBollinger: 0 } }
};
function aplicarPreset(regime) {
    if (regime === 'auto') {
        let r = 'range';
        try { if (dados && dados.length) { recomputarIndicadores(); r = regimeUltimo() || 'range'; } } catch (e) {}
        regime = r;
    }
    const p = PRESETS_REGIME[regime];
    if (!p) return;
    Object.keys(p.fatores).forEach(id => { const el = document.getElementById(id); if (el) el.checked = !!p.fatores[id]; });
    document.getElementById('useHtf').checked = !!p.htf;
    document.getElementById('useSessao').checked = !!p.sessao;
    document.getElementById('useSR').checked = !!p.sr;
    document.getElementById('minScore').value = p.minScore;
    document.querySelectorAll('.btn-preset').forEach(b => b.classList.toggle('is-active', b.dataset.preset === regime));
    showToast('🎛️ Preset ' + p.nome + ' aplicado — fatores e portões afinados', 'ok');
    if (document.getElementById('useHtf').checked && fonte() !== 'sim' && dados.length) {
        carregarHtf().then(() => recalcularSinaisApenas());
    } else { htfTrend = []; recalcularSinaisApenas(); }
}
document.querySelectorAll('.btn-preset').forEach(b => b.addEventListener('click', () => aplicarPreset(b.dataset.preset)));

// ---- Cards recolhíveis: clique no título recolhe/expande o painel ----
// Otimização de tela: cada card da área central pode ser recolhido (só o título
// fica). Estado persistente por título. Expandir dispara resize p/ os gráficos
// remedirem a largura.
let cardsRecolhidos = JSON.parse(localStorage.getItem('cardsRecolhidos') || '{}');
function configurarCardsRecolhiveis() {
    document.querySelectorAll('.charts-area .chart-container > h2').forEach(h2 => {
        const card = h2.parentElement;
        const key = (h2.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
        card.classList.add('recolhivel');
        if (cardsRecolhidos[key]) card.classList.add('recolhido');
        h2.setAttribute('title', 'Clique para recolher/expandir');
        h2.addEventListener('click', ev => {
            // não recolhe ao clicar em botões/controles embutidos no título
            if (ev.target.closest('button, input, select, a')) return;
            const rec = card.classList.toggle('recolhido');
            cardsRecolhidos[key] = rec ? 1 : 0;
            localStorage.setItem('cardsRecolhidos', JSON.stringify(cardsRecolhidos));
            if (!rec) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
    });
}
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
// TODO controle de análise recalcula os sinais na hora (senão o gráfico "não
// volta ao normal" até clicar em Recarregar): fatores, períodos e parâmetros.
[
    // modo/pontuação/janela da confluência
    'confMode', 'minScore', 'confJanela',
    // fatores principais (estavam SEM listener — o gráfico não respondia a eles)
    'useTendencia', 'useEma200', 'useMomentum', 'useVolatilidade', 'useEstrutura',
    // fatores extras / portões que recalculam
    'useFluxo', 'fluxoJanela', 'usePadrao', 'useSessao', 'useSR', 'srAtr',
    'usePA', 'paAtr', 'usePesoIA', 'useGrade', 'useMacd', 'useBollinger',
    // períodos dos indicadores (mudam as EMAs/RSI/ATR e, com isso, os sinais)
    'emaRapida', 'emaLenta', 'rsiLen', 'atrLen', 'atrMediaLen',
    // parâmetros dos fatores
    'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas'
].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', recalcularSinaisApenas); });
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
    if (chartPreco) chartPreco.applyOptions({ width: document.getElementById('chartPreco').clientWidth, height: alturaChartPreco() });
    if (chartRsi) chartRsi.applyOptions({ width: document.getElementById('chartRsi').clientWidth });
    if (chartAtr) chartAtr.applyOptions({ width: document.getElementById('chartAtr').clientWidth });
    if (chartEquity) chartEquity.applyOptions({ width: document.getElementById('chartEquity').clientWidth });
    if (chartFluxo) chartFluxo.applyOptions({ width: document.getElementById('chartFluxo').clientWidth });
});

// Inicializa em DOMContentLoaded (NÃO em 'load') para não depender do tv.js:
// se o widget do TradingView estiver lento/bloqueado, o resto do app não trava.
// Reconexão dirigida pela rede do navegador: cai a internet → avisa; volta →
// zera o backoff e recarrega a fonte ao vivo na hora (não espera o timer).
window.addEventListener('offline', () => {
    if (fonte() !== 'sim') setStatus('err', '📴 Sem internet — reconecta sozinho ao voltar');
});
window.addEventListener('online', () => {
    if (fonte() === 'sim') return;
    wsTent = 0; idxTent = 0;
    showToast('🌐 Internet de volta — reconectando…', 'ok');
    carregar();
});

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
    atualizarAvisoOTC();
    // padrão LIGADO: a IA se mantém afinada sozinha (reotimiza a cada 60 min)
    document.getElementById('autoReopt').checked = localStorage.getItem('autoReopt') !== '0';
    document.getElementById('regSoA').checked = localStorage.getItem('regSoA') !== '0';   // padrão: só nível A
    document.getElementById('modoSniper').checked = localStorage.getItem('modoSniper') === '1';
    configurarCardsRecolhiveis();
    configurarAutoReopt();
    carregar();
    carregarNoticias(); // notícias em tempo real
    newsTimer = setInterval(carregarNoticias, 60000);  // auto-refresh a cada 60s
    renderRegistro();   // restaura o registro de entradas salvo
    setTimeout(verificarEntradasPendentes, 4000);              // resolve WIN/LOSS pendentes ao abrir
    setInterval(verificarEntradasPendentes, 30000);            // e a cada 30s enquanto o app roda
    autoTreinar();      // ?treinar=1 → dispara a IA sozinha ao abrir
}

// Presets de moedas para o treino automático (?preset=). "majors" = os 7 pares
// principais do forex; "menores" = 3 majors leves p/ chave grátis (poupa cota).
const PRESETS_MOEDAS = {
    majors: ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'],
    menores: ['EURUSD', 'GBPUSD', 'USDJPY']
};

// Treino automático via URL — "colocar a IA pra treinar" vira só abrir o link:
//   ?treinar=1                          usa a fonte/moedas atuais
//   ?treinar=1&fonte=twelvedata         escolhe a fonte (forex real)
//   ?treinar=1&preset=majors            treina os 7 pares principais do forex
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
    // pré-seleção de moedas: preset nomeado ou lista explícita na URL
    const preset = (_params.get('preset') || '').toLowerCase();
    const moedas = PRESETS_MOEDAS[preset]
        || (_params.get('moedas') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
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
