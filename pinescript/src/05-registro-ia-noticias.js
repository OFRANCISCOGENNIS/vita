// ============================================================================
// BLOCO 8.5 — REGISTRO DE ENTRADAS (gráfico timeline: horário + par de moedas)
// ============================================================================

let registro = JSON.parse(localStorage.getItem('registroEntradas') || '[]');
let chartRegistro = null, serieRegistro = null;

function registrarEntrada(par, dir, score, enabled, extra) {
    let t = Math.floor(Date.now() / 1000);
    if (registro.length && t <= registro[registro.length - 1].t) t = registro[registro.length - 1].t + 1;
    registro.push(Object.assign({ t, par, dir, score, enabled }, extra || {}));
    if (registro.length > 200) registro = registro.slice(-200);
    localStorage.setItem('registroEntradas', JSON.stringify(registro));
}

function renderRegistro() {
    const panel = document.getElementById('registroPanel');
    if (!registro.length) { panel.style.display = 'none'; return; }
    panel.style.display = 'flex';
    if (!chartRegistro) {
        chartRegistro = LightweightCharts.createChart(document.getElementById('chartRegistro'), { ...opcoesBase(), height: 70 });
        serieRegistro = chartRegistro.addLineSeries({ color: 'rgba(120,120,120,0.35)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        chartRegistro.priceScale('right').applyOptions({ visible: false });
    }
    // Notícias dentro da janela do registro entram como marcadores ⚡ na timeline
    const tMin = registro[0].t - 3600, tMax = registro[registro.length - 1].t + 3600;
    const news = noticias
        .map(n => ({ t: Math.floor(n.date.getTime() / 1000), title: n.title }))
        .filter(n => n.t >= tMin && n.t <= tMax);
    const times = [...new Set([...registro.map(r => r.t), ...news.map(n => n.t)])].sort((a, b) => a - b);
    serieRegistro.setData(times.map(t => ({ time: t, value: 0 })));
    serieRegistro.setMarkers([
        ...registro.map(r => ({
            time: r.t,
            position: r.dir === 1 ? 'aboveBar' : 'belowBar',
            color: r.dir === 1 ? '#26a69a' : '#ef5350',
            shape: r.dir === 1 ? 'arrowUp' : 'arrowDown'
            // sem texto: as setas ficam limpas na horizontal (par/grade aparecem na tabela abaixo)
        })),
        ...news.map(n => ({ time: n.t, position: 'inBar', color: '#fab219', shape: 'circle', text: '⚡' }))
    ].sort((a, b) => a.time - b.time));
    chartRegistro.timeScale().fitContent();
    document.getElementById('registroMeta').textContent =
        registro.length + ' entrada' + (registro.length > 1 ? 's' : '') + (news.length ? ' · ⚡ ' + news.length + ' notícias' : '');
    document.getElementById('registroBody').innerHTML = registro.slice().reverse().map(r => {
        const res = r.resultado === 'WIN' ? '<span class="reg-res reg-win" title="acertou">✓</span>'
            : r.resultado === 'LOSS' ? '<span class="reg-res reg-loss" title="errou">✗</span>'
            : (r.exp && r.t + r.exp * 60 > Math.floor(Date.now() / 1000)) ? '<span class="reg-res reg-open" title="aguardando expiração">⏳</span>' : '';
        return `<div class="reg-row"><span class="reg-hora">${fmtHora(r.t)}</span>` +
            `<span class="reg-par">${r.par}${r.live ? ' <span class="reg-tag">IA ao vivo</span>' : ''}</span>` +
            (r.grade ? `<span class="reg-grade grade-${r.grade}">${r.grade}</span>` : '') +
            `<span class="${r.dir === 1 ? 'chip-dir-up' : 'chip-dir-down'}">${r.dir === 1 ? '▲ CALL' : '▼ PUT'} ${r.score}/${r.enabled}</span>${res}</div>`;
    }).join('');
    atualizarCalibracaoIA();
}

// ---- Verificador automático de WIN/LOSS ----
// Passada a expiração, resolve o desfecho de cada entrada do registro comparando
// o preço na entrada × na expiração. Usa as velas do par aberto (qualquer fonte)
// ou busca uma janela 1m na Binance para pares não abertos. Persiste o resultado.
function _desfechoPelasVelas(r, velas) {
    const alvo = r.t + r.exp * 60;
    if (!velas.length || velas[velas.length - 1].time < alvo) return null;   // ainda não expirou nessas velas
    let iE = -1, iA = -1;
    for (let i = 0; i < velas.length; i++) { if (velas[i].time <= r.t) iE = i; if (velas[i].time <= alvo) iA = i; }
    if (iE < 0 || iA <= iE) return null;
    const dif = velas[iA].close - velas[iE].close;
    if (dif === 0) return null;                            // empate não conta
    return (r.dir === 1) === (dif > 0) ? 'WIN' : 'LOSS';
}
async function klinesBinanceJanela(sym, t0, t1) {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${sym}&interval=1m&startTime=${t0 * 1000}&endTime=${t1 * 1000}&limit=1000`;
    const resp = await fetch(url); if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return (await resp.json()).map(k => ({ time: Math.floor(k[0] / 1000), close: +k[4] }));
}
let verificando = false;
async function verificarEntradasPendentes() {
    if (verificando) return; verificando = true;
    try {
        const agora = Math.floor(Date.now() / 1000);
        const lblAberto = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
        let mudou = false;
        // 1) par aberto (qualquer fonte): resolve com as velas já carregadas
        if (dados.length) for (const r of registro) {
            if (r.resultado || !r.exp || (r.t + r.exp * 60) >= agora - 3 || r.par !== lblAberto) continue;
            const d = _desfechoPelasVelas(r, dados); if (d) { r.resultado = d; mudou = true; }
        }
        // 2) pares Binance não abertos: busca janela 1m (agrupado por símbolo, 1 req cada)
        const pend = registro.filter(r => !r.resultado && r.exp && r.sym && r.fonte === 'binance' && (r.t + r.exp * 60) < agora - 3);
        const porSym = {}; pend.forEach(r => (porSym[r.sym] = porSym[r.sym] || []).push(r));
        for (const sym of Object.keys(porSym)) {
            const ents = porSym[sym];
            const t0 = Math.min(...ents.map(e => e.t)) - 120;
            const t1 = Math.min(agora, Math.max(...ents.map(e => e.t + e.exp * 60)) + 120);
            let velas; try { velas = await klinesBinanceJanela(sym, t0, t1); } catch (e) { continue; }
            if (!velas || !velas.length) continue;
            ents.forEach(r => { const d = _desfechoPelasVelas(r, velas); if (d) { r.resultado = d; mudou = true; } });
        }
        if (mudou) { localStorage.setItem('registroEntradas', JSON.stringify(registro)); renderRegistro(); }
    } finally { verificando = false; }
}

// ---- Calibração da IA: acerto PREVISTO (backtest) × acerto REAL (verificado) ----
function atualizarCalibracaoIA() {
    const cal = document.getElementById('iaCalib');
    if (!cal) return;
    const cc = iaCache[symbolAtual() + '|' + regimeUltimo()] || iaCache[symbolAtual()];
    const res = registro.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS');
    if (res.length < 3) { cal.style.display = 'none'; return; }
    const wins = res.filter(r => r.resultado === 'WIN').length;
    const real = wins / res.length;
    cal.style.display = 'block';
    let txt = `📊 Placar real: <strong>${wins}/${res.length}</strong> (${Math.round(real * 100)}% acerto)`;
    if (cc) {
        const dif = Math.abs(real - cc.wr);
        txt += ` · IA previu ${Math.round(cc.wr * 100)}% <span class="${dif <= 0.10 ? 'chip-dir-up' : 'chip-dir-down'}">${dif <= 0.10 ? 'calibrada ✓' : 'descalibrada ⚠'}</span>`;
    }
    cal.innerHTML = txt;
}

// ============================================================================
// BLOCO 8.6 — IA / OTIMIZADOR (busca os parâmetros com maior índice de acerto)
// ============================================================================
// Faz uma busca em grade sobre os parâmetros de confluência no histórico já
// carregado do par atual, avalia a taxa de acerto (WIN/LOSS) de cada combinação
// e ranqueia as de melhor desempenho. Reaproveita recomputar*/entradas.

const IA_GRID = {
    minScore: [3, 4, 5],
    rsi: [[30, 70], [35, 65], [25, 75]],
    estruturaLookback: [10, 20, 30],
    cooldownVelas: [3, 5]
};
const IA_MIN_OPS = 6;    // amostra mínima no TREINO
const IA_MIN_VAL = 3;    // amostra mínima na VALIDAÇÃO (out-of-sample)
const IA_VELAS = 500;    // histórico por TF na otimização (mais amostra = validação mais confiável)
let iaCancelar = false, iaRodando = false, autoReoptTimer = null;

// Melhores parâmetros memorizados por par (usados pelo scanner). Persistente.
let iaCache = JSON.parse(localStorage.getItem('iaCache') || '{}');

function statsEnt(ents) {
    const av = ents.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    const w = av.filter(e => e.resultado === 'WIN').length;
    return { ops: av.length, w, wr: av.length ? w / av.length : 0 };
}

// Avalia a combinação já aplicada (inputs) sobre o `dados` atual — walk-forward
// ROBUSTO: treino nos primeiros 55% e validação em 3 janelas deslizantes
// (55–70%, 70–85%, 85–100%). robustVal = pior janela com amostra — um parâmetro
// que só funciona num pedaço da validação (sorte) não passa mais.
function avaliarWalkForward() {
    recomputarIndicadores(); recomputarSinais(); recomputarEntradas();
    const n = dados.length;
    const treino = statsEnt(entradas.filter(e => e.index < Math.floor(n * 0.55)));
    const folds = [[0.55, 0.70], [0.70, 0.85], [0.85, 1.001]].map(([a, b]) =>
        statsEnt(entradas.filter(e => e.index >= Math.floor(n * a) && e.index < Math.floor(n * b))));
    const w = folds.reduce((s, f) => s + f.w, 0), ops = folds.reduce((s, f) => s + f.ops, 0);
    const comAmostra = folds.filter(f => f.ops >= 2);
    const robustVal = comAmostra.length ? Math.min(...comAmostra.map(f => f.wr)) : (ops ? w / ops : 0);
    return { treino, val: { ops, w, wr: ops ? w / ops : 0 }, robustVal };
}

// Otimiza UM símbolo: varre a grade × timeframes e devolve o melhor combo por TF
// (ordenado por edge líquido), já gravando o campeão em iaCache (geral + por regime).
// Muda `dados`/inputs temporariamente — quem chama é responsável por restaurar.
// Coopera com a UI: cede a thread a cada 10 combos e respeita `iaCancelar`.
async function _iaOtimizarSimbolo(symbol, isSim, dSimBase, beWR, EXP_OPCOES, el) {
    const tfs = isSim ? [tfMinutes()] : TFS_IA;
    const porTf = [];
    let totalCombos = 0, regSym = null;
    for (const tf of tfs) {
        if (iaCancelar) break;
        let dTf = dSimBase;
        if (!isSim) {
            try { dTf = await carregarHistoricoTF(symbol, tf, IA_VELAS); } catch (e) { continue; }
            if (!dTf || dTf.length < 210) continue;
        }
        dados = dTf; el('timeframe').value = tf;
        // Regime do ativo (medido no primeiro TF carregado) — indexa o iaCache por regime
        if (regSym == null) { recomputarIndicadores(); regSym = regimeUltimo(); }
        const exps = EXP_OPCOES.filter(e => e >= tf && e % tf === 0 && e / tf <= 12);
        let combos = [];
        for (const exp of exps)
            for (const ms of IA_GRID.minScore)
                for (const [sv, sc] of IA_GRID.rsi)
                    for (const lk of IA_GRID.estruturaLookback)
                        for (const cd of IA_GRID.cooldownVelas)
                            combos.push({ exp, ms, sv, sc, lk, cd });
        // Busca inteligente: amostra aleatória da grade (qualidade quase igual,
        // ~1/3 do tempo). O melhor combo já conhecido do par entra sempre.
        if (document.getElementById('iaRapida').checked && combos.length > 72) {
            for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [combos[i], combos[j]] = [combos[j], combos[i]]; }
            combos = combos.slice(0, 72);
            const cc = iaCache[symbol + '|' + regSym] || iaCache[symbol];
            if (cc && exps.includes(cc.exp)) combos.push({ exp: cc.exp, ms: cc.ms, sv: cc.sv, sc: cc.sc, lk: cc.lk, cd: cc.cd });
        }
        let best = null, n = 0;
        for (const c of combos) {
            if (iaCancelar) break;
            el('minScore').value = c.ms; el('rsiSobrevenda').value = c.sv; el('rsiSobrecompra').value = c.sc;
            el('estruturaLookback').value = c.lk; el('cooldownVelas').value = c.cd;
            expOverride = c.exp;
            const wf = avaliarWalkForward();
            expOverride = null;
            totalCombos++;
            if (++n % 10 === 0) await new Promise(r => setTimeout(r, 0));   // deixa a UI respirar
            if (wf.treino.ops < IA_MIN_OPS || wf.val.ops < IA_MIN_VAL) continue;
            // robustez = pior janela entre treino e as fatias da validação (anti-overfit)
            const robust = Math.min(wf.treino.wr, wf.robustVal);
            if (!best || robust > best.robust || (robust === best.robust && wf.val.ops > best.val.ops))
                best = { tf, exp: c.exp, ms: c.ms, sv: c.sv, sc: c.sc, lk: c.lk, cd: c.cd, robust, treino: wf.treino, val: wf.val };
        }
        if (best) porTf.push(best);
    }
    // ranqueia pelo EDGE LÍQUIDO fora da amostra (acerto − break-even do payout)
    porTf.forEach(r => r.edge = r.val.wr - beWR);
    porTf.sort((a, b) => b.edge - a.edge || b.robust - a.robust);
    if (porTf.length) {
        const rec = porTf[0];
        const reg = { tf: rec.tf, exp: rec.exp, ms: rec.ms, sv: rec.sv, sc: rec.sc, lk: rec.lk, cd: rec.cd, wr: rec.val.wr, reg: regSym };
        iaCache[symbol] = reg;                                  // fallback geral
        if (regSym) iaCache[symbol + '|' + regSym] = reg;       // conjunto específico do regime
    }
    return { porTf, totalCombos };
}

const edgeTxtIA = e => (e >= 0 ? '+' : '') + (e * 100).toFixed(1) + ' pp';

async function otimizarIA() {
    const isSim = fonte() === 'sim';
    if (isSim && (!dados || dados.length < 210)) { showToast('Carregue um par primeiro (mín. ~210 velas).', 'err'); return; }
    const btn = document.getElementById('btnIA');
    const el = id => document.getElementById(id);

    // No modo Simulado não há dados por símbolo — otimiza só o par atual.
    // Nas fontes ao vivo, otimiza as moedas marcadas no checklist "🎯 Moedas p/ análise".
    let symbols;
    if (isSim) symbols = [symbolAtual()];
    else {
        symbols = scanUniverse().filter(scanChecked);
        if (!symbols.length) {
            showToast('Marque ao menos uma moeda em "🎯 Moedas p/ análise" (ou troque a Fonte para Simulado).', 'err');
            return;
        }
    }

    iaRodando = true; iaCancelar = false;
    const fimIA = () => { iaRodando = false; iaCancelar = false; btn.disabled = false; btn.textContent = '🤖 IA: otimizar parâmetros'; };
    btn.textContent = 'Analisando…';
    const ids = ['minScore', 'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas', 'confMode', 'timeframe', 'useHtf', 'usePesoIA', 'symbol', 'fonte'];
    const save = {}; ids.forEach(i => save[i] = el(i).type === 'checkbox' ? el(i).checked : el(i).value);
    el('confMode').value = 'score';
    el('useHtf').checked = false; htfTrend = [];   // HTF não se aplica ao backtest da grade
    el('usePesoIA').checked = false;               // peso é circular na otimização — desliga
    const dSave = dados;

    // Break-even do payout: a IA otimiza o edge LÍQUIDO (acerto − break-even),
    // não o acerto bruto — 52% a payout 87% ainda é prejuízo.
    const payout = Math.max(0.01, (parseFloat(el('payout').value) || 87) / 100);
    const beWR = 1 / (1 + payout);
    const EXP_OPCOES = [1, 5, 15, 30, 60];   // valores do seletor de expiração

    document.getElementById('iaPanel').style.display = 'block';
    const resultados = [];   // { symbol, label, porTf, totalCombos }
    let totalCombosGeral = 0;
    for (let k = 0; k < symbols.length; k++) {
        if (iaCancelar) break;
        const s = symbols[k];
        btn.textContent = `⏹ ${scanLabel(s)} (${k + 1}/${symbols.length}) — clique p/ cancelar`;
        document.getElementById('iaMeta').textContent = `Otimizando ${k + 1}/${symbols.length} moeda(s)…`;
        const { porTf, totalCombos } = await _iaOtimizarSimbolo(s, isSim, dSave, beWR, EXP_OPCOES, el);
        totalCombosGeral += totalCombos;
        resultados.push({ symbol: s, label: scanLabel(s), porTf, totalCombos });
    }
    localStorage.setItem('iaCache', JSON.stringify(iaCache));

    // restaura estado do usuário
    ids.forEach(i => { if (el(i).type === 'checkbox') el(i).checked = save[i]; else el(i).value = save[i]; });
    dados = dSave; recomputarIndicadores();
    if (el('useHtf').checked) await carregarHtf();
    recomputarSinais();

    if (iaCancelar) showToast('⏹ Otimização cancelada — resultados parciais mantidos', 'info');
    document.getElementById('iaMeta').textContent = totalCombosGeral + ' combinações · ' + symbols.length + ' moeda(s) · break-even ' + (beWR * 100).toFixed(1) + '%';

    if (symbols.length === 1) { renderIAUmPar(resultados[0], isSim, el); fimIA(); return; }

    // ---- VISÃO MULTI-MOEDA: um resultado por moeda (o melhor combo de cada) ----
    const comOk = resultados.filter(r => r.porTf.length);
    const semOk = resultados.filter(r => !r.porTf.length);
    comOk.sort((a, b) => b.porTf[0].edge - a.porTf[0].edge);
    if (!comOk.length) {
        document.getElementById('iaContext').textContent = `Nenhuma das ${symbols.length} moedas passou na validação fora da amostra. Aumente as velas (300+) ou reduza a seleção.`;
        document.getElementById('iaList').innerHTML = '';
        fimIA(); return;
    }
    document.getElementById('iaContext').textContent =
        `${comOk.length}/${symbols.length} moedas afinadas — o Scanner (🔎) já usa esses parâmetros. Melhor: ${comOk[0].label} (${(comOk[0].porTf[0].val.wr * 100).toFixed(0)}% val, edge ${edgeTxtIA(comOk[0].porTf[0].edge)}). Clique numa moeda para abri-la já otimizada.`;
    const rows = comOk.map((r, i) => {
        const b = r.porTf[0];
        const vwr = (b.val.wr * 100).toFixed(0), twr = (b.treino.wr * 100).toFixed(0);
        const cls = b.edge >= 0.05 ? 'chip-dir-up' : b.edge >= 0 ? '' : 'chip-dir-down';
        const star = i === 0 ? '<span class="scan-tuned">✦</span> ' : '';
        return `<div class="reg-row ia-row" data-sym="${r.symbol}" data-tf="${b.tf}" data-exp="${b.exp}" data-ms="${b.ms}" data-sv="${b.sv}" data-sc="${b.sc}" data-lk="${b.lk}" data-cd="${b.cd}">` +
            `<span class="reg-hora">${star}${r.label}</span>` +
            `<span class="reg-par"><span class="${cls}">${vwr}% val · ${edgeTxtIA(b.edge)}</span> <span class="ia-params">(${twr}% treino · ${b.val.w}/${b.val.ops} ops · ${rotTf(b.tf)}·${b.exp}m)</span></span>` +
            `<span class="ia-params">score≥${b.ms} · RSI ${b.sv}/${b.sc} · estrut ${b.lk} · cd ${b.cd}</span></div>`;
    });
    if (semOk.length) rows.push(`<div class="reg-row"><span class="ia-params" style="opacity:.7">Sem edge válido: ${semOk.map(r => r.label).join(', ')}</span></div>`);
    document.getElementById('iaList').innerHTML = rows.join('');
    document.getElementById('iaList').querySelectorAll('.ia-row').forEach(row => row.addEventListener('click', () => {
        const d = row.dataset;
        el('confMode').value = 'score';
        el('minScore').value = d.ms; el('rsiSobrevenda').value = d.sv; el('rsiSobrecompra').value = d.sc;
        el('estruturaLookback').value = d.lk; el('cooldownVelas').value = d.cd; el('expiracao').value = d.exp;
        el('timeframe').value = d.tf;
        el('fonte').value = PARES_YAHOO[d.sym] ? (ehForex() ? fonte() : 'twelvedata') : 'binance';
        el('symbol').value = d.sym;
        row.parentElement.querySelectorAll('.ia-row').forEach(x => x.classList.remove('ia-sel'));
        row.classList.add('ia-sel');
        montarWidgetTV(); carregar();
    }));
    fimIA();
}

// Visão detalhada de UMA moeda (comportamento clássico: melhor combo por timeframe).
function renderIAUmPar(resultado, isSim, el) {
    const symbol = resultado.symbol;
    const porTf = resultado.porTf;
    const par = PARES_YAHOO[symbol] ? PARES_YAHOO[symbol].label : symbol;
    if (!porTf.length) {
        document.getElementById('iaContext').textContent = `Nenhuma combinação passou na validação fora da amostra para ${par}. Carregue mais velas (300+) ou troque o par.`;
        document.getElementById('iaList').innerHTML = '';
        return;
    }
    const rec = porTf[0];
    document.getElementById('iaContext').textContent =
        `${par}: melhor setup é ${rotTf(rec.tf)} com expiração ${rec.exp}m — ${(rec.val.wr * 100).toFixed(0)}% fora da amostra (edge líquido ${edgeTxtIA(rec.edge)} vs break-even). Clique para aplicar.`;
    document.getElementById('iaList').innerHTML = porTf.map((r, i) => {
        const vwr = (r.val.wr * 100).toFixed(0), twr = (r.treino.wr * 100).toFixed(0);
        const cls = r.edge >= 0.05 ? 'chip-dir-up' : r.edge >= 0 ? '' : 'chip-dir-down';
        const star = i === 0 ? '<span class="scan-tuned">✦</span> ' : '';
        return `<div class="reg-row ia-row" data-i="${i}">` +
            `<span class="reg-hora">${star}${rotTf(r.tf)}·${r.exp}m</span>` +
            `<span class="reg-par"><span class="${cls}">${vwr}% val · ${edgeTxtIA(r.edge)}</span> <span class="ia-params">(${twr}% treino · ${r.val.w}/${r.val.ops} ops)</span></span>` +
            `<span class="ia-params">score≥${r.ms} · RSI ${r.sv}/${r.sc} · estrut ${r.lk} · cd ${r.cd}</span></div>`;
    }).join('');
    document.getElementById('iaList').querySelectorAll('.ia-row').forEach(row => row.addEventListener('click', () => {
        const r = porTf[+row.getAttribute('data-i')];
        el('confMode').value = 'score'; el('minScore').value = r.ms;
        el('rsiSobrevenda').value = r.sv; el('rsiSobrecompra').value = r.sc;
        el('estruturaLookback').value = r.lk; el('cooldownVelas').value = r.cd;
        el('expiracao').value = r.exp;
        iaCache[symbol] = { tf: r.tf, exp: r.exp, ms: r.ms, sv: r.sv, sc: r.sc, lk: r.lk, cd: r.cd, wr: r.val.wr };
        localStorage.setItem('iaCache', JSON.stringify(iaCache));
        row.parentElement.querySelectorAll('.ia-row').forEach(x => x.classList.remove('ia-sel'));
        row.classList.add('ia-sel');
        // se o TF recomendado difere do atual, recarrega nesse TF; senão só recalcula
        if (!isSim && String(r.tf) !== String(tfMinutes())) { el('timeframe').value = r.tf; carregar(); }
        else recalcularSinaisApenas();
    }));
}

function rotTf(m) { return m === 60 ? 'H1' : 'M' + m; }

// ============================================================================
// BLOCO 8.7 — ESTUDOS DE MERCADO (regime, horário e fatores com mais acerto)
// ============================================================================
// Lê as entradas backtestadas do par atual e extrai padrões que ajudam o
// trader a ESTUDAR o mercado: em que horário o setup mais acerta, qual fator
// de confluência mais aparece nos WINs, e qual o regime atual (tendência ×
// lateral, volatilidade alta × baixa).

const FATORES_NOMES = { T: 'Tendência', Ma: 'EMA 200', Mo: 'RSI', V: 'ATR', E: 'Estrutura', F: 'Fluxo', C: 'Correlação', P: 'Padrão de vela', X: 'MACD', B: 'Bollinger' };

function regimeAtual() {
    const last = dados.length - 1;
    const e200 = computed.ema200, atrV = computed.atrValues, atrM = computed.atrMedia;
    const chips = [];
    if (e200 && e200[last] != null && e200[last - 20] != null) {
        const slope = (e200[last] - e200[last - 20]) / e200[last - 20];
        const acima = dados[last].close > e200[last];
        if (Math.abs(slope) < 0.0005) chips.push({ t: '↔ Mercado LATERAL (EMA200 plana)', c: '' });
        else if (slope > 0 && acima) chips.push({ t: '📈 TENDÊNCIA DE ALTA (preço acima da EMA200 subindo)', c: 'chip-dir-up' });
        else if (slope < 0 && !acima) chips.push({ t: '📉 TENDÊNCIA DE BAIXA (preço abaixo da EMA200 caindo)', c: 'chip-dir-down' });
        else chips.push({ t: '⚠️ TRANSIÇÃO — preço contra a EMA200, cuidado com reversão', c: '' });
    }
    if (atrV && atrV[last] != null && atrM && atrM[last] != null) {
        const razao = atrV[last] / atrM[last];
        if (razao >= 1.3) chips.push({ t: `🔥 Volatilidade ALTA (ATR ${razao.toFixed(2)}× a média) — movimentos amplos`, c: 'chip-dir-down' });
        else if (razao <= 0.75) chips.push({ t: `😴 Volatilidade BAIXA (ATR ${razao.toFixed(2)}× a média) — mercado parado`, c: '' });
        else chips.push({ t: `✅ Volatilidade normal (ATR ${razao.toFixed(2)}× a média)`, c: 'chip-dir-up' });
    }
    return chips;
}

function barraWr(label, w, t) {
    const wr = t ? w / t * 100 : 0;
    const cls = wr >= 60 ? 'bar-good' : wr >= 50 ? 'bar-mid' : 'bar-bad';
    return `<div class="estudo-row"><span class="estudo-lbl">${label}</span>` +
        `<span class="estudo-bar"><span class="estudo-fill ${cls}" style="width:${Math.round(wr)}%"></span></span>` +
        `<span class="estudo-num">${wr.toFixed(0)}% (${w}/${t})</span></div>`;
}

function renderEstudo() {
    if (!dados.length || !computed.ema200) return;
    const av = entradas.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    document.getElementById('estudoPanel').style.display = 'block';
    document.getElementById('estudoMeta').textContent = av.length + ' operações analisadas';
    document.getElementById('estudoRegime').innerHTML = regimeAtual().map(c =>
        `<span class="decision-chip"><span class="${c.c}">${c.t}</span></span>`).join('');

    // acerto por horário do dia
    const porHora = {};
    av.forEach(e => {
        const h = new Date(e.entryTime * 1000).getHours();
        (porHora[h] = porHora[h] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') porHora[h].w++;
    });
    const horas = Object.keys(porHora).map(Number).sort((a, b) => a - b);
    document.getElementById('estudoHoras').innerHTML = horas.length
        ? horas.map(h => barraWr(String(h).padStart(2, '0') + 'h', porHora[h].w, porHora[h].t)).join('')
        : '<div class="metric-empty">Sem operações avaliadas ainda.</div>';

    // acerto por fator presente na entrada
    const porFat = {};
    av.forEach(e => (e.fatores || '').split('·').forEach(k => {
        if (!FATORES_NOMES[k]) return;
        (porFat[k] = porFat[k] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') porFat[k].w++;
    }));
    const fks = Object.keys(porFat).sort((a, b) => (porFat[b].w / porFat[b].t) - (porFat[a].w / porFat[a].t));
    document.getElementById('estudoFatores').innerHTML = fks.length
        ? fks.map(k => barraWr(FATORES_NOMES[k], porFat[k].w, porFat[k].t)).join('')
        : '<div class="metric-empty">Sem operações avaliadas ainda.</div>';

    // acerto por sessão de mercado (Ásia / Londres / NY / sobreposição)
    const ORDEM_SES = ['Londres+NY', 'Londres', 'Nova York', 'Ásia'];
    const porSes = {};
    av.forEach(e => {
        const s = sessaoDe(e.entryTime);
        (porSes[s] = porSes[s] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') porSes[s].w++;
    });
    const sess = ORDEM_SES.filter(s => porSes[s]);
    document.getElementById('estudoSessoes').innerHTML = sess.length
        ? sess.map(s => barraWr(s, porSes[s].w, porSes[s].t)).join('')
        : '<div class="metric-empty">Sem operações avaliadas ainda.</div>';

    // dica de estudo gerada a partir dos padrões
    const dicas = [];
    const melhorH = horas.filter(h => porHora[h].t >= 3).sort((a, b) => porHora[b].w / porHora[b].t - porHora[a].w / porHora[a].t)[0];
    if (melhorH != null) dicas.push(`melhor horário do setup: ${String(melhorH).padStart(2, '0')}h (${(porHora[melhorH].w / porHora[melhorH].t * 100).toFixed(0)}% de acerto)`);
    const melhorF = fks.filter(k => porFat[k].t >= 5)[0];
    if (melhorF) dicas.push(`fator mais confiável: ${FATORES_NOMES[melhorF]} presente em ${(porFat[melhorF].w / porFat[melhorF].t * 100).toFixed(0)}% de acerto`);
    const piorF = fks.filter(k => porFat[k].t >= 5).slice(-1)[0];
    if (piorF && piorF !== melhorF && porFat[piorF].w / porFat[piorF].t < 0.5) dicas.push(`atenção: entradas com ${FATORES_NOMES[piorF]} acertaram menos de 50% — estude evitá-las neste par/timeframe`);
    const melhorS = sess.filter(s => porSes[s].t >= 4).sort((a, b) => porSes[b].w / porSes[b].t - porSes[a].w / porSes[a].t)[0];
    if (melhorS) dicas.push(`melhor sessão: ${melhorS} (${(porSes[melhorS].w / porSes[melhorS].t * 100).toFixed(0)}% de acerto)`);
    document.getElementById('estudoDica').textContent = dicas.length
        ? '💡 ' + dicas.join(' · ') + '.'
        : '💡 Carregue mais histórico (500+ velas) para padrões mais confiáveis.';
}

// ============================================================================
// BLOCO 9.5 — WIDGET OFICIAL DO TRADINGVIEW (gráfico real, requer internet)
// ============================================================================

let tvWidget = null;

function tvSymbolTV() {
    const cod = symbolAtual();
    if (cod === 'CRYPTOIDX') return 'CRYPTOCAP:TOTAL';   // proxy visual: cap. total do mercado cripto
    if (ehForex() && PARES_YAHOO[cod]) return PARES_YAHOO[cod].tv;   // ex.: FX:EURUSD, TVC:GOLD
    return 'BINANCE:' + cod;   // ex.: BINANCE:BTCUSDT
}
function tvIntervalTV() { return String(tfMinutes()); }         // 1,5,15,30,60

function montarWidgetTV(tentativa) {
    tentativa = tentativa || 0;
    const wrap = document.getElementById('tvWidget');
    const msg = document.getElementById('tvWidgetMsg');
    const tag = document.getElementById('tvSyncTag');
    if (!wrap) return;

    // A lib tv.js carrega de forma assíncrona; espera até estar disponível.
    if (typeof TradingView === 'undefined' || !TradingView.widget) {
        if (tentativa < 8) {
            if (msg) { msg.textContent = 'Carregando gráfico do TradingView… (requer internet)'; msg.style.display = 'flex'; }
            setTimeout(() => montarWidgetTV(tentativa + 1), 1200);
        } else if (msg) {
            msg.textContent = 'Widget do TradingView indisponível (sem internet ou bloqueado). O gráfico abaixo continua funcionando normalmente.';
            msg.style.display = 'flex';
        }
        return;
    }

    if (msg) msg.style.display = 'none';
    if (tag) tag.textContent = symbolAtual() + ' • ' + (tfMinutes() === 60 ? 'H1' : 'M' + tfMinutes());
    wrap.innerHTML = '';  // limpa antes de recriar (troca de par/timeframe)

    try {
        tvWidget = new TradingView.widget({
            container_id: 'tvWidget',
            autosize: true,
            symbol: tvSymbolTV(),
            interval: tvIntervalTV(),
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'br',
            hide_side_toolbar: false,
            allow_symbol_change: true,
            withdateranges: true,
            // Estudos que espelham a estratégia de confluência
            studies: [
                'MAExp@tv-basicstudies',   // EMA
                'RSI@tv-basicstudies',     // RSI
                'ATR@tv-basicstudies'      // ATR
            ]
        });
    } catch (e) {
        if (msg) { msg.textContent = 'Não foi possível iniciar o widget do TradingView.'; msg.style.display = 'flex'; }
        console.error('Widget TV:', e);
    }
}

// ============================================================================
// BLOCO 10 — CARREGAR LISTA DE PARES (datalist "todas as moedas")
// ============================================================================

async function carregarSimbolos() {
    try {
        const resp = await fetch(`${BINANCE_REST}/api/v3/exchangeInfo`);
        if (!resp.ok) return;
        const info = await resp.json();
        const trading = info.symbols.filter(s => s.status === 'TRADING').map(s => s.symbol);
        const dl = document.getElementById('listaSimbolos');
        const frag = document.createDocumentFragment();
        trading.slice().sort().forEach(sym => { const o = document.createElement('option'); o.value = sym; frag.appendChild(o); });
        dl.appendChild(frag);
        // Pares de câmbio que a Binance realmente lista entram no checklist do Scanner/IA
        const setT = new Set(trading);
        forexBinanceOk = Object.keys(FOREX_BINANCE_CAND).filter(s => setT.has(s));
        if (!ehForex()) renderScanFiltro();   // re-renderiza pra incluir os pares validados
    } catch (e) { /* offline: datalist fica vazio, campo continua editável */ }
}

// ============================================================================
// BLOCO 10.5 — NOTÍCIAS EM TEMPO REAL (RSS via proxy CORS, keyless)
// ============================================================================

// Proxy CORS que embrulha o RSS em JSON {contents:"<xml>"} — sobrescrevível por ?news=
const NEWS_PROXY = _params.get('news') || 'https://api.allorigins.win/get?url=';
const NEWS_FEEDS = [
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' }
];
let noticias = [];
let newsTimer = null;

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function tempoRelativo(d) {
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h';
    return 'há ' + Math.floor(s / 86400) + ' d';
}

function baseAsset() {
    const s = symbolAtual();
    return s.replace(/(USDT|BUSD|USDC|FDUSD|TUSD|USD|BTC|ETH|BRL|EUR|TRY)$/, '') || s;
}

async function carregarNoticias() {
    const status = document.getElementById('newsStatus');
    status.textContent = 'Atualizando…';
    try {
        const todas = [];
        for (const feed of NEWS_FEEDS) {
            try {
                const resp = await fetch(NEWS_PROXY + encodeURIComponent(feed.url));
                if (!resp.ok) continue;
                const data = await resp.json();
                const xml = data.contents || '';
                const doc = new DOMParser().parseFromString(xml, 'text/xml');
                [...doc.querySelectorAll('item')].slice(0, 15).forEach(it => {
                    const title = (it.querySelector('title')?.textContent || '').trim();
                    const link = (it.querySelector('link')?.textContent || '').trim();
                    const pd = it.querySelector('pubDate')?.textContent;
                    if (title) todas.push({ title, link, date: pd ? new Date(pd) : new Date(), source: feed.name });
                });
            } catch (e) { /* pula feed com erro */ }
        }
        if (!todas.length) throw new Error('sem itens');
        todas.sort((a, b) => b.date - a.date);
        noticias = todas.slice(0, 30);
        status.textContent = 'Atualizado ' + fmtHora(Math.floor(Date.now() / 1000));
        renderNoticias();
        atualizarPaineis();   // atualiza banner/flags de risco de notícia com as novas manchetes
        if (registro.length) renderRegistro();   // notícias novas entram na timeline do registro
    } catch (err) {
        status.textContent = 'Indisponível (requer internet)';
        document.getElementById('newsList').innerHTML =
            '<div class="news-empty">Não foi possível carregar notícias agora (requer internet). O restante do simulador continua funcionando.</div>';
    }
}

// Termos de busca da moeda atual (para filtrar notícias)
function termosMoeda() {
    if (symbolAtual() === 'CRYPTOIDX') return ['bitcoin', 'btc', 'crypto', 'ethereum'];  // índice: notícias gerais de cripto
    const base = baseAsset().toLowerCase();
    const nomes = {
        btc: ['btc', 'bitcoin'], eth: ['eth', 'ethereum'], sol: ['sol', 'solana'], xrp: ['xrp', 'ripple'],
        bnb: ['bnb', 'binance'], doge: ['doge', 'dogecoin'], ada: ['ada', 'cardano'], avax: ['avax', 'avalanche'],
        link: ['chainlink', 'link'], matic: ['polygon', 'matic'], ltc: ['litecoin', 'ltc']
    };
    return nomes[base] || [base];
}
function noticiasMoeda() {
    const termos = termosMoeda();
    return noticias.filter(n => termos.some(t => n.title.toLowerCase().includes(t)));
}
// Existe notícia da moeda dentro de +/- janela (min) do timestamp (seg)?
function noticiaProxima(tsSec, janelaMin) {
    return noticiasMoeda().some(n => Math.abs(Math.floor(n.date.getTime() / 1000) - tsSec) <= janelaMin * 60);
}

function renderNoticias() {
    const soMoeda = document.getElementById('newsSoMoeda').checked;
    let lista = noticias;
    if (soMoeda) lista = noticiasMoeda();

    const el = document.getElementById('newsList');
    if (!lista.length) {
        el.innerHTML = '<div class="news-empty">Nenhuma notícia' + (soMoeda ? ' para ' + baseAsset() : '') + ' no momento.</div>';
        return;
    }
    el.innerHTML = lista.map(n =>
        `<a class="news-item" href="${escapeHtml(n.link)}" target="_blank" rel="noopener">` +
        `<span class="news-time">${tempoRelativo(n.date)}</span>` +
        `<span class="news-title">${escapeHtml(n.title)}</span>` +
        `<span class="news-src">${escapeHtml(n.source)}</span></a>`
    ).join('');
}

