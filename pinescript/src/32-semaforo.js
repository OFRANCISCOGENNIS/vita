// ============================================================================
// BLOCO 37 — SEMÁFORO DE DECISÃO + CONFIRMAÇÃO MULTI-TIMEFRAME
// ============================================================================
// Uma resposta única, no topo do painel de decisão: 🟢 ENTRAR / 🟡 ESPERAR /
// 🔴 EVITAR — fundindo tudo que já existe (confluência, selo A/B/C, funil,
// Price Action, alinhamento de timeframes e o guardião de banca). E uma linha
// MTF mostrando a tendência de M1/M5/M15: só é "ENTRAR" quando alinham.

// ---- Multi-Timeframe: viés por EMA (função pura) ----
// alta = EMA rápida > lenta E preço acima da EMA200 (ou só as EMAs se sem 200).
function biasTF(velas) {
    if (!velas || velas.length < 25) return 0;
    const closes = velas.map(v => v.close);
    const ema = (arr, n) => { const k = 2 / (n + 1); let e = arr[0]; for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k); return e; };
    const er = ema(closes.slice(-30), 9), el = ema(closes.slice(-30), 21);
    const c = closes[closes.length - 1];
    const e200 = closes.length >= 200 ? ema(closes, 200) : null;
    if (er > el && (e200 == null || c > e200)) return 1;
    if (er < el && (e200 == null || c < e200)) return -1;
    return 0;
}

let mtfEstado = { m1: null, m5: null, m15: null, alinhado: null, dir: 0 };
let _mtfRodando = false;
const MTF_TFS = [1, 5, 15];

async function atualizarMTF() {
    if (_mtfRodando) return;
    // sem dados por-TF no Simulado; nas fontes ao vivo busca leve (60 velas, com cache)
    if (fonte() === 'sim' || !dados || !dados.length) { mtfEstado = { m1: null, m5: null, m15: null, alinhado: null, dir: 0 }; renderMTF(); return; }
    _mtfRodando = true;
    try {
        const sym = symbolAtual();
        const vieses = {};
        for (const tf of MTF_TFS) {
            try { const v = await carregarHistoricoTF(sym, tf, 60); vieses[tf] = biasTF(v); }
            catch (e) { vieses[tf] = null; }
        }
        const vals = MTF_TFS.map(tf => vieses[tf]).filter(x => x != null && x !== 0);
        const alinhado = vals.length >= 2 && vals.every(v => v === vals[0]);
        mtfEstado = { m1: vieses[1], m5: vieses[5], m15: vieses[15], alinhado, dir: alinhado ? vals[0] : 0 };
        renderMTF();
        try { renderSemaforo(_ultimoRiscoNoticia); } catch (e) { }
    } finally { _mtfRodando = false; }
}

function renderMTF() {
    const el = document.getElementById('mtfRow');
    if (!el) return;
    const chip = (tf, v) => {
        const s = v === 1 ? '▲' : v === -1 ? '▼' : v === 0 ? '·' : '—';
        const cls = v === 1 ? 'mtf-up' : v === -1 ? 'mtf-down' : 'mtf-nt';
        return `<span class="mtf-chip ${cls}">M${tf} ${s}</span>`;
    };
    el.innerHTML = chip(1, mtfEstado.m1) + chip(5, mtfEstado.m5) + chip(15, mtfEstado.m15) +
        (mtfEstado.alinhado === true ? '<span class="mtf-ok">alinhados ✓</span>' : mtfEstado.alinhado === false ? '<span class="mtf-no">divergentes</span>' : '');
}

// ---- Semáforo (função pura sobre o estado atual) ----
function semaforoDecisao(riscoNoticia) {
    const cl = confLive;
    if (!cl || !cl.fatores) return { nivel: 'esperar', dir: 0, titulo: 'ESPERAR', motivo: 'carregando dados…' };
    // config inválida tem prioridade
    try { if (typeof configProblemas === 'function' && configProblemas().length) return { nivel: 'evitar', dir: 0, titulo: 'EVITAR', motivo: 'configuração inválida — corrija nos controles' }; } catch (e) { }
    // guardião de banca em STOP → não opere hoje
    try {
        if (typeof placarDoDia === 'function' && typeof planoRisco === 'function' && typeof situacaoDia === 'function') {
            const plano = planoRisco(riscoCfgAtual());
            const sit = situacaoDia(placarDoDia(typeof registro !== 'undefined' ? registro : []), plano, parseInt((document.getElementById('riscoSeqMax') || {}).value) || 3);
            if (sit.estado === 'stop') return { nivel: 'evitar', dir: 0, titulo: 'EVITAR', motivo: '🛑 stop diário atingido — pare por hoje' };
        }
    } catch (e) { }
    if (riscoNoticia) return { nivel: 'evitar', dir: 0, titulo: 'EVITAR', motivo: '⚠ notícia próxima — fora da janela' };

    const en = cl.enabled || 1;
    const alvo = cl.confMode === 'estrita' ? en : Math.min(cl.minScore || 3, en);
    const dir = (cl.long >= alvo && cl.long > cl.short) ? 1 : (cl.short >= alvo && cl.short > cl.long) ? -1 : 0;
    if (dir === 0) return { nivel: 'esperar', dir: 0, titulo: 'ESPERAR', motivo: `sem confluência (CALL ${cl.long}/${en} · PUT ${cl.short}/${en})` };

    // filtro Price Action (se ligado): longe da zona = esperar
    if (cl.usePA) { const paOk = dir === 1 ? cl.paOkLong : cl.paOkShort; if (!paOk) return { nivel: 'esperar', dir, titulo: 'ESPERAR', motivo: `📐 ${dir === 1 ? 'CALL' : 'PUT'} longe da zona — espere o teste` }; }

    let grade = null, funil = null;
    try { grade = calcularGrade(dir).grade; } catch (e) { }
    try { funil = avaliarFunil(riscoNoticia).okCount; } catch (e) { }
    const ladoTxt = dir === 1 ? 'CALL ▲' : 'PUT ▼';

    // MTF contra o lado = evitar; alinhado a favor = bônus
    const mtfContra = mtfEstado.alinhado === true && mtfEstado.dir === -dir;
    const mtfFavor = mtfEstado.alinhado === true && mtfEstado.dir === dir;
    if (mtfContra) return { nivel: 'evitar', dir, titulo: 'EVITAR', motivo: `${ladoTxt} contra os timeframes maiores (M1/M5/M15)` };
    if (grade === 'C') return { nivel: 'evitar', dir, titulo: 'EVITAR', motivo: `${ladoTxt} · selo C — qualidade baixa` };

    // ENTRAR: selo A + funil ≥5 + (MTF a favor OU desconhecido)
    if (grade === 'A' && funil != null && funil >= 5 && !mtfContra) {
        return { nivel: 'entrar', dir, titulo: `ENTRAR ${ladoTxt}`, motivo: `selo A · funil ${funil}/6${mtfFavor ? ' · timeframes alinhados ✓' : ''}` };
    }
    // senão: sinal existe mas falta qualidade
    return { nivel: 'esperar', dir, titulo: 'ESPERAR', motivo: `${ladoTxt} · ${grade ? 'selo ' + grade : ''}${funil != null ? ' · funil ' + funil + '/6' : ''} — aguarde grau A + funil ≥5` };
}

let _ultimoRiscoNoticia = false;
function renderSemaforo(riscoNoticia) {
    _ultimoRiscoNoticia = riscoNoticia;
    const box = document.getElementById('semaforo');
    if (!box) return;
    const s = semaforoDecisao(riscoNoticia);
    box.className = 'semaforo semaforo-' + s.nivel;
    const luz = s.nivel === 'entrar' ? '🟢' : s.nivel === 'evitar' ? '🔴' : '🟡';
    const l = box.querySelector('.sem-luz'); if (l) l.textContent = luz;
    const t = document.getElementById('semTitulo'); if (t) t.textContent = s.titulo;
    const m = document.getElementById('semMotivo'); if (m) m.textContent = s.motivo;
}

document.addEventListener('DOMContentLoaded', function () {
    renderMTF();
    ['symbol', 'timeframe', 'fonte', 'parPopular'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => setTimeout(atualizarMTF, 300));
    });
    setTimeout(atualizarMTF, 3500);
    setInterval(() => { if (!document.hidden) atualizarMTF(); }, 30000);
});
