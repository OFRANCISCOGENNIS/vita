// ============================================================================
// BLOCO 18 — DETALHE DA ENTRADA (um clique: motivos + gráfico + horários)
// ============================================================================
// Ao virar o veredito para CALL/PUT, guardamos um RETRATO da entrada (motivos,
// funil e as últimas velas). A notificação do navegador e cada linha do Registro
// abrem este painel: mostra TODOS os motivos, o mini-gráfico do momento e o
// horário de ENTRAR × SAIR (entrada + expiração). Estudo — nunca ordem.

let _ultimaEntradaIdx = -1;
let _detChart = null, _detSerie = null;
let _detIdx = -1;               // entrada aberta no painel (p/ o diário)

// ---- Diário da operação: nota + tags rápidas gravadas na entrada ----
const DET_TAGS = ['✅ plano seguido', '⚠️ fora do plano', '😤 emocional', '🎯 zona perfeita', '🌪 mercado ruim'];
function salvarNotaEntrada(idx, texto, tags) {
    const r = registro && registro[idx];
    if (!r) return false;
    if (texto != null) r.nota = texto.trim().slice(0, 500) || undefined;
    if (tags != null) r.tags = tags.length ? tags.slice(0, 5) : undefined;
    localStorage.setItem('registroEntradas', JSON.stringify(registro));
    renderRegistro();
    return true;
}
function _detRenderTags(r) {
    const box = document.getElementById('detTags');
    if (!box) return;
    const ativas = (r && r.tags) || [];
    box.innerHTML = DET_TAGS.map(t =>
        `<button type="button" class="det-tag${ativas.includes(t) ? ' det-tag-on' : ''}" data-tag="${t}">${t}</button>`).join('');
}

// ---- Retrato da entrada no instante da virada (guardado em registro[i].det) ----
function snapshotEntrada(verdictKey, gFull, fn) {
    const n = dados ? dados.length : 0;
    const entryPrice = n ? dados[n - 1].close : null;
    // fatores LIGADOS e para onde apontam agora (▲/▼/✓/—)
    const fatores = (confLive.fatores || []).filter(f => f.on).map(f => ({ nome: f.nome, dir: f.dir }));
    // os 6 elos do funil de qualidade no momento (true/false/null)
    let funil = null;
    if (fn) funil = [
        { rot: 'Regime', ok: fn.regimeOk },
        { rot: 'Confluência', ok: fn.confOk },
        { rot: 'Portões', ok: fn.portoesOk },
        { rot: 'Evidência', ok: fn.evidOk },
        { rot: 'Calibração', ok: fn.calibOk },
        { rot: 'Execução', ok: fn.execOk }
    ];
    // últimas 48 velas para o mini-gráfico (cópia enxuta OHLC)
    const velas = n ? dados.slice(-48).map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })) : [];
    // poda: só as ~20 entradas mais recentes guardam velas (limita o localStorage)
    try {
        const comVelas = registro.filter(r => r.det && r.det.velas);
        if (comVelas.length > 19) comVelas.slice(0, comVelas.length - 19).forEach(r => { delete r.det.velas; });
    } catch (e) { }
    // padrões de preço presentes no instante da virada (leitura de estudo)
    let padroes = [];
    try { if (typeof padroesAtuais === 'function') padroes = padroesAtuais().map(p => ({ nome: p.nome, dir: p.dir })); } catch (e) { }
    return {
        veredito: verdictKey, entryPrice, padroes,
        grade: gFull ? gFull.grade : null,
        score: gFull ? gFull.score : null,
        pEst: gFull ? gFull.pEst : null,
        pLB: gFull ? gFull.pLB : null,
        pN: gFull ? gFull.pN : null,
        expOp: gFull ? gFull.expOp : null,
        motivos: gFull && gFull.motivos ? gFull.motivos.slice() : [],
        fatores, funil,
        tf: typeof tfMinutes === 'function' ? tfMinutes() : null
    };
}

// ---- Abrir o painel de detalhe de uma entrada do Registro ----
function abrirDetalheEntrada(idx) {
    if (idx == null || idx < 0 || idx >= (registro ? registro.length : 0)) idx = _ultimaEntradaIdx;
    const r = registro && registro[idx];
    const modal = document.getElementById('detalheModal');
    if (!modal) return;
    if (!r) { if (typeof showToast === 'function') showToast('Entrada não encontrada no registro.', 'err'); return; }
    const d = r.det || {};
    const exp = r.exp || 5;
    const up = r.dir === 1;
    const dec = (d.entryPrice != null && d.entryPrice < 10) ? 5 : 2;

    // Cabeçalho: par · veredito · selo
    document.getElementById('detTitulo').innerHTML =
        `<span class="det-par">${r.par || '—'}</span>` +
        `<span class="det-verd ${up ? 'det-call' : 'det-put'}">${up ? '▲ CALL' : '▼ PUT'}</span>` +
        (d.grade ? `<span class="reg-grade grade-${d.grade}">${d.grade}</span>` : '') +
        (r.paper ? `<span class="det-badge">🎮 demo</span>` : '');

    // Horários: ENTRAR (virada) × SAIR (entrada + expiração)
    document.getElementById('detHorarios').innerHTML =
        `<div class="det-hbox det-in"><div class="det-hlbl">⏱ ENTRAR</div><div class="det-hval">${fmtHora(r.t)}</div></div>` +
        `<div class="det-harrow">→ ${exp}m →</div>` +
        `<div class="det-hbox det-out"><div class="det-hlbl">🏁 SAIR</div><div class="det-hval">${fmtHora(r.t + exp * 60)}</div></div>`;

    // Números-chave: preço de entrada, score, win rate estimado, expectativa
    const num = [];
    if (d.entryPrice != null) num.push(kv('Preço na entrada', d.entryPrice.toFixed(dec)));
    if (d.score != null) num.push(kv('Score de qualidade', d.score + '/100'));
    if (d.pEst != null) num.push(kv('Win rate estimado', pctTxt(d.pEst) + (d.pLB != null ? ' · LB ' + pctTxt(d.pLB) : '') + (d.pN ? ' (' + d.pN + ' ops)' : ''), d.pLB != null && d.pLB >= 0.535 ? 'kv-good' : ''));
    if (d.expOp != null) num.push(kv('Expectativa/op', (d.expOp >= 0 ? '+' : '') + d.expOp.toFixed(2), d.expOp >= 0 ? 'kv-good' : 'kv-bad'));
    num.push(kv('Fatores a favor', r.score + '/' + r.enabled));
    if (r.resultado) num.push(kv('Resultado', r.resultado === 'WIN' ? '✓ WIN' : '✗ LOSS', r.resultado === 'WIN' ? 'kv-good' : 'kv-bad'));
    document.getElementById('detNumeros').innerHTML = num.join('');

    // Motivos (fatores que dispararam + ressalvas do selo)
    const chips = (d.fatores || []).map(f => {
        const ic = f.dir === 1 ? '▲' : f.dir === -1 ? '▼' : f.dir === 2 ? '✓' : '—';
        // a favor da entrada = aponta na direção do veredito (ou ✓ genérico)
        const aFavor = f.dir === 2 || (up ? f.dir === 1 : f.dir === -1);
        return `<span class="det-chip ${aFavor ? 'det-chip-ok' : 'det-chip-nt'}">${f.nome} ${ic}</span>`;
    }).join('');
    // padrões de preço do instante (doji/harami/CHoCH/topo-fundo duplo/triângulo)
    const pats = (d.padroes || []).map(pt =>
        `<span class="det-chip det-chip-pat">${pt.dir === 1 ? '📈' : pt.dir === -1 ? '📉' : '◇'} ${pt.nome}</span>`).join('');
    document.getElementById('detFatores').innerHTML = (chips + pats) || '<span class="det-vazio">sem fatores gravados</span>';

    // Funil de qualidade (6 elos) no momento da entrada
    document.getElementById('detFunil').innerHTML = (d.funil || []).map(e => {
        const cls = e.ok === null || e.ok === undefined ? 'funil-nd' : e.ok ? 'funil-ok' : 'funil-no';
        const ic = e.ok === null || e.ok === undefined ? '·' : e.ok ? '✓' : '✕';
        return `<span class="funil-elo ${cls}">${ic} ${e.rot}</span>`;
    }).join('') || '<span class="det-vazio">funil não gravado</span>';

    // Ressalvas (por que NÃO era A, se houver)
    const rss = document.getElementById('detRessalvas');
    if (d.motivos && d.motivos.length) { rss.style.display = ''; rss.innerHTML = '⚠ ' + d.motivos.join(' · '); }
    else rss.style.display = 'none';

    // diário: nota + tags desta entrada
    _detIdx = idx;
    const nota = document.getElementById('detNota');
    if (nota) nota.value = r.nota || '';
    _detRenderTags(r);

    modal.style.display = 'flex';
    requestAnimationFrame(() => _detDesenharGrafico(r));
}

function fecharDetalhe() {
    const m = document.getElementById('detalheModal'); if (m) m.style.display = 'none';
    if (_detChart) { try { _detChart.remove(); } catch (e) { } _detChart = null; _detSerie = null; }
}

// ---- Mini-gráfico do momento da entrada ----
function _detDesenharGrafico(r) {
    const cont = document.getElementById('detGrafico');
    if (!cont || !window.LightweightCharts) return;
    if (_detChart) { try { _detChart.remove(); } catch (e) { } _detChart = null; _detSerie = null; }
    const velas = (r.det && r.det.velas) || [];
    if (!velas.length) { cont.innerHTML = '<div class="det-semgrafico">Sem velas guardadas para esta entrada (retrato antigo — só as 20 últimas guardam o gráfico).</div>'; return; }
    cont.innerHTML = '';
    const c = (typeof CORES_TEMA !== 'undefined' && typeof temaAtual === 'function') ? CORES_TEMA[temaAtual()] : { bg: '#0b0f17', text: '#c9d4e5', grid: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)' };
    _detChart = LightweightCharts.createChart(cont, {
        width: cont.clientWidth || 520, height: 240,
        layout: { background: { color: c.bg }, textColor: c.text },
        grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
        rightPriceScale: { borderColor: c.border },
        timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, tickMarkFormatter: t => fmtHora(t) },
        localization: { timeFormatter: t => fmtHora(t) },
        handleScroll: false, handleScale: false
    });
    _detSerie = _detChart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a',
        borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350'
    });
    _detSerie.setData(velas);
    const up = r.dir === 1;
    // seta da entrada na última vela (o instante da virada do veredito)
    _detSerie.setMarkers([{
        time: velas[velas.length - 1].time,
        position: up ? 'belowBar' : 'aboveBar',
        color: up ? '#22c55e' : '#ef4444',
        shape: up ? 'arrowUp' : 'arrowDown',
        text: up ? 'CALL' : 'PUT'
    }]);
    if (r.det && r.det.entryPrice != null) _detSerie.createPriceLine({
        price: r.det.entryPrice, color: '#eab308', lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: 'entrada'
    });
    _detChart.timeScale().fitContent();
}

// ---- Ligações de UI ----
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('detalheModal');
    if (modal) modal.addEventListener('click', e => { if (e.target.id === 'detalheModal') fecharDetalhe(); });
    // diário: nota salva sozinha (debounce) · tags alternam no clique
    const nota = document.getElementById('detNota');
    let notaTimer = null;
    if (nota) nota.addEventListener('input', () => {
        clearTimeout(notaTimer);
        notaTimer = setTimeout(() => { if (_detIdx >= 0) salvarNotaEntrada(_detIdx, nota.value, null); }, 600);
    });
    const tags = document.getElementById('detTags');
    if (tags) tags.addEventListener('click', e => {
        const b = e.target.closest('.det-tag');
        if (!b || _detIdx < 0 || !registro[_detIdx]) return;
        const atuais = (registro[_detIdx].tags || []).slice();
        const i = atuais.indexOf(b.dataset.tag);
        if (i >= 0) atuais.splice(i, 1); else atuais.push(b.dataset.tag);
        salvarNotaEntrada(_detIdx, null, atuais);
        _detRenderTags(registro[_detIdx]);
    });
    const x = document.getElementById('detFechar');
    if (x) x.addEventListener('click', fecharDetalhe);
    // clique numa linha do Registro abre o detalhe (delegação)
    const body = document.getElementById('registroBody');
    if (body) body.addEventListener('click', e => {
        const row = e.target.closest('.reg-row');
        if (!row || row.dataset.idx == null) return;
        abrirDetalheEntrada(parseInt(row.dataset.idx, 10));
    });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharDetalhe(); });
