// ============================================================================
// BLOCO 41 — RADAR 🟢 DA WATCHLIST (vigia a lista e avisa quem alinhou)
// ============================================================================
// Sem abrir ativo por ativo: a cada ~90s o radar busca velas leves (com cache)
// dos ativos da Watchlist e avisa (toast + notificação, mesmo em 2º plano)
// quando um deles ALINHA o timeframe atual com o maior — o mesmo princípio do
// semáforo. É um PRÉ-SINAL: abra o ativo e confira o semáforo antes de agir.

let radarAtivo = localStorage.getItem('radarOn') === '1';
const _radarCooldown = {};           // sym -> timestamp do último aviso
let _radarUltimos = [];              // últimos avisos p/ mostrar no painel
let _radarRodando = false;
const RADAR_COOLDOWN_MIN = 15;

// TF maior usado na confirmação (do conjunto disponível 1/5/15/30/60)
function radarTFMaior(tf) { return tf === 1 ? 5 : tf === 5 ? 15 : tf === 15 ? 30 : 60; }

// Sinal do radar (função pura): os dois TFs alinhados na mesma direção
function radarSinal(velasTF, velasMaior) {
    const a = biasTF(velasTF), b = biasTF(velasMaior);
    return (a !== 0 && a === b) ? a : 0;
}

// Cooldown (função pura): pode alertar de novo este símbolo?
function radarPodeAlertar(cooldowns, sym, agoraMs, minutos) {
    const t = cooldowns[sym] || 0;
    return (agoraMs - t) >= (minutos || RADAR_COOLDOWN_MIN) * 60000;
}

function _radarRegistrar(sym, dir) {
    const lbl = PARES_YAHOO[sym] ? PARES_YAHOO[sym].label : sym;
    const lado = dir === 1 ? 'CALL ▲' : 'PUT ▼';
    _radarUltimos.unshift({ t: Math.floor(Date.now() / 1000), sym, lbl, dir, lado });
    _radarUltimos = _radarUltimos.slice(0, 5);
    renderRadarInfo();
    showToast(`🟢 Radar: ${lbl} alinhou os timeframes p/ ${lado} — abra e confira o semáforo`, 'ok');
    try { notificar(`🟢 Radar — ${lbl}`, `timeframes alinhados p/ ${lado} · abra e confira o semáforo antes de agir`); } catch (e) { }
}

function renderRadarInfo() {
    const el = document.getElementById('radarInfo');
    if (!el) return;
    if (!radarAtivo) { el.innerHTML = ''; return; }
    el.innerHTML = _radarUltimos.length
        ? '📡 ' + _radarUltimos.map(r => `<span class="${r.dir === 1 ? 'tick-up' : 'tick-down'}">${escHTML(r.lbl)} ${r.lado} ${fmtHora(r.t)}</span>`).join(' · ')
        : '📡 radar ligado — vigiando a lista…';
}

async function radarVarredura() {
    if (!radarAtivo || _radarRodando || fonte() === 'sim' || !watchlist.length) return;
    _radarRodando = true;
    try {
        const tf = tfMinutes(), tfM = radarTFMaior(tf);
        const alvos = (typeof filtrarMercadoAberto === 'function'
            ? filtrarMercadoAberto(watchlist.slice(0, 10)).lista
            : watchlist.slice(0, 10));
        for (const sym of alvos) {
            if (!radarPodeAlertar(_radarCooldown, sym, Date.now())) continue;
            try {
                const [vA, vB] = await Promise.all([
                    carregarHistoricoTF(sym, tf, 60),
                    carregarHistoricoTF(sym, tfM, 60)
                ]);
                const dir = radarSinal(vA, vB);
                if (dir !== 0) { _radarCooldown[sym] = Date.now(); _radarRegistrar(sym, dir); }
            } catch (e) { }
        }
    } finally { _radarRodando = false; }
}

document.addEventListener('DOMContentLoaded', function () {
    const chk = document.getElementById('radarAtivo');
    if (chk) {
        chk.checked = radarAtivo;
        chk.addEventListener('change', function () {
            radarAtivo = this.checked;
            localStorage.setItem('radarOn', radarAtivo ? '1' : '0');
            renderRadarInfo();
            showToast(radarAtivo ? '📡 Radar ligado — avisa quando um ativo da lista alinhar (mesmo em 2º plano)' : 'Radar desligado', 'info');
            if (radarAtivo) radarVarredura();
        });
    }
    renderRadarInfo();
    // roda MESMO com a aba oculta — é justamente quando a notificação importa
    setInterval(radarVarredura, 90000);
    setTimeout(radarVarredura, 6000);
});
