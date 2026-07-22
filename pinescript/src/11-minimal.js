// ============================================================================
// BLOCO 16 — MODO MINIMALISTA (rail de painéis)
// ============================================================================
// Por padrão só fica visível o ESSENCIAL: decisão+funil, gráfico de preço e o
// Registro. Todos os painéis secundários viram ícones num rail vertical fino à
// esquerda — clicou, abre/fecha; estado persistente. Os fluxos que auto-abrem
// um painel (Scanner, IA, Estudo, Heatmap) chamam railMostrar() para revelar.

// cor = halo/brilho do ícone (tema de cada ferramenta, no estilo "app icon")
const PAINEIS_MENU = [
    { id: 'painelIntel', ico: '🧠', cor: '#EC4899', rot: 'Inteligência: Price Action · Liquidez · Smart Money · Volume/Delta · Análise da Operação' },
    { id: 'painelSub', ico: '📊', cor: '#3B82F6', rot: 'RSI & ATR (gráficos)' },
    { id: 'painelFluxo', ico: '🔄', cor: '#22C55E', rot: 'Fluxo de Volume (compra × venda)' },
    { id: 'heatPanel', ico: '🗺️', cor: '#14B8A6', rot: 'Heatmap de Ativos' },
    { id: 'scanPanel', ico: '🔎', cor: '#22D3EE', rot: 'Scanner — melhores entradas' },
    { id: 'iaPanel', ico: '🤖', cor: '#8B5CF6', rot: 'IA — melhores parâmetros' },
    { id: 'agentesPanel', ico: '🕵️', cor: '#6366F1', rot: 'Agentes de Estudo' },
    { id: 'pilotoPanel', ico: '🎮', cor: '#34D399', rot: 'Piloto Automático (conta demo)' },
    { id: 'riscoPanel', ico: '🛡', cor: '#F59E0B', rot: 'Gestão de Risco & Guardião de Banca' },
    { id: 'watchPanel', ico: '⭐', cor: '#FBBF24', rot: 'Watchlist — lista de observação ao vivo' },
    { id: 'proPanel', ico: '📶', cor: '#818CF8', rot: 'Volume Profile & Níveis (fib/S-R)' },
    { id: 'bookPanel', ico: '📖', cor: '#4ADE80', rot: 'Book de Ofertas & Times/Trades' },
    { id: 'painelPA', ico: '🧭', cor: '#2DD4BF', rot: 'Price Action — estudo de entradas (S/R · fib · LTA/LTB · micro×macro)' },
    { id: 'painelEntradas', ico: '🔔', cor: '#FBBF24', rot: 'Avisos de Entrada (tabela)' },
    { id: 'painelMetricas', ico: '📐', cor: '#A78BFA', rot: 'Métricas de Análise (backtest)' },
    { id: 'estudoPanel', ico: '📚', cor: '#A855F7', rot: 'Estudos de Mercado' },
    { id: 'painelTV', ico: '📺', cor: '#60A5FA', rot: 'Gráfico oficial TradingView' },
    { id: 'painelNews', ico: '📰', cor: '#38BDF8', rot: 'Notícias em tempo real' },
    { id: 'painelStatus', ico: '🎯', cor: '#4ADE80', rot: 'Status resumido' }
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
        `<button class="rail-btn" type="button" data-p="${p.id}" title="${p.rot}" aria-pressed="false" style="--ico:${p.cor}"><span class="rail-ico">${p.ico}</span></button>`
    ).join('') + '<button class="rail-btn rail-all" type="button" data-all="1" title="Mostrar/ocultar todos os painéis" style="--ico:#A78BFA"><span class="rail-ico">👁</span></button>';
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
