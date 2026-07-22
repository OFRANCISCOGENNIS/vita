// ============================================================================
// BLOCO 28 — ZONAS S/R NO GRÁFICO + RÓTULOS DE ESTRUTURA + ANÁLISE MESTRE
// ============================================================================
// 1. Zonas de SUPORTE/RESISTÊNCIA (forte/média/fraca) desenhadas como FAIXAS
//    sombreadas sobre o gráfico (overlay posicionado por priceToCoordinate),
//    com rótulo "ZONA DE RESISTÊNCIA FORTE · 4 toques" como num gráfico
//    institucional. Força = nº de toques (3+ forte · 2 média · 1 fraca).
// 2. Rótulos HH/HL/LH/LL nos pivôs (marcadores da série de velas).
// 3. 🎓 ANÁLISE MESTRE: botão que gera a leitura completa do gráfico
//    (contexto, estrutura, tendências, zonas, pullback, liquidez, candles,
//    probabilidades, entradas/stops/alvos com RR, confluências, 3 cenários,
//    psicologia e notas) — calculada dos DADOS REAIS, nunca inventada.

let zonasSRAtivas = false, _zonasHooked = false;

// ---- Zonas por agrupamento de pivôs (toques = força) ----
function calcularZonasSR() {
    const piv = acharPivotsSR();
    const n = dados.length, close = dados[n - 1].close;
    const atrV = computed.atrValues[n - 1] || close * 0.002;
    const tol = atrV * 0.6;
    const cluster = pivos => {
        const zs = [];
        pivos.slice().sort((a, b) => a.price - b.price).forEach(p => {
            const z = zs.find(x => Math.abs(x.preco - p.price) <= tol);
            if (z) { z.preco = (z.preco * z.n + p.price) / (z.n + 1); z.n++; z.ultimoI = Math.max(z.ultimoI, p.i); }
            else zs.push({ preco: p.price, n: 1, ultimoI: p.i });
        });
        return zs;
    };
    const rot = z => z.n >= 3 ? 'FORTE' : z.n === 2 ? 'MÉDIA' : 'FRACA';
    const resist = cluster(piv.res).filter(z => z.preco > close).sort((a, b) => a.preco - b.preco)
        .slice(0, 2).map(z => ({ ...z, tipo: 'RESISTÊNCIA', forca: rot(z), meia: tol }));
    const supor = cluster(piv.sup).filter(z => z.preco < close).sort((a, b) => b.preco - a.preco)
        .slice(0, 2).map(z => ({ ...z, tipo: 'SUPORTE', forca: rot(z), meia: tol }));
    return { resist, supor, atrV, close };
}

// ---- Overlay: faixas sombreadas sobre o gráfico ----
// FLUIDEZ: pan/zoom dispara dezenas de eventos por segundo — coalesce em rAF
// (1 reposicionamento por frame, no máximo).
let _zonasRaf = false;
function reposicionarZonas() {
    if (_zonasRaf) return;
    _zonasRaf = true;
    requestAnimationFrame(() => { _zonasRaf = false; _reposicionarZonasAgora(); });
}
function _reposicionarZonasAgora() {
    const ov = document.getElementById('zonasOverlay');
    if (!ov || !dados || dados.length < 30 || !serieVelas || !computed || !computed.atrValues) return;
    const z = calcularZonasSR();
    const faixa = (zn, lado) => {
        const y1 = serieVelas.priceToCoordinate(zn.preco + zn.meia);
        const y2 = serieVelas.priceToCoordinate(zn.preco - zn.meia);
        if (y1 == null || y2 == null) return '';
        const forte = zn.forca === 'FORTE';
        const cor = lado === 'res'
            ? (forte ? 'rgba(239,68,68,0.13)' : 'rgba(239,68,68,0.05)')
            : (forte ? 'rgba(34,197,94,0.13)' : 'rgba(34,197,94,0.05)');
        const borda = lado === 'res' ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)';
        // rótulo CURTO, encostado na borda esquerda, num pill legível (não cobre as velas)
        const abrev = (lado === 'res' ? 'R' : 'S') + ' ' + (forte ? 'forte' : zn.forca === 'MÉDIA' ? 'média' : 'fraca');
        return `<div class="zona-faixa" style="top:${Math.min(y1, y2)}px;height:${Math.max(3, Math.abs(y2 - y1))}px;background:${cor};border-top:1px dashed ${borda};border-bottom:1px dashed ${borda};">` +
            `<span class="zona-rot" style="color:${borda}">${abrev} · ${zn.n}×</span></div>`;
    };
    ov.innerHTML = z.resist.map(x => faixa(x, 'res')).join('') + z.supor.map(x => faixa(x, 'sup')).join('');
}

function desenharZonasSR(on) {
    zonasSRAtivas = !!on;
    const cont = document.getElementById('chartPreco');
    let ov = document.getElementById('zonasOverlay');
    if (!on) { if (ov) ov.remove(); try { atualizarMarcadores(); } catch (e) { } return; }
    if (!ov && cont) { ov = document.createElement('div'); ov.id = 'zonasOverlay'; cont.appendChild(ov); }
    if (!_zonasHooked && typeof chartPreco !== 'undefined' && chartPreco) {
        _zonasHooked = true;
        chartPreco.timeScale().subscribeVisibleLogicalRangeChange(() => { if (zonasSRAtivas) reposicionarZonas(); });
        window.addEventListener('resize', () => { if (zonasSRAtivas) reposicionarZonas(); });
    }
    _reposicionarZonasAgora();   // ligar/desligar reflete na hora (sem esperar frame)
    try { atualizarMarcadores(); } catch (e) { }   // acrescenta HH/HL/LH/LL nos pivôs
}

// ---- Rótulos de estrutura (HH/HL/LH/LL) p/ os marcadores da série ----
function marcadoresEstrutura() {
    if (!dados || dados.length < 30) return [];
    const sw = estruturaSwings();
    let prevH = null, prevL = null;
    const out = [];
    sw.todos.forEach(p => {
        let r = null;
        if (p.tipo === 'H') { r = prevH == null ? null : p.price > prevH ? 'HH' : 'LH'; prevH = p.price; }
        else { r = prevL == null ? null : p.price > prevL ? 'HL' : 'LL'; prevL = p.price; }
        if (r && dados[p.i]) out.push({
            time: dados[p.i].time,
            position: p.tipo === 'H' ? 'aboveBar' : 'belowBar',
            color: p.tipo === 'H' ? (r === 'HH' ? '#22c55e' : '#ef4444') : (r === 'HL' ? '#22c55e' : '#ef4444'),
            shape: 'circle', size: 0, text: r
        });
    });
    return out;
}

// ============================================================================
// 🎓 ANÁLISE MESTRE — leitura completa calculada dos dados reais
// ============================================================================
function _amSec(titulo, corpo) { return `<section class="am-sec"><h3>${titulo}</h3>${corpo}</section>`; }
function _amFmt(v) { const c = dados[dados.length - 1].close; return (+v).toFixed(c < 10 ? 5 : 2); }

function gerarAnaliseMestre() {
    if (!dados || dados.length < 60 || !computed || !computed.atrValues) return '<p>Carregue dados primeiro (mín. 60 velas).</p>';
    const n = dados.length, last = n - 1, c = dados[last].close;
    const atrV = computed.atrValues[last] || c * 0.002;
    const lbl = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
    const sw = estruturaSwings();
    const ed = definirEstrutura(sw);
    const piv = acharPivotsSR();
    const micro = estruturaMicro(piv);
    const e2 = computed.ema200[last], e2a = computed.ema200[last - 21];
    const macro = (e2 != null && e2a != null) ? ((c > e2 && e2 > e2a) ? 1 : (c < e2 && e2 < e2a) ? -1 : 0) : 0;
    const lta = calcularLT(piv.sup, n, 'LTA', 0.35, atrV);
    const ltb = calcularLT(piv.res, n, 'LTB', 0.35, atrV);
    const z = calcularZonasSR();
    const rsi = computed.rsiValues[last];
    const atrR = computed.atrMedia[last] ? computed.atrValues[last] / computed.atrMedia[last] : 1;
    const pads = typeof padroesAtuais === 'function' ? padroesAtuais() : [];
    const pat = padraoVela(last);
    const cl = confLive, en = cl.enabled || 1;
    const dirDom = cl.long >= cl.short ? 1 : -1;
    const conf = Math.round(Math.max(cl.long, cl.short) / en * 100);
    let fn = null; try { fn = avaliarFunil(false); } catch (e) { }
    const rotD = d => d === 1 ? 'ALTA 📈' : d === -1 ? 'BAIXA 📉' : 'NEUTRA ↔';

    // pullback: retração da última perna
    const ultH = sw.todos.filter(p => p.tipo === 'H').slice(-1)[0];
    const ultL = sw.todos.filter(p => p.tipo === 'L').slice(-1)[0];
    let corr = null;
    if (ultH && ultL && ultH.price !== ultL.price) {
        corr = ed.dir === 1 ? (ultH.price - c) / (ultH.price - ultL.price) : (c - ultL.price) / (ultH.price - ultL.price);
        corr = Math.max(0, Math.min(1, corr));
    }
    const pull = corr == null ? '—' : corr < 0.15 ? 'sem retração (esticado)' : corr <= 0.38 ? 'MICRO pullback' : corr <= 0.62 ? 'MACRO pullback (saudável)' : 'correção PROFUNDA (estrutura em risco)';

    // entradas/stops/alvos p/ o lado da estrutura (ou da confluência, se neutra)
    const lado = ed.dir !== 0 ? ed.dir : dirDom;
    const zF = lado === 1 ? z.supor[0] : z.resist[0];        // zona a favor (defende a entrada)
    const zC1 = lado === 1 ? z.resist[0] : z.supor[0];       // 1º obstáculo = TP1
    const zC2 = lado === 1 ? z.resist[1] : z.supor[1];       // 2º = TP2
    let plano = '<p><em>Sem zonas suficientes p/ montar plano — espere o gráfico formar mais pivôs.</em></p>';
    if (zF && zC1) {
        const entrada = zF.preco + (lado === 1 ? zF.meia : -zF.meia);
        const stop = zF.preco - lado * (zF.meia + atrV * 0.5);
        const tp1 = zC1.preco - lado * zC1.meia;
        const tp2 = zC2 ? zC2.preco - lado * zC2.meia : null;
        const risco = Math.abs(entrada - stop);
        const rr1 = risco > 0 ? Math.abs(tp1 - entrada) / risco : 0;
        const rr2 = tp2 && risco > 0 ? Math.abs(tp2 - entrada) / risco : null;
        plano =
            `<div class="kv"><span>🎯 Entrada conservadora (teste da zona ${zF.forca.toLowerCase()})</span><b>${_amFmt(entrada)}</b></div>` +
            (lta && lado === 1 ? `<div class="kv"><span>🎯 Entrada moderada (teste da LTA · ${lta.toques} toques)</span><b>${_amFmt(lta.atual)}</b></div>` : '') +
            (ltb && lado === -1 ? `<div class="kv"><span>🎯 Entrada moderada (teste da LTB · ${ltb.toques} toques)</span><b>${_amFmt(ltb.atual)}</b></div>` : '') +
            `<div class="kv"><span>🎯 Entrada agressiva (a mercado, sem esperar o teste)</span><b>${_amFmt(c)} — só com vela de confirmação</b></div>` +
            `<div class="kv"><span>🛑 Stop técnico (além da zona + 0.5 ATR)</span><b>${_amFmt(stop)}</b></div>` +
            `<div class="kv"><span>🏁 TP1 (zona oposta mais próxima)</span><b>${_amFmt(tp1)} · RR 1:${rr1.toFixed(1)}</b></div>` +
            (tp2 ? `<div class="kv"><span>🏁 TP2 (segunda zona)</span><b>${_amFmt(tp2)} · RR 1:${rr2.toFixed(1)}</b></div>` : '') +
            `<p class="am-nota">💡 Parcial no TP1, resto corre pro TP2 com stop no 0×0. RR abaixo de 1:1.5 no TP1 = espere preço melhor. Em binárias o "RR" vem do payout — aqui os alvos servem de referência de força do movimento.</p>`;
    }

    // liquidez: pools = zonas com 2+ toques (equal highs/lows)
    const pools = [...z.resist, ...z.supor].filter(x => x.n >= 2);
    const liquidez = pools.length
        ? pools.map(x => `<div class="kv"><span>${x.tipo === 'RESISTÊNCIA' ? 'Equal highs (stops de venda acima)' : 'Equal lows (stops de compra abaixo)'}</span><b>${_amFmt(x.preco)} · ${x.n} toques</b></div>`).join('')
        : '<p>Sem pools claros (2+ toques no mesmo nível) no recorte atual.</p>';

    // notas 0–10 (heurísticas transparentes)
    const notas = {
        'Tendência': Math.round(conf / 10),
        'Estrutura': ed.dir !== 0 ? (/Virando/.test(ed.nome) ? 6 : 8) : /Compressão|Expansão/.test(ed.nome) ? 4 : 3,
        'Liquidez': Math.min(10, pools.length * 3),
        'Momentum': rsi != null ? Math.round(Math.min(10, Math.abs(rsi - 50) / 3)) : 5,
        'Pullback': corr == null ? 5 : corr <= 0.62 && corr >= 0.2 ? 8 : corr < 0.2 ? 4 : 3,
        'Confluência': fn ? Math.round(fn.okCount / 6 * 10) : 5,
        'Risco (10=controlado)': atrR > 1.6 ? 4 : atrR < 0.7 ? 5 : 8,
        'Prob. compra': Math.round(cl.long / en * 100) / 10,
        'Prob. venda': Math.round(cl.short / en * 100) / 10
    };
    notas['Qualidade geral'] = Math.round(Object.values(notas).reduce((s, v) => s + v, 0) / Object.keys(notas).length);

    const confls = [
        ['Tendência (micro=macro)', micro !== 0 && micro === macro],
        ['LTA válida (3+ toques)', !!(lta && lta.toques >= 3)],
        ['LTB válida (3+ toques)', !!(ltb && ltb.toques >= 3)],
        ['Pullback saudável', corr != null && corr >= 0.2 && corr <= 0.62],
        ['Estrutura definida', ed.dir !== 0],
        ['Zona forte por perto (≤1 ATR)', [...z.resist, ...z.supor].some(x => x.forca === 'FORTE' && Math.abs(x.preco - c) <= atrV)],
        ['Vela de confirmação', pat.up || pat.down],
        ['Padrão de preço presente', pads.length > 0],
        ['Funil ≥4/6', !!(fn && fn.okCount >= 4)]
    ];

    return [
        _amSec('1 · Contexto geral', `<p><strong>${lbl} · M${tfMinutes()}</strong> · Tendência principal (EMA200/21 barras): <strong>${rotD(macro)}</strong> · Secundária (estrutura de swings): <strong>${ed.nome}</strong> · Momentum: RSI ${rsi != null ? rsi.toFixed(0) : '—'} ${rsi > 55 ? '(comprador)' : rsi < 45 ? '(vendedor)' : '(neutro)'} · Volatilidade: ATR ${atrR.toFixed(2)}× a média ${atrR > 1.3 ? '— EXPANSÃO' : atrR < 0.75 ? '— consolidação' : '— normal'} · ${pull === '—' ? '' : 'Correção: ' + (corr * 100).toFixed(0) + '% (' + pull + ')'}</p><p class="am-nota">Fato observável: sequência de swings ${sw.rotulos.join('·') || '—'}. A conclusão de tendência vem daí + posição vs EMA200 — não de opinião.</p>`),
        _amSec('2 · Estrutura de mercado', `<div class="kv"><span>Últimos swings</span><b>${sw.rotulos.join(' · ') || '—'}</b></div><div class="kv"><span>Estrutura</span><b>${ed.nome}</b></div><div class="kv"><span>Micro (TF operado)</span><b>${rotD(micro)}</b></div><div class="kv"><span>Macro (EMA200)</span><b>${rotD(macro)}</b></div><div class="kv"><span>CHoCH</span><b>${/Virando/.test(ed.nome) ? '⚠ EM CURSO — ' + ed.nome : detectarCHoCH(piv, c) !== 0 ? 'sinalizado na última leitura' : 'não'}</b></div><p class="am-nota">HH+HL = compradores pagando mais caro e defendendo fundos mais altos. A QUEBRA do último fundo ascendente (CHoCH) é o primeiro aviso de que a mão forte mudou de lado.</p>`),
        _amSec('3 · Linhas de tendência', (lta ? `<div class="kv"><span>LTA (fundos ascendentes)</span><b>${lta.toques} toques · agora em ${_amFmt(lta.atual)} ${lta.toques >= 3 ? '— VÁLIDA' : '— só referência (2 toques)'}</b></div>` : '<div class="kv"><span>LTA</span><b>não há fundos ascendentes ligáveis</b></div>') + (ltb ? `<div class="kv"><span>LTB (topos descendentes)</span><b>${ltb.toques} toques · agora em ${_amFmt(ltb.atual)} ${ltb.toques >= 3 ? '— VÁLIDA' : '— só referência'}</b></div>` : '<div class="kv"><span>LTB</span><b>não há topos descendentes ligáveis</b></div>') + `<p class="am-nota">3+ toques validam a linha; ela PERDE validade com fechamento além dela + novo swing contra. Use como zona dinâmica de teste, nunca como gatilho sozinha.</p>`),
        _amSec('4 · Zonas de suporte e resistência', [...z.resist.map(x => `<div class="kv kv-bad"><span>ZONA DE RESISTÊNCIA ${x.forca}</span><b>${_amFmt(x.preco)} · ${x.n} toque${x.n > 1 ? 's' : ''}</b></div>`), ...z.supor.map(x => `<div class="kv kv-good"><span>ZONA DE SUPORTE ${x.forca}</span><b>${_amFmt(x.preco)} · ${x.n} toque${x.n > 1 ? 's' : ''}</b></div>`)].join('') + `<p class="am-nota">Força = nº de toques (3+ forte). Zona forte testada MUITAS vezes em pouco tempo enfraquece (liquidez consumida); zona forte + LT + fib no mesmo lugar = confluência institucional. Ligue 🟩 p/ ver as faixas no gráfico.</p>`),
        _amSec('5 · Pullback', `<div class="kv"><span>Retração da última perna</span><b>${corr == null ? '—' : (corr * 100).toFixed(0) + '%'}</b></div><div class="kv"><span>Classificação</span><b>${pull}</b></div><p class="am-nota">MICRO (≤38%): entrada de continuação curta. MACRO (38–62%): a entrada com mais segurança — o preço volta em zona relevante/LTA. &gt;62%: a "correção" já ameaça a estrutura — espere.</p>`),
        _amSec('6 · Liquidez', liquidez + `<p class="am-nota">Institucional executa ONDE HÁ STOPS: acima de equal highs e abaixo de equal lows. Sweep (mecha que varre o nível e volta) = coleta de liquidez, não rompimento — a armadilha clássica do varejo.</p>`),
        _amSec('7 · Candles agora', `<div class="kv"><span>Última vela</span><b>${pat.up ? 'reversão de ALTA (engolfo/martelo)' : pat.down ? 'reversão de BAIXA' : 'sem padrão de reversão'}</b></div>` + (pads.length ? pads.map(p => `<div class="kv"><span>${p.nome}</span><b>${p.dica}</b></div>`).join('') : '<div class="kv"><span>Padrões</span><b>nenhum no momento</b></div>')),
        _amSec('8 · Probabilidades (dados, não opinião)', `<div class="kv"><span>Confluência ao vivo</span><b>CALL ${cl.long}/${en} · PUT ${cl.short}/${en} (${conf}% p/ ${dirDom === 1 ? 'compra' : 'venda'})</b></div><div class="kv"><span>Funil de qualidade</span><b>${fn ? fn.okCount + '/6 elos' : '—'}</b></div><p class="am-nota">⚠ Probabilidade real só existe com amostra: veja o Registro (placar verificado) e a curva de calibração antes de confiar em %.</p>`),
        _amSec('9 · Plano de trade (lado da estrutura: ' + rotD(lado) + ')', plano),
        _amSec('10 · Confluências', confls.map(([nome, ok]) => `<div class="kv"><span>${ok ? '✔' : '✖'} ${nome}</span><b>${ok ? 'presente' : '—'}</b></div>`).join('') + `<p class="am-nota">${confls.filter(x => x[1]).length}/${confls.length} confluências — quanto mais, maior a probabilidade. Menos de 5: espere o gráfico montar o cenário.</p>`),
        _amSec('11 · Cenários', `<p><strong>📈 ALTA:</strong> preço testa ${z.supor[0] ? 'a zona de suporte ' + z.supor[0].forca.toLowerCase() + ' (' + _amFmt(z.supor[0].preco) + ')' : 'um suporte'}${lta ? ' ou a LTA' : ''} e imprime vela de reversão de alta → entrada no fechamento da confirmação, stop além da zona, alvo na resistência ${z.resist[0] ? '(' + _amFmt(z.resist[0].preco) + ')' : ''}.</p><p><strong>📉 BAIXA:</strong> perda da zona de suporte com fechamento + CHoCH (quebra do último HL) → entrada no reteste da zona perdida (que vira resistência), stop acima dela, alvo no próximo suporte.</p><p><strong>↔ LATERAL:</strong> ${/Compressão/.test(ed.nome) ? 'JÁ é o cenário atual (LH+HL) — ' : ''}opere só os extremos das zonas com confirmação, evite o meio do range, e espere o rompimento COM fechamento + reteste p/ mudar de estratégia.</p>`),
        _amSec('12 · Psicologia', `<p>A maioria compra rompimento esticado (sem pullback) e coloca stop óbvio ${pools.length ? 'nos pools listados acima' : 'no último swing'} — exatamente onde o institucional busca liquidez antes do movimento real. O profissional faz o contrário: ESPERA o teste da zona, exige a vela de confirmação e entra com o stop protegido pela estrutura, não pela dor.</p>`),
        _amSec('13 · Resumo — notas 0–10', '<table class="am-tabela">' + Object.keys(notas).map(k => `<tr><td>${k}</td><td><b>${notas[k]}</b></td><td><span class="am-barra"><span style="width:${Math.min(10, notas[k]) * 10}%"></span></span></td></tr>`).join('') + '</table>' + `<p class="am-nota">⚠ FERRAMENTA DE ESTUDO. Notas são heurísticas transparentes sobre o recorte atual — não previsão. Fatos = swings/zonas/toques medidos; hipóteses = cenários (cada um diz o que o confirmaria).</p>`)
    ].join('');
}

function abrirAnaliseMestre() {
    const m = document.getElementById('analiseModal');
    if (!m) return;
    document.getElementById('analiseBody').innerHTML = gerarAnaliseMestre();
    m.style.display = 'flex';
}

// ---- Ligações ----
document.addEventListener('DOMContentLoaded', function () {
    const tg = document.getElementById('zonasAtivo');
    if (tg) tg.addEventListener('change', function () {
        desenharZonasSR(this.checked);
        showToast(this.checked ? '🟩 Zonas de S/R desenhadas — força = nº de toques' : 'Zonas removidas', 'info');
    });
    // Botões de 1 clique no cabeçalho do gráfico (espelham os toggles do painel)
    const espelho = (btnId, chkId) => {
        const b = document.getElementById(btnId), chk = document.getElementById(chkId);
        if (!b || !chk) return;
        const pintar = () => b.classList.toggle('is-active', chk.checked);
        b.addEventListener('click', () => { chk.checked = !chk.checked; chk.dispatchEvent(new Event('change')); pintar(); });
        chk.addEventListener('change', pintar);
        pintar();
    };
    espelho('btnZonasChart', 'zonasAtivo');
    espelho('btnNiveisChart', 'niveisAtivo');
    // Estado persistido (BOOT_IDS): reaplica as zonas assim que os dados chegarem
    if (tg && tg.checked) {
        const t = setInterval(() => {
            if (dados && dados.length >= 30 && computed && computed.atrValues) { clearInterval(t); desenharZonasSR(true); }
        }, 800);
        setTimeout(() => clearInterval(t), 60000);
    }
    const b = document.getElementById('btnAnalise');
    if (b) b.addEventListener('click', abrirAnaliseMestre);
    const bT = document.getElementById('btnAnaliseTop');   // atalho na barra superior
    if (bT) bT.addEventListener('click', abrirAnaliseMestre);
    // ⛶: alterna a altura do gráfico principal (padrão 1200px ↔ compacto 500px)
    const bM = document.getElementById('btnChartMax');
    if (bM) {
        const pintarM = () => {
            const grande = localStorage.getItem('chartAlto') !== '0';
            bM.classList.toggle('is-active', grande);
            bM.textContent = grande ? '⛶ Reduzir gráfico' : '⛶ Ampliar gráfico';
        };
        bM.addEventListener('click', () => {
            localStorage.setItem('chartAlto', localStorage.getItem('chartAlto') === '0' ? '1' : '0');
            pintarM();
            window.dispatchEvent(new Event('resize'));           // reaplica altura/largura
            if (zonasSRAtivas) requestAnimationFrame(reposicionarZonas);
        });
        pintarM();
    }
    const x = document.getElementById('analiseFechar');
    if (x) x.addEventListener('click', () => document.getElementById('analiseModal').style.display = 'none');
    const m = document.getElementById('analiseModal');
    if (m) m.addEventListener('click', e => { if (e.target.id === 'analiseModal') m.style.display = 'none'; });
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const m = document.getElementById('analiseModal'); if (m) m.style.display = 'none'; }
});
