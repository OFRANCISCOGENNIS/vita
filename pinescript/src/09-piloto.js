// ============================================================================
// BLOCO 14 — PILOTO AUTOMÁTICO (paper trading em conta DEMO simulada)
// ============================================================================
// Opera "sozinho" numa conta DEMO simulada, sobre dados REAIS: quando uma virada
// de veredito passa no gatilho (nível A / funil ≥5), o app registra a operação
// como paper trade com stake, e ao resolver WIN/LOSS aplica o P&L ao saldo demo.
// NÃO toca em corretora nenhuma (a Binomo bloqueia iframe e proíbe bots) — é o
// equivalente honesto e sem risco de "testar na demo". A operação real, se você
// quiser, continua MANUAL. Acompanha saldo, win rate, drawdown e expectativa.

let pilotoCfg = Object.assign(
    { ativo: false, gatilho: 'af5', saldoIni: 10000, stake: 100, stakeTipo: 'fixo', epoch: 0 },
    JSON.parse(localStorage.getItem('pilotoCfg') || '{}')
);
function salvarPiloto() { localStorage.setItem('pilotoCfg', JSON.stringify(pilotoCfg)); }
function pilotoPayout() { return Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100); }

// Qualifica a virada conforme o gatilho escolhido (A / funil≥5 / ambos).
function pilotoQualifica(grade, funil) {
    if (!pilotoCfg.ativo) return false;
    const a = grade === 'A', f = funil != null && funil >= 5;
    return pilotoCfg.gatilho === 'a' ? a : pilotoCfg.gatilho === 'f5' ? f : (a && f);
}
// Stake a arriscar nesta operação: R$ fixo ou % do saldo demo atual.
function pilotoStakeAtual() {
    const s = pilotoCfg.stakeTipo === 'pct' ? calcularContaDemo().saldo * (pilotoCfg.stake / 100) : pilotoCfg.stake;
    return Math.max(1, s);
}

// Recalcula a conta demo A PARTIR do registro (nunca conta duas vezes): soma o
// P&L das paper trades resolvidas desde o último "zerar" (epoch). Pendentes não
// mexem no saldo. WIN = +stake·payout; LOSS = −stake.
function calcularContaDemo() {
    const paper = registro.filter(r => r.paper && r.t >= (pilotoCfg.epoch || 0));
    const res = paper.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS').sort((a, b) => a.t - b.t);
    let saldo = pilotoCfg.saldoIni, pico = saldo, ddMax = 0, w = 0, seq = 0, seqTipo = '';
    res.forEach(r => {
        saldo += r.resultado === 'WIN' ? (r.stake || 0) * (r.payout || pilotoPayout()) : -(r.stake || 0);
        if (saldo > pico) pico = saldo;
        if (pico - saldo > ddMax) ddMax = pico - saldo;
        if (r.resultado === 'WIN') { w++; seq = seqTipo === 'W' ? seq + 1 : 1; seqTipo = 'W'; }
        else { seq = seqTipo === 'L' ? seq + 1 : 1; seqTipo = 'L'; }
    });
    const pend = paper.length - res.length;
    return {
        saldo, ops: res.length, pend, w, wr: res.length ? w / res.length : 0,
        ddMax, ddPct: pico ? ddMax / pico : 0, lucro: saldo - pilotoCfg.saldoIni,
        exp: res.length ? (saldo - pilotoCfg.saldoIni) / res.length : 0, seq, seqTipo
    };
}

function _pMoney(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ---- Gate de evidência (função pura): há PROVA estatística de edge? ----
// Não basta estar no lucro por sorte. Exige amostra (≥30 ops), expectativa
// positiva E o limite inferior de Wilson acima do break-even do payout. Só aí
// o resultado do paper trading merece confiança — nunca antes.
const PILOTO_MIN_OPS = 30;
function provaEdge(conta, payout) {
    const ops = conta.ops || 0, wins = Math.round((conta.wr || 0) * ops);
    const beWR = 1 / (1 + Math.max(0.01, payout || 0.87));
    const lb = ops > 0 && typeof wilsonLB === 'function' ? wilsonLB(wins, ops) : 0;
    if (ops < PILOTO_MIN_OPS) return { nivel: 'coletando', lb, beWR, faltam: PILOTO_MIN_OPS - ops, msg: `🔬 Coletando evidência: ${ops}/${PILOTO_MIN_OPS} operações. Não confie no saldo ainda — amostra pequena é sorte, não edge.` };
    if (lb <= beWR || (conta.exp || 0) <= 0) return { nivel: 'sem-edge', lb, beWR, faltam: 0, msg: `❌ SEM edge provado: no limite inferior o acerto (${(lb * 100).toFixed(0)}%) não supera o break-even (${(beWR * 100).toFixed(0)}%). Mesmo no lucro, a estatística não sustenta ir pra real.` };
    return { nivel: 'validado', lb, beWR, faltam: 0, msg: `✅ Edge validado: ${ops} ops · acerto no limite inferior (${(lb * 100).toFixed(0)}%) acima do break-even (${(beWR * 100).toFixed(0)}%). Evidência real — ainda assim, risco é seu.` };
}

function renderPiloto() {
    const st = document.getElementById('pilotoStats'), tag = document.getElementById('pilotoSaldo');
    if (!st || !tag) return;
    const c = calcularContaDemo();
    tag.textContent = pilotoCfg.ativo ? _pMoney(c.saldo) : '○ desligado';
    tag.style.color = pilotoCfg.ativo ? (c.lucro >= 0 ? 'var(--good)' : 'var(--put)') : '';
    st.innerHTML =
        kv('Saldo demo', _pMoney(c.saldo), c.lucro >= 0 ? 'kv-good' : 'kv-bad') +
        kv('Resultado', (c.lucro >= 0 ? '+' : '') + _pMoney(c.lucro) + ' (' + (pilotoCfg.saldoIni ? (c.lucro / pilotoCfg.saldoIni * 100).toFixed(1) : '0') + '%)', c.lucro >= 0 ? 'kv-good' : 'kv-bad') +
        kv('Operações', c.ops + (c.pend ? ' · ' + c.pend + ' aberta' + (c.pend > 1 ? 's' : '') : '')) +
        kv('Win rate', c.ops ? (c.wr * 100).toFixed(0) + '%' : '—', c.wr >= 0.55 ? 'kv-good' : '') +
        kv('Drawdown máx', _pMoney(c.ddMax) + ' (' + (c.ddPct * 100).toFixed(0) + '%)', c.ddMax > 0 ? 'kv-bad' : '') +
        kv('Expectativa/op', (c.exp >= 0 ? '+' : '') + _pMoney(c.exp), c.exp >= 0 ? 'kv-good' : 'kv-bad') +
        kv('Sequência atual', c.seq ? c.seq + ' ' + (c.seqTipo === 'W' ? 'WIN' : 'LOSS') : '—', c.seqTipo === 'W' ? 'kv-good' : c.seqTipo === 'L' ? 'kv-bad' : '');

    // Gate de evidência: prova (ou desmente) o edge antes de qualquer confiança
    const pv = document.getElementById('pilotoProva');
    if (pv) {
        const pe = provaEdge(c, pilotoPayout());
        pv.className = 'piloto-prova prova-' + pe.nivel;
        pv.innerHTML = `<div class="prova-barra"><span style="width:${Math.min(100, (c.ops / PILOTO_MIN_OPS) * 100).toFixed(0)}%"></span></div><div class="prova-msg">${pe.msg}</div>`;
    }
}

function configurarPiloto() {
    const el = id => document.getElementById(id);
    if (!el('pilotoAtivo')) return;
    // restaura UI a partir da config
    el('pilotoAtivo').checked = pilotoCfg.ativo;
    el('pilotoGatilho').value = pilotoCfg.gatilho;
    el('pilotoSaldoIni').value = pilotoCfg.saldoIni;
    el('pilotoStake').value = pilotoCfg.stake;
    el('pilotoStakeTipo').value = pilotoCfg.stakeTipo;

    el('pilotoAtivo').addEventListener('change', function () {
        pilotoCfg.ativo = this.checked;
        if (this.checked && !pilotoCfg.epoch) pilotoCfg.epoch = Math.floor(Date.now() / 1000);
        salvarPiloto(); renderPiloto();
        showToast(this.checked ? '🎮 Piloto Automático LIGADO — conta demo simulada, sem risco' : '⏸ Piloto Automático desligado', this.checked ? 'ok' : 'info');
    });
    el('pilotoGatilho').addEventListener('change', function () { pilotoCfg.gatilho = this.value; salvarPiloto(); });
    el('pilotoSaldoIni').addEventListener('change', function () { pilotoCfg.saldoIni = lerNum('pilotoSaldoIni', { min: 1, max: 1e9, def: 10000 }); salvarPiloto(); renderPiloto(); });
    el('pilotoStake').addEventListener('change', function () { pilotoCfg.stake = lerNum('pilotoStake', { min: 0.01, max: 1e9, def: 100, float: 1 }); salvarPiloto(); });
    el('pilotoStakeTipo').addEventListener('change', function () { pilotoCfg.stakeTipo = this.value; salvarPiloto(); });
    el('pilotoZerar').addEventListener('click', function () {
        pilotoCfg.epoch = Math.floor(Date.now() / 1000);
        pilotoCfg.saldoIni = lerNum('pilotoSaldoIni', { min: 1, max: 1e9, def: 10000 });
        salvarPiloto(); renderPiloto();
        showToast('🔄 Conta demo zerada — saldo em ' + _pMoney(pilotoCfg.saldoIni), 'ok');
    });
    renderPiloto();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configurarPiloto);
else configurarPiloto();
