// ============================================================================
// BLOCO 16 — MODO MINIMALISTA (rail de painéis)
// ============================================================================
// Por padrão só fica visível o ESSENCIAL: decisão+funil, gráfico de preço e o
// Registro. Todos os painéis secundários viram ícones num rail vertical fino à
// esquerda — clicou, abre/fecha; estado persistente. Os fluxos que auto-abrem
// um painel (Scanner, IA, Estudo, Heatmap) chamam railMostrar() para revelar.

const PAINEIS_MENU = [
    { id: 'painelIntel', ico: '🧠', rot: 'Inteligência: Price Action · Liquidez · Smart Money · Volume/Delta · Análise da Operação' },
    { id: 'painelSub', ico: '📊', rot: 'RSI & ATR (gráficos)' },
    { id: 'painelFluxo', ico: '🔄', rot: 'Fluxo de Volume (compra × venda)' },
    { id: 'heatPanel', ico: '🗺️', rot: 'Heatmap de Ativos' },
    { id: 'scanPanel', ico: '🔎', rot: 'Scanner — melhores entradas' },
    { id: 'iaPanel', ico: '🤖', rot: 'IA — melhores parâmetros' },
    { id: 'agentesPanel', ico: '🕵️', rot: 'Agentes de Estudo' },
    { id: 'pilotoPanel', ico: '🎮', rot: 'Piloto Automático (conta demo)' },
    { id: 'proPanel', ico: '📶', rot: 'Volume Profile & Níveis (fib/S-R)' },
    { id: 'bookPanel', ico: '📖', rot: 'Book de Ofertas & Times/Trades' },
    { id: 'painelPA', ico: '🧭', rot: 'Price Action — estudo de entradas (S/R · fib · LTA/LTB · micro×macro)' },
    { id: 'painelEntradas', ico: '🔔', rot: 'Avisos de Entrada (tabela)' },
    { id: 'painelMetricas', ico: '📐', rot: 'Métricas de Análise (backtest)' },
    { id: 'estudoPanel', ico: '📚', rot: 'Estudos de Mercado' },
    { id: 'painelTV', ico: '📺', rot: 'Gráfico oficial TradingView' },
    { id: 'painelNews', ico: '📰', rot: 'Notícias em tempo real' },
    { id: 'painelStatus', ico: '🎯', rot: 'Status resumido' }
];

let paineisVis = JSON.parse(localStorage.getItem('paineisVis') || 'null');
if (!paineisVis) { paineisVis = {}; PAINEIS_MENU.forEach(p => paineisVis[p.id] = 0); }   // padrão: tudo oculto

function salvarPaineis() { localStorage.setItem('paineisVis', JSON.stringify(paineisVis)); }

function aplicarPainel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = !!paineisVis[id];
    el.classList.toggle('painel-oculto', !on);
    const b = document.querySelector('.rail-btn[data-p="' + id + '"]');
    if (b) { b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
}

// Chamado pelos fluxos que auto-abrem um painel (scan/IA/estudo/heat): revela
// no rail também, senão o usuário dispara a ação e "não acontece nada".
function railMostrar(id) {
    if (!(id in paineisVis)) return;
    if (!paineisVis[id]) { paineisVis[id] = 1; salvarPaineis(); }
    aplicarPainel(id);
}

function montarRail() {
    const rail = document.getElementById('railPaineis');
    if (!rail) return;
    rail.innerHTML = PAINEIS_MENU.map(p =>
        `<button class="rail-btn" type="button" data-p="${p.id}" title="${p.rot}" aria-pressed="false">${p.ico}</button>`
    ).join('') + '<button class="rail-btn rail-all" type="button" data-all="1" title="Mostrar/ocultar todos os painéis">👁</button>';
    rail.addEventListener('click', ev => {
        const b = ev.target.closest('.rail-btn');
        if (!b) return;
        if (b.dataset.all) {
            const abrir = PAINEIS_MENU.some(p => !paineisVis[p.id]);   // se algo está oculto, mostra tudo; senão esconde tudo
            PAINEIS_MENU.forEach(p => paineisVis[p.id] = abrir ? 1 : 0);
        } else {
            paineisVis[b.dataset.p] = paineisVis[b.dataset.p] ? 0 : 1;
        }
        salvarPaineis();
        PAINEIS_MENU.forEach(p => aplicarPainel(p.id));
        // largura útil pode mudar (gráficos remedem)
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    PAINEIS_MENU.forEach(p => aplicarPainel(p.id));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarRail);
else montarRail();

// ---- Lupa do Dock (macOS): os ícones do rail crescem conforme a proximidade
// do cursor (transform puro = composited; 1 cálculo por frame no máximo) ----
(function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = null;
    function magnetizar(e) {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            document.querySelectorAll('#railPaineis .rail-btn').forEach(b => {
                const r = b.getBoundingClientRect();
                const d = Math.abs(e.clientY - (r.top + r.height / 2));
                const s = Math.max(1, 1.5 - d / 110);          // até 1.5× no ícone sob o cursor
                b.style.transform = s > 1.02 ? `scale(${s.toFixed(3)})` : '';
            });
        });
    }
    function soltar() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        document.querySelectorAll('#railPaineis .rail-btn').forEach(b => { b.style.transform = ''; });
    }
    document.addEventListener('DOMContentLoaded', function () {
        const rail = document.getElementById('railPaineis');
        if (!rail) return;
        rail.addEventListener('mousemove', magnetizar);
        rail.addEventListener('mouseleave', soltar);
    });
})();
