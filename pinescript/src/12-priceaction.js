// ============================================================================
// BLOCO 17 — PRICE ACTION: ESTUDO DE ENTRADAS
// (Suporte/Resistência + Fibonacci + LTA/LTB + análise micro × macro)
// ============================================================================
// Leitura DESCRITIVA para estudo — não prevê o futuro. A tese ensinada aqui:
// a entrada de qualidade nasce no TESTE de uma zona onde vários níveis se
// somam (S/R + retração de fib + linha de tendência), a favor do alinhamento
// micro (estrutura do TF operado) × macro (TF maior / EMA200).

// ---- LTA/LTB (função pura) ----
// LTA = fundos ASCENDENTES ligados (suporte dinâmico); LTB = topos DESCENDENTES.
// Liga os 2 últimos pivôs que respeitam a direção, conta os TOQUES (pivôs a
// ≤ tolAtr·ATR da linha) e projeta o valor da linha na última vela.
function calcularLT(pivos, nBarras, tipo, tolAtr, atrV) {
    if (!pivos || pivos.length < 2) return null;
    const asc = tipo === 'LTA';
    let p0 = null, p1 = null;
    for (let k = pivos.length - 1; k >= 1 && !p0; k--) {
        for (let j = k - 1; j >= 0; j--) {
            if (asc ? pivos[k].price > pivos[j].price : pivos[k].price < pivos[j].price) { p1 = pivos[k]; p0 = pivos[j]; break; }
        }
    }
    if (!p0 || p1.i === p0.i) return null;
    const slope = (p1.price - p0.price) / (p1.i - p0.i);
    if (asc ? slope <= 0 : slope >= 0) return null;
    const valor = i => p0.price + slope * (i - p0.i);
    const tol = (atrV || 0) * (tolAtr || 0.35) || Math.abs(p1.price) * 0.001;
    // toques em QUALQUER pivô colinear (a linha se estende p/ trás): 3+ = LT validada
    const toques = pivos.filter(p => Math.abs(p.price - valor(p.i)) <= tol).length;
    return { tipo, i0: p0.i, p0: p0.price, i1: p1.i, p1: p1.price, slope, atual: valor(nBarras - 1), toques };
}

// ---- Zonas de confluência (função pura) ----
// Agrupa níveis a ≤ tol um do outro numa "zona"; quanto mais itens (S/R, fib,
// LTA/LTB) na mesma zona, mais forte ela é. Ordena da mais confluente p/ menos.
function zonasConfluencia(niveis, tol) {
    const ord = niveis.slice().sort((a, b) => a.preco - b.preco);
    const zonas = [];
    ord.forEach(nv => {
        const z = zonas[zonas.length - 1];
        if (z && Math.abs(nv.preco - z.preco) <= tol) {
            z.preco = (z.preco * z.n + nv.preco) / (z.n + 1);
            z.itens.push(nv.rotulo); z.n++;
        } else zonas.push({ preco: nv.preco, itens: [nv.rotulo], n: 1 });
    });
    return zonas.sort((a, b) => b.n - a.n);
}

// ---- Estrutura micro (topos/fundos do TF operado): HH·HL = alta, LH·LL = baixa ----
function estruturaMicro(piv) {
    const tops = piv.res.slice(-2), funds = piv.sup.slice(-2);
    if (tops.length < 2 || funds.length < 2) return 0;
    const hh = tops[1].price > tops[0].price, hl = funds[1].price > funds[0].price;
    return hh && hl ? 1 : (!hh && !hl) ? -1 : 0;
}

// ---- LTA/LTB traçadas no gráfico (séries de linha, junto do toggle 📐) ----
let serieLTA = null, serieLTB = null;
function tracarLTs(on) {
    [serieLTA, serieLTB].forEach(s => { if (s) { try { chartPreco.removeSeries(s); } catch (e) { } } });
    serieLTA = serieLTB = null;
    if (!on || !chartPreco || !dados || dados.length < 30 || !computed || !computed.atrValues) return;
    const piv = acharPivotsSR();
    const atrV = computed.atrValues[dados.length - 1] || 0;
    const lta = calcularLT(piv.sup, dados.length, 'LTA', 0.35, atrV);
    const ltb = calcularLT(piv.res, dados.length, 'LTB', 0.35, atrV);
    const mk = (lt, cor) => {
        const s = chartPreco.addLineSeries({ color: cor, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData([{ time: dados[lt.i0].time, value: lt.p0 }, { time: dados[dados.length - 1].time, value: lt.atual }]);
        return s;
    };
    if (lta) serieLTA = mk(lta, 'rgba(34, 197, 94, 0.65)');
    if (ltb) serieLTB = mk(ltb, 'rgba(239, 68, 68, 0.65)');
}

// ---- Painel 🧭: monta a leitura completa da entrada ----
function renderPriceAction() {
    const body = document.getElementById('paBody');
    if (!body || !dados || dados.length < 30 || !computed || !computed.atrValues) return;
    const n = dados.length, close = dados[n - 1].close;
    const atrV = computed.atrValues[n - 1] || close * 0.002;
    const piv = acharPivotsSR();
    const lta = calcularLT(piv.sup, n, 'LTA', 0.35, atrV);
    const ltb = calcularLT(piv.res, n, 'LTB', 0.35, atrV);

    // Níveis que entram nas zonas: 3 S/R de cada lado + fibs internas + LTA/LTB
    const niveis = [];
    piv.res.map(p => p.price).filter(p => p > close).sort((a, b) => a - b).slice(0, 3).forEach(p => niveis.push({ preco: p, rotulo: 'R' }));
    piv.sup.map(p => p.price).filter(p => p < close).sort((a, b) => b - a).slice(0, 3).forEach(p => niveis.push({ preco: p, rotulo: 'S' }));
    const fib = fibNiveis(dados);
    if (fib) fib.niveis.forEach(f => { if (f.k > 0 && f.k < 1) niveis.push({ preco: f.preco, rotulo: 'fib ' + Math.round(f.k * 1000) / 10 }); });
    if (lta) niveis.push({ preco: lta.atual, rotulo: 'LTA' });
    if (ltb) niveis.push({ preco: ltb.atual, rotulo: 'LTB' });
    const zonas = zonasConfluencia(niveis, atrV * 0.5);
    const zPerto = zonas.filter(z => Math.abs(z.preco - close) <= atrV * 0.8)[0] || null;

    // micro × macro: estrutura do TF operado vs TF maior (ou EMA200 c/ inclinação)
    const micro = estruturaMicro(piv);
    let macro = 0;
    if (htfTrend && htfTrend.length === n) macro = htfTrend[n - 1];
    else {
        const e2 = computed.ema200[n - 1], e2a = computed.ema200[n - 21];
        if (e2 != null && e2a != null) macro = (close > e2 && e2 > e2a) ? 1 : (close < e2 && e2 < e2a) ? -1 : 0;
    }
    const pat = padraoVela(n - 1);
    const dec = close < 10 ? 5 : 2;
    const rot = d => d === 1 ? '📈 alta' : d === -1 ? '📉 baixa' : '↔ neutra';
    // Padrões clássicos (doji/harami/CHoCH/topo-fundo duplo/triângulo-canal)
    let pads = [];
    try { if (typeof padroesAtuais === 'function') pads = padroesAtuais(); } catch (e) { }
    const padsTxt = pads.length ? pads.map(p => (p.dir === 1 ? '📈 ' : p.dir === -1 ? '📉 ' : '◇ ') + p.nome).join(' · ') : '—';
    const padsCls = pads.some(p => p.dir === 1) && !pads.some(p => p.dir === -1) ? 'kv-good'
        : pads.some(p => p.dir === -1) && !pads.some(p => p.dir === 1) ? 'kv-bad' : '';
    body.innerHTML =
        kv('Macro (TF maior / EMA200)', rot(macro), macro === 1 ? 'kv-good' : macro === -1 ? 'kv-bad' : '') +
        kv('Micro (estrutura do TF)', rot(micro) + (micro === 1 ? ' · HH+HL' : micro === -1 ? ' · LH+LL' : ''), micro === 1 ? 'kv-good' : micro === -1 ? 'kv-bad' : '') +
        kv('Alinhamento', micro !== 0 && micro === macro ? '✓ micro = macro' : '— divergentes', micro !== 0 && micro === macro ? 'kv-good' : '') +
        kv('LTA (fundos ascendentes)', lta ? lta.toques + ' toques · ' + lta.atual.toFixed(dec) : '—', lta ? 'kv-good' : '') +
        kv('LTB (topos descendentes)', ltb ? ltb.toques + ' toques · ' + ltb.atual.toFixed(dec) : '—', ltb ? 'kv-bad' : '') +
        kv('Zona de confluência', zPerto ? zPerto.n + '× em ' + zPerto.preco.toFixed(dec) + ' (' + zPerto.itens.join(' + ') + ')' : 'nenhuma a ≤0.8 ATR', zPerto && zPerto.n >= 2 ? 'kv-good' : '') +
        kv('Vela atual', pat.up ? 'reversão de alta' : pat.down ? 'reversão de baixa' : '—', pat.up ? 'kv-good' : pat.down ? 'kv-bad' : '') +
        kv('Padrões de preço', padsTxt, padsCls);

    // Leitura da ENTRADA (estudo descritivo, nunca ordem)
    let leitura;
    if (zPerto && zPerto.n >= 2) {
        const abaixo = zPerto.preco < close;
        const lado = abaixo ? 'SUPORTE' : 'RESISTÊNCIA';
        const vies = abaixo ? 'CALL' : 'PUT';
        const confirmou = (abaixo && pat.up) || (!abaixo && pat.down);
        leitura = `Preço a ${(Math.abs(close - zPerto.preco) / atrV).toFixed(1)} ATR de zona de ${lado} com ${zPerto.n} confluências (${zPerto.itens.join(' + ')}). ` +
            `Contexto de estudo p/ ${vies}: ${confirmou ? 'vela de reversão CONFIRMANDO o teste' : 'aguarde a vela de confirmação no teste da zona'}` +
            `${micro !== 0 && micro === macro ? ' · micro e macro alinhados ✓' : ' · micro × macro divergentes — reduza a expectativa'}.`;
    } else {
        leitura = 'Preço "no meio do nada" (sem zona a ≤0.8 ATR). Em price action a entrada de qualidade nasce no TESTE de uma zona de confluência — espere o preço chegar em S/R + fib + LT, não persiga.';
    }
    const le = document.getElementById('paLeitura'); if (le) le.textContent = '📖 ' + leitura;
    const meta = document.getElementById('paMeta'); if (meta) meta.textContent = zonas.filter(z => z.n >= 2).length + ' zonas fortes';
}
