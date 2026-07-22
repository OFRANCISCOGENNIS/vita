// ============================================================================
// BLOCO 36 — DIVERGÊNCIAS RSI × PREÇO
// ============================================================================
// Divergência = o preço faz um novo extremo mas o RSI NÃO confirma — sinal
// clássico de perda de força (possível reversão). Quatro tipos:
//   • Regular de baixa: preço faz TOPO MAIS ALTO, RSI faz topo mais BAIXO.
//   • Regular de alta:  preço faz FUNDO MAIS BAIXO, RSI faz fundo mais ALTO.
//   • Oculta de baixa:  preço faz topo mais baixo, RSI faz topo mais alto
//     (continuação de baixa).
//   • Oculta de alta:   preço faz fundo mais alto, RSI faz fundo mais baixo
//     (continuação de alta).
// Leitura DESCRITIVA (não entra na pontuação) — aparece no painel 🧭 e no
// retrato da entrada, como os padrões de vela.

// Detecta divergência entre os 2 últimos pivôs do mesmo lado (função pura).
// pivos: [{i, price}] já confirmados; rsi: array alinhado por índice de barra.
function _divLado(pivos, rsi, lado, tol) {
    if (!pivos || pivos.length < 2 || !rsi) return null;
    const b = pivos[pivos.length - 1], a = pivos[pivos.length - 2];
    const rb = rsi[b.i], ra = rsi[a.i];
    if (rb == null || ra == null) return null;
    const dPrice = b.price - a.price, dRsi = rb - ra;
    const t = tol || 0.4;   // ignora movimentos ínfimos do RSI
    if (Math.abs(dRsi) < t) return null;
    if (lado === 'topo') {
        if (dPrice > 0 && dRsi < 0) return { tipo: 'Divergência REGULAR de baixa', dir: -1, oculta: false, i0: a.i, i1: b.i };
        if (dPrice < 0 && dRsi > 0) return { tipo: 'Divergência OCULTA de baixa', dir: -1, oculta: true, i0: a.i, i1: b.i };
    } else {
        if (dPrice < 0 && dRsi > 0) return { tipo: 'Divergência REGULAR de alta', dir: 1, oculta: false, i0: a.i, i1: b.i };
        if (dPrice > 0 && dRsi < 0) return { tipo: 'Divergência OCULTA de alta', dir: 1, oculta: true, i0: a.i, i1: b.i };
    }
    return null;
}

// Divergências ativas na leitura atual (topo e fundo).
function detectarDivergencias() {
    if (!dados || dados.length < 30 || !computed || !computed.rsiValues) return [];
    const piv = acharPivotsSR();
    const rsi = computed.rsiValues;
    const out = [];
    const topo = _divLado(piv.res, rsi, 'topo');
    const fundo = _divLado(piv.sup, rsi, 'fundo');
    // só as recentes valem (último pivô nas ~15 velas finais)
    const recente = d => d && (dados.length - 1 - d.i1) <= 15;
    if (recente(topo)) out.push(topo);
    if (recente(fundo)) out.push(fundo);
    return out;
}
