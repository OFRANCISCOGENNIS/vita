// ============================================================================
// BLOCO 29 — TROCA RÁPIDA NO GRÁFICO (moeda + timeframe direto no topo)
// ============================================================================
// Seletor de moeda e botões de timeframe no cabeçalho do gráfico. Não duplicam
// lógica: escrevem em #symbol/#parPopular/#timeframe e disparam o MESMO evento
// 'change' que a sidebar já trata (recarrega + reconecta + sincroniza o widget).

// Cripto mais negociadas (as demais continuam no campo da sidebar/scanner)
const CHART_CRIPTO = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT'];

function montarSeletorMoeda() {
    const sel = document.getElementById('chartSym');
    if (!sel) return;
    const atual = symbolAtual();
    const forex = Object.keys(PARES_YAHOO);
    // se o par aberto não está nas listas conhecidas, entra como 1ª opção
    const extra = (!CHART_CRIPTO.includes(atual) && !forex.includes(atual)) ? [atual] : [];
    const opt = (v, txt) => `<option value="${v}"${v === atual ? ' selected' : ''}>${txt}</option>`;
    sel.innerHTML =
        (extra.length ? `<optgroup label="Atual">${extra.map(s => opt(s, s)).join('')}</optgroup>` : '') +
        `<optgroup label="📊 Índice">${opt('CRYPTOIDX', 'Crypto IDX (proxy Binomo)')}</optgroup>` +
        `<optgroup label="₿ Cripto (Binance)">${CHART_CRIPTO.map(s => opt(s, s.replace('USDT', '/USDT'))).join('')}</optgroup>` +
        `<optgroup label="💱 Forex / Índices / Ouro">${forex.map(s => opt(s, PARES_YAHOO[s].label)).join('')}</optgroup>`;
}

function pintarTfAtivo() {
    const tf = String(tfMinutes());
    document.querySelectorAll('#chartTf button').forEach(b => b.classList.toggle('is-active', b.dataset.tf === tf));
}

function sincronizarQuickbar() {
    const sel = document.getElementById('chartSym');
    if (sel) {
        // reflete o par atual (pode ter mudado pela sidebar/scanner/IA)
        if (![...sel.options].some(o => o.value === symbolAtual())) montarSeletorMoeda();
        else sel.value = symbolAtual();
    }
    pintarTfAtivo();
}

document.addEventListener('DOMContentLoaded', function () {
    montarSeletorMoeda();
    pintarTfAtivo();

    const sel = document.getElementById('chartSym');
    if (sel) sel.addEventListener('change', function () {
        const v = this.value;
        const fonteEl = document.getElementById('fonte');
        if (PARES_YAHOO[v]) {
            // forex/índice/ouro: escolhe a fonte que REALMENTE funciona para o par.
            // Sem chave própria do Twelve Data (vazia/"demo", que só serve EUR/USD),
            // vai direto pro Yahoo — keyless e cobre todos os pares — evitando o
            // gráfico em branco durante o fallback lento.
            const key = (document.getElementById('tdKey').value || '').trim().toLowerCase();
            const temChaveReal = key && key !== 'demo';
            if (!['twelvedata', 'yahoo', 'ambos', 'ambos3'].includes(fonteEl.value)) {
                fonteEl.value = temChaveReal ? 'twelvedata' : 'yahoo';
            } else if (fonteEl.value === 'twelvedata' && !temChaveReal) {
                fonteEl.value = 'yahoo';   // corrige demo → keyless
            }
        } else if (v === 'CRYPTOIDX') {
            fonteEl.value = 'binance';   // o índice é uma cesta Binance normalizada
        } else {
            // cripto: garante fonte que serve cripto (nunca fica preso no forex/sim)
            if (['yahoo', 'twelvedata', 'sim'].includes(fonteEl.value)) fonteEl.value = 'binance';
        }
        const symEl = document.getElementById('symbol');
        symEl.value = v;
        montarWidgetTV(); renderNoticias();
        carregar();   // recarrega já com a fonte certa (não depende do listener antigo)
    });

    document.getElementById('chartTf').addEventListener('click', function (e) {
        const b = e.target.closest('button[data-tf]');
        if (!b) return;
        const tfEl = document.getElementById('timeframe');
        if (tfEl.value === b.dataset.tf) return;
        tfEl.value = b.dataset.tf;
        pintarTfAtivo();
        tfEl.dispatchEvent(new Event('change'));
    });

    // mantém a barra em sincronia quando a troca vem de OUTRO lugar
    ['symbol', 'timeframe', 'fonte', 'parPopular'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => setTimeout(sincronizarQuickbar, 0));
    });
});
