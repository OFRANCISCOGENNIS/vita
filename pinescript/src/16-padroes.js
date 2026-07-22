// ============================================================================
// BLOCO 21 — PADRÕES DE PREÇO (doji, harami, CHoCH, topo/fundo duplo, triângulo/canal)
// ============================================================================
// Fase 2 do endurecimento: detecção DESCRITIVA de padrões clássicos. Eles NÃO
// entram na pontuação de confluência (decisão da auditoria: padrão sem contexto
// vira ruído) — aparecem no painel 🧭 e no retrato da entrada como leitura de
// estudo, para o operador confirmar o contexto com os olhos.

// ---- Doji: corpo ≤10% do range da vela (indecisão) ----
function ehDoji(o, h, l, c) {
    const range = h - l;
    if (range <= 0) return false;
    return Math.abs(c - o) <= range * 0.1;
}

// ---- Harami: corpo atual pequeno (≤60%) DENTRO do corpo anterior grande ----
// prev de baixa + atual de alta = harami de alta (1); o inverso = de baixa (-1)
function ehHarami(prev, cur) {
    const corpoPrev = Math.abs(prev.close - prev.open);
    const corpoCur = Math.abs(cur.close - cur.open);
    if (corpoPrev <= 0 || corpoCur > corpoPrev * 0.6) return 0;
    const hiPrev = Math.max(prev.open, prev.close), loPrev = Math.min(prev.open, prev.close);
    if (Math.max(cur.open, cur.close) > hiPrev || Math.min(cur.open, cur.close) < loPrev) return 0;
    if (prev.close < prev.open && cur.close > cur.open) return 1;
    if (prev.close > prev.open && cur.close < cur.open) return -1;
    return 0;
}

// ---- Topo/fundo duplo: 2 últimos pivôs do mesmo lado no MESMO nível (±tol) ----
// Exige distância mínima de 5 barras entre os pivôs (senão é o mesmo teste).
function topoFundoDuplo(piv, tol) {
    const r = piv.res.slice(-2), s = piv.sup.slice(-2);
    if (r.length === 2 && Math.abs(r[1].price - r[0].price) <= tol && r[1].i - r[0].i >= 5)
        return { tipo: 'topo duplo', dir: -1, preco: (r[0].price + r[1].price) / 2 };
    if (s.length === 2 && Math.abs(s[1].price - s[0].price) <= tol && s[1].i - s[0].i >= 5)
        return { tipo: 'fundo duplo', dir: 1, preco: (s[0].price + s[1].price) / 2 };
    return null;
}

// ---- CHoCH (change of character): a estrutura vigente quebra ----
// Alta (HH+HL) + fechamento ABAIXO do último fundo ascendente → CHoCH de baixa.
// Baixa (LH+LL) + fechamento ACIMA do último topo descendente → CHoCH de alta.
function detectarCHoCH(piv, close) {
    const tops = piv.res.slice(-2), funds = piv.sup.slice(-2);
    if (tops.length < 2 || funds.length < 2) return 0;
    const hh = tops[1].price > tops[0].price, hl = funds[1].price > funds[0].price;
    if (hh && hl && close < funds[1].price) return -1;
    if (!hh && !hl && close > tops[1].price) return 1;
    return 0;
}

// ---- Triângulo / canal (sobre as LTs do bloco 17) ----
// LTA (fundos sobem) + LTB (topos caem) juntas = convergência → triângulo.
// Só LTA com topos também subindo em inclinação parecida (±50%) → canal de alta;
// espelho para canal de baixa.
function trianguloOuCanal(piv, nBarras, atrV) {
    const lta = calcularLT(piv.sup, nBarras, 'LTA', 0.35, atrV);
    const ltb = calcularLT(piv.res, nBarras, 'LTB', 0.35, atrV);
    if (lta && ltb) return { tipo: 'triângulo (convergência)', dir: 0 };
    const slope2 = ps => ps.length >= 2 ? (ps[ps.length - 1].price - ps[ps.length - 2].price) / (ps[ps.length - 1].i - ps[ps.length - 2].i) : null;
    if (lta) {
        const st = slope2(piv.res);
        if (st != null && st > 0 && Math.abs(st - lta.slope) <= Math.max(st, lta.slope) * 0.5)
            return { tipo: 'canal de alta', dir: 1 };
    }
    if (ltb) {
        const sf = slope2(piv.sup);
        if (sf != null && sf < 0 && Math.abs(sf - ltb.slope) <= Math.abs(Math.min(sf, ltb.slope)) * 0.5)
            return { tipo: 'canal de baixa', dir: -1 };
    }
    return null;
}

// ---- Padrões na última vela (agrega tudo p/ painel 🧭 e retrato da entrada) ----
function padroesAtuais() {
    if (!dados || dados.length < 30 || !computed || !computed.atrValues) return [];
    const n = dados.length, cur = dados[n - 1], prev = dados[n - 2];
    const atrV = computed.atrValues[n - 1] || cur.close * 0.002;
    const piv = acharPivotsSR();
    const out = [];
    if (ehDoji(cur.open, cur.high, cur.low, cur.close))
        out.push({ nome: 'Doji', dir: 0, dica: 'indecisão — espere a vela de confirmação' });
    const h = ehHarami(prev, cur);
    if (h) out.push({ nome: h === 1 ? 'Harami de alta' : 'Harami de baixa', dir: h, dica: 'corpo pequeno dentro do corpo anterior — possível reversão' });
    const td = topoFundoDuplo(piv, atrV * 0.5);
    if (td) out.push({ nome: td.tipo === 'topo duplo' ? 'Topo duplo' : 'Fundo duplo', dir: td.dir, dica: '2 pivôs no mesmo nível (±0.5 ATR) — nível defendido' });
    const ch = detectarCHoCH(piv, cur.close);
    if (ch) out.push({ nome: ch === 1 ? 'CHoCH de alta' : 'CHoCH de baixa', dir: ch, dica: 'quebra de caráter — a estrutura vigente falhou' });
    const tc = trianguloOuCanal(piv, n, atrV);
    if (tc) out.push({ nome: tc.tipo, dir: tc.dir, dica: 'formação de linhas de tendência — espere o rompimento/teste' });
    // Divergências RSI × preço (bloco 36) — entram na mesma leitura descritiva
    try {
        if (typeof detectarDivergencias === 'function') detectarDivergencias().forEach(dv =>
            out.push({ nome: dv.tipo, dir: dv.dir, dica: dv.oculta ? 'RSI diverge — sinal de CONTINUAÇÃO da tendência' : 'RSI não confirma o novo extremo — possível reversão' }));
    } catch (e) { }
    return out;
}
