// ============================================================================
// BLOCO 13 — AGENTES DE ESTUDO (estudo contínuo do mercado em segundo plano)
// ============================================================================
// Quatro agentes autônomos que rodam num tick de 60s (quando ativados) e vão
// melhorando os parâmetros de entrada sem intervenção:
//   🧪 Otimizador Contínuo — reotimiza as moedas marcadas em rodízio (uma por
//      vez, no Web Worker), mantendo o iaCache sempre fresco.
//   🔭 Sentinela de Regime — vigia a virada de regime do par aberto; aplica na
//      hora os parâmetros já estudados para o novo regime (ou agenda estudo).
//   ⚖️ Auditor de Calibração — compara a promessa da IA com o placar real;
//      se a IA ficou otimista, agenda a reotimização do par.
//   🧠 Professor de Fatores — mede o acerto de cada fator (limite inferior de
//      Wilson), atualiza os pesos dinâmicos e reporta o melhor/pior fator.
// Tudo cooperativo: nunca roda por cima da IA manual (iaRodando) nem do treino.

let agentesOn = localStorage.getItem('agentesOn') === '1';
let agentesTimer = null;
let agLog = [];                 // [{t, agente, msg}] — últimas ações (novas no topo)
let agUltimoRegime = null;      // regime visto por último no par aberto
let agFilaOtim = [];            // fila round-robin de moedas p/ reotimizar
let agTickN = 0, agOcupado = false;
let agFatoresUltimo = '';       // evita repetir o mesmo diagnóstico no log

function agentesLog(agente, msg) {
    agLog.unshift({ t: Math.floor(Date.now() / 1000), agente, msg });
    agLog = agLog.slice(0, 12);
    renderAgentes();
}

function renderAgentes() {
    const st = document.getElementById('agentesStatus');
    const el = document.getElementById('agentesLog');
    if (!st || !el) return;
    st.textContent = agentesOn ? (agOcupado ? '● estudando…' : '● ativos') : '○ desligados';
    st.style.color = agentesOn ? 'var(--good)' : '';
    el.innerHTML = agLog.length ? agLog.map(l =>
        `<div class="reg-row"><span class="reg-hora">${fmtHora(l.t)}</span>` +
        `<span class="ag-nome">${l.agente}</span><span class="ag-msg">${l.msg}</span></div>`
    ).join('') : '<div class="metric-empty" style="padding:8px 4px;">Ative o estudo contínuo: os agentes reotimizam as moedas em rodízio, vigiam o regime e auditam a calibração — e reportam aqui o que encontram.</div>';
}

// ---- 🔭 Sentinela de Regime ----
function agenteRegime() {
    if (!dados || dados.length < 210) return;
    const r = regimeUltimo();
    if (agUltimoRegime && r !== agUltimoRegime) {
        const rot = x => (REGIME_ROTULO[x] || x);
        agentesLog('🔭 Regime', `virou de ${rot(agUltimoRegime)} para ${rot(r)}`);
        const cc = iaCache[symbolAtual() + '|' + r];
        if (cc) {
            const el = id => document.getElementById(id);
            el('minScore').value = cc.ms; el('rsiSobrevenda').value = cc.sv; el('rsiSobrecompra').value = cc.sc;
            el('estruturaLookback').value = cc.lk; el('cooldownVelas').value = cc.cd; el('expiracao').value = cc.exp;
            recalcularSinaisApenas();
            agentesLog('🔭 Regime', `parâmetros do regime aplicados (score≥${cc.ms} · RSI ${cc.sv}/${cc.sc} · exp ${cc.exp}m)`);
        } else if (!agFilaOtim.includes(symbolAtual())) {
            agFilaOtim.unshift(symbolAtual());
            agentesLog('🔭 Regime', 'sem parâmetros estudados p/ este regime — estudo agendado');
        }
    }
    agUltimoRegime = r;
}

// ---- ⚖️ Auditor de Calibração ----
function agenteCalibracao() {
    const res = registro.filter(x => x.resultado === 'WIN' || x.resultado === 'LOSS');
    if (res.length < 5) return;
    const wins = res.filter(x => x.resultado === 'WIN').length;
    // teto plausível do acerto real (limite superior de Wilson via complemento)
    const teto = 1 - wilsonLB(res.length - wins, res.length);
    const cc = iaCache[symbolAtual() + '|' + (agUltimoRegime || '')] || iaCache[symbolAtual()];
    if (cc && cc.wr != null && cc.wr > teto + 0.02 && !agFilaOtim.includes(symbolAtual())) {
        agFilaOtim.unshift(symbolAtual());
        agentesLog('⚖️ Calibração', `IA prometia ${pctTxt(cc.wr)}, real plausível até ${pctTxt(teto)} — reestudo agendado`);
    }
}

// ---- 🧠 Professor de Fatores ----
function agenteFatores() {
    const av = entradas.filter(e => e.resultado === 'WIN' || e.resultado === 'LOSS');
    if (av.length < 20) return;
    atualizarPesosFatores();   // alimenta os pesos dinâmicos usados no score
    const acc = {};
    av.forEach(e => (e.fatores || '').split('·').forEach(k => {
        if (!FATORES_NOMES[k]) return;
        (acc[k] = acc[k] || { w: 0, t: 0 }).t++;
        if (e.resultado === 'WIN') acc[k].w++;
    }));
    const ks = Object.keys(acc).filter(k => acc[k].t >= 8);
    if (ks.length < 2) return;
    ks.sort((a, b) => wilsonLB(acc[b].w, acc[b].t) - wilsonLB(acc[a].w, acc[a].t));
    const melhor = ks[0], pior = ks[ks.length - 1];
    let resumo = `melhor fator: ${FATORES_NOMES[melhor]} (LB ${pctTxt(wilsonLB(acc[melhor].w, acc[melhor].t))} em ${acc[melhor].t} ops)`;
    if (acc[pior].w / acc[pior].t < 0.5) resumo += ` · pior: ${FATORES_NOMES[pior]} (${pctTxt(acc[pior].w / acc[pior].t)}) — pesos ajustados`;
    if (resumo !== agFatoresUltimo) { agFatoresUltimo = resumo; agentesLog('🧠 Fatores', resumo); }
}

// ---- 🧪 Otimizador Contínuo (uma moeda por rodada, em rodízio) ----
async function agenteOtimizador() {
    if (iaRodando || agOcupado || treino) return;
    const isSim = fonte() === 'sim';
    if (isSim && (!dados || dados.length < 210)) return;
    if (!agFilaOtim.length) agFilaOtim = isSim ? [symbolAtual()] : scanUniverse().filter(scanChecked);
    const sym = agFilaOtim.shift();
    if (!sym) return;
    agOcupado = true; iaRodando = true; iaCancelar = false; renderAgentes();
    const el = id => document.getElementById(id);
    const ids = ['minScore', 'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas', 'confMode', 'timeframe', 'useHtf', 'usePesoIA', 'symbol', 'fonte'];
    const save = {}; ids.forEach(i => save[i] = el(i).type === 'checkbox' ? el(i).checked : el(i).value);
    el('confMode').value = 'score'; el('useHtf').checked = false; el('usePesoIA').checked = false;
    const htfSave = htfTrend; htfTrend = [];
    const dSave = dados;
    const payout = Math.max(0.01, (parseFloat(el('payout').value) || 87) / 100);
    const beWR = 1 / (1 + payout);
    try {
        const { porTf } = await _iaOtimizarSimbolo(sym, isSim, dSave, beWR, [1, 5, 15, 30, 60], el);
        localStorage.setItem('iaCache', JSON.stringify(iaCache));
        if (porTf.length) {
            const b = porTf[0];
            agentesLog('🧪 Otimizador', `${scanLabel(sym)}: ${pctTxt(b.val.wr)} val · LB ${pctTxt(b.val.wrLB)} (${rotTf(b.tf)}·${b.exp}m) — parâmetros atualizados`);
        } else {
            agentesLog('🧪 Otimizador', `${scanLabel(sym)}: sem edge válido nesta rodada`);
        }
    } catch (e) {
        agentesLog('🧪 Otimizador', `${scanLabel(sym)}: falhou (${(e && e.message) || e})`);
    }
    // restaura o estado do usuário como a IA manual faz
    ids.forEach(i => { if (el(i).type === 'checkbox') el(i).checked = save[i]; else el(i).value = save[i]; });
    dados = dSave; htfTrend = htfSave;
    try { recomputarIndicadores(); recomputarSinais(); } catch (e) { }
    iaRodando = false; iaCancelar = false; agOcupado = false; renderAgentes();
}

// ---- Tick central: roda os agentes leves sempre; o pesado a cada 3 ticks ----
async function agentesTick() {
    if (!agentesOn || treino) return;
    agTickN++;
    try { agenteRegime(); } catch (e) { }
    try { agenteCalibracao(); } catch (e) { }
    try { agenteFatores(); } catch (e) { }
    // o otimizador (pesado) roda a cada 3 ticks, ou antes se algo foi agendado
    if (agTickN % 3 === 0 || agFilaOtim.length) { try { await agenteOtimizador(); } catch (e) { } }
}

function configurarAgentes() {
    const cb = document.getElementById('agentesAtivo');
    if (!cb) return;
    cb.checked = agentesOn;
    cb.addEventListener('change', function () {
        agentesOn = this.checked;
        localStorage.setItem('agentesOn', agentesOn ? '1' : '0');
        if (agentesOn) {
            agentesLog('🤖 Central', 'agentes ativados — estudo contínuo iniciado (rodízio de moedas a ~3 min)');
            if (!agentesTimer) agentesTimer = setInterval(agentesTick, 60000);
            agentesTick();
        } else {
            agentesLog('🤖 Central', 'agentes pausados');
        }
        renderAgentes();
    });
    if (agentesOn && !agentesTimer) agentesTimer = setInterval(agentesTick, 60000);
    renderAgentes();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configurarAgentes);
else configurarAgentes();
