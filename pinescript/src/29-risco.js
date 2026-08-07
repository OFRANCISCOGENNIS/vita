// ============================================================================
// BLOCO 34 — GESTÃO DE RISCO + GUARDIÃO DE BANCA
// ============================================================================
// Dinheiro é o que separa quem sobrevive de quem quebra. Este painel calcula o
// STAKE ideal (banca × risco%), a META e o STOP do dia em R$, e um GUARDIÃO que
// lê o placar REAL de hoje (Registro) para avisar quando bateu a meta, o stop
// ou uma sequência de perdas — a hora de PARAR. Não bloqueia nada; alerta.

// ---- Plano de risco (função pura) ----
function planoRisco(cfg) {
    const banca = Math.max(0, +cfg.banca || 0);
    const riscoPct = Math.max(0, +cfg.riscoPct || 0);
    const stake = banca * riscoPct / 100;
    const metaRS = banca * (+cfg.metaPct || 0) / 100;
    const stopRS = banca * (+cfg.stopPct || 0) / 100;
    const payout = Math.max(0.01, (+cfg.payout || 87) / 100);
    // quantas perdas SEGUIDAS a banca aguenta até bater o stop do dia
    const perdasAguenta = stake > 0 ? Math.floor(stopRS / stake) : 0;
    return { banca, stake, metaRS, stopRS, payout, beWR: 1 / (1 + payout), perdasAguenta };
}

// ---- Situação do dia (função pura): P&L estimado × meta/stop/sequência ----
function situacaoDia(placar, plano, seqMax) {
    const w = placar.w || 0, l = placar.l || 0, seq = placar.seq || 0;
    // P&L do dia estimado com o stake atual: WIN = +stake·payout · LOSS = −stake
    const plRS = w * plano.stake * plano.payout - l * plano.stake;
    let estado = 'ok', msg = 'Dentro do plano — siga disciplinado.';
    if (plano.stopRS > 0 && plRS <= -plano.stopRS) {
        estado = 'stop'; msg = '🛑 STOP DIÁRIO ATINGIDO — pare por hoje. Amanhã a banca ainda está de pé.';
    } else if (plano.metaRS > 0 && plRS >= plano.metaRS) {
        estado = 'meta'; msg = '🎯 META DO DIA BATIDA — considere encerrar e proteger o lucro.';
    } else if (seq <= -(seqMax || 3)) {
        estado = 'seq'; msg = `❄ ${-seq} perdas seguidas — respire, revise o setup antes da próxima.`;
    }
    return { plRS, estado, msg };
}

function _rMoney(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function riscoCfgAtual() {
    const g = id => document.getElementById(id);
    return {
        banca: parseFloat(g('riscoBanca').value) || 0,
        riscoPct: parseFloat(g('riscoPct').value) || 0,
        metaPct: parseFloat(g('riscoMeta').value) || 0,
        stopPct: parseFloat(g('riscoStop').value) || 0,
        payout: parseFloat((document.getElementById('payout') || {}).value) || 87
    };
}

let _riscoUltimoEstado = '';
function renderRisco() {
    if (!document.getElementById('riscoPlano')) return;
    const cfg = riscoCfgAtual();
    const plano = planoRisco(cfg);
    const seqMax = parseInt(document.getElementById('riscoSeqMax').value) || 3;
    document.getElementById('riscoPlano').innerHTML =
        kv('Stake sugerido por operação', _rMoney(plano.stake), 'kv-good') +
        kv('Meta do dia', _rMoney(plano.metaRS)) +
        kv('Stop do dia', _rMoney(plano.stopRS), 'kv-bad') +
        kv('Break-even do payout', pctTxt(plano.beWR)) +
        kv('Perdas seguidas que a banca aguenta', plano.perdasAguenta + ' ops');

    const placar = typeof placarDoDia === 'function' ? placarDoDia(typeof registro !== 'undefined' ? registro : []) : { w: 0, l: 0, seq: 0 };
    const sit = situacaoDia(placar, plano, seqMax);
    const g = document.getElementById('riscoGuardiao');
    const cls = sit.estado === 'stop' || sit.estado === 'seq' ? 'guard-stop' : sit.estado === 'meta' ? 'guard-meta' : 'guard-ok';
    g.className = 'risco-guardiao ' + cls;
    g.innerHTML = `<div class="guard-pl">Hoje: <strong>${sit.plRS >= 0 ? '+' : ''}${_rMoney(sit.plRS)}</strong> · ${placar.w || 0}W · ${placar.l || 0}L</div><div class="guard-msg">${sit.msg}</div>`;

    const tag = document.getElementById('riscoTag');
    if (tag) { tag.textContent = sit.estado === 'stop' ? '🛑 STOP' : sit.estado === 'meta' ? '🎯 META' : sit.estado === 'seq' ? '❄ pausa' : '● ativo'; }

    // avisa UMA vez quando cruza p/ stop/meta/sequência (não repete a cada render)
    const chave = sit.estado + Math.round(sit.plRS);
    if (sit.estado !== 'ok' && chave !== _riscoUltimoEstado) {
        _riscoUltimoEstado = chave;
        showToast(sit.msg, sit.estado === 'meta' ? 'ok' : 'err');
    }
    if (sit.estado === 'ok') _riscoUltimoEstado = '';
}

document.addEventListener('DOMContentLoaded', function () {
    ['riscoBanca', 'riscoPct', 'riscoMeta', 'riscoStop', 'riscoSeqMax'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderRisco);
    });
    renderRisco();
    setInterval(() => { if (!document.hidden) renderRisco(); }, 10000);   // acompanha o placar; pausa oculto
});
