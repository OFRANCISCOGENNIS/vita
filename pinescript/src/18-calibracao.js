// ============================================================================
// BLOCO 23 — CALIBRAÇÃO REAL: curva previsto×realizado + pesos pelos resultados
// ============================================================================
// O Registro (WIN/LOSS verificado) é o dado mais valioso do app: é o resultado
// REAL, não o backtest. Este bloco fecha o ciclo de evidência:
//   1. Curva de calibração — quando o app previu 60%, acertou 60%?
//   2. Pesos reais por fator — o acerto REAL de cada fator (quando alinhado à
//      entrada) modula a pontuação dinâmica: o backtest propõe, o real confirma.

const MAPA_FATOR_LETRA = {
    'Tendência': 'T', 'EMA 200': 'Ma', 'RSI': 'Mo', 'ATR': 'V', 'Estrutura': 'E',
    'Fluxo': 'F', 'Correlação': 'C', 'Padrão': 'P', 'MACD': 'X', 'Bollinger': 'B'
};

// ---- Curva de calibração (função pura): baldes de probabilidade prevista ----
function curvaCalibracao(regs) {
    const faixas = [[0, 50], [50, 55], [55, 60], [60, 65], [65, 101]];
    const rows = faixas.map(([a, b]) => ({ faixa: (b > 100 ? a + '%+' : a + '–' + b + '%'), a, b, n: 0, w: 0, prevSoma: 0 }));
    (regs || []).forEach(r => {
        if (!r.resultado || !r.det || r.det.pEst == null) return;
        const p = r.det.pEst * 100;
        const row = rows.find(x => p >= x.a && p < x.b);
        if (!row) return;
        row.n++; row.prevSoma += r.det.pEst;
        if (r.resultado === 'WIN') row.w++;
    });
    return rows.filter(r => r.n > 0).map(r => ({ faixa: r.faixa, n: r.n, prev: r.prevSoma / r.n, real: r.w / r.n }));
}

// ---- Pesos reais por fator (função pura) ----
// Para cada entrada verificada, cada fator ALINHADO à direção da entrada
// (dir = dir da entrada, ou ✓ não-direcional) recebe o desfecho dela.
function pesosReaisCalc(regs) {
    const o = {};
    (regs || []).forEach(r => {
        if (!r.resultado || !r.det || !r.det.fatores) return;
        r.det.fatores.forEach(f => {
            const k = MAPA_FATOR_LETRA[f.nome];
            if (!k) return;
            if (!(f.dir === 2 || f.dir === r.dir)) return;
            o[k] = o[k] || { n: 0, w: 0 };
            o[k].n++;
            if (r.resultado === 'WIN') o[k].w++;
        });
    });
    Object.keys(o).forEach(k => o[k].wr = o[k].w / o[k].n);
    return o;
}

// Multiplicador do fator na pontuação dinâmica: neutro (1.0) até 10 amostras;
// depois, acerto real 60% → ×1.10 · 40% → ×0.90 (limitado a ±25%).
function pesoRealFator(mapa, k) {
    const o = mapa && mapa[k];
    if (!o || o.n < 10) return 1;
    return Math.max(0.75, Math.min(1.25, 1 + (o.wr - 0.5)));
}

// Memo de 5s: calcularSinais roda o tempo todo; o registro muda devagar
let _pReaisMemo = null, _pReaisT = 0;
function pesosReaisMapa() {
    if (!_pReaisMemo || Date.now() - _pReaisT > 5000) {
        _pReaisMemo = pesosReaisCalc(typeof registro !== 'undefined' ? registro : []);
        _pReaisT = Date.now();
    }
    return _pReaisMemo;
}

// ---- Render: curva + fatores no painel de calibração da IA ----
function renderCalibracaoAvancada() {
    const box = document.getElementById('calibExtra');
    if (!box) return;
    const regs = typeof registro !== 'undefined' ? registro : [];
    const curva = curvaCalibracao(regs);
    const pesos = pesosReaisCalc(regs);
    const temPesos = Object.keys(pesos).some(k => pesos[k].n >= 5);
    if (!curva.length && !temPesos) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    let html = '';
    if (curva.length) {
        html += '<div class="calib-tit">📏 Curva de calibração — previsto × realizado</div>';
        html += curva.map(c => {
            const dif = c.real - c.prev;
            const cls = Math.abs(dif) <= 0.07 ? 'kv-good' : dif < 0 ? 'kv-bad' : 'kv-warn';
            return `<div class="kv ${cls}"><span>previsto ${c.faixa} (${c.n} ops)</span><b>real ${pctTxt(c.real)} · ${dif >= 0 ? '+' : ''}${Math.round(dif * 100)}pp</b></div>`;
        }).join('');
        html += '<p class="group-note">Verde = honesto (±7pp) · vermelho = IA otimista (prometeu mais do que entregou).</p>';
    }
    if (temPesos) {
        const NOMES = Object.keys(MAPA_FATOR_LETRA);
        html += '<div class="calib-tit">⚖️ Acerto REAL por fator (quando alinhado à entrada)</div><div class="calib-fatores">';
        html += NOMES.filter(n => pesos[MAPA_FATOR_LETRA[n]] && pesos[MAPA_FATOR_LETRA[n]].n >= 5).map(n => {
            const o = pesos[MAPA_FATOR_LETRA[n]];
            const cls = o.wr >= 0.55 ? 'chip-dir-up' : o.wr < 0.5 ? 'chip-dir-down' : '';
            return `<span class="decision-chip"><span class="${cls}">${n} ${pctTxt(o.wr)}</span> <span class="ia-params">(${o.n})</span></span>`;
        }).join('');
        html += '</div><p class="group-note">Com 10+ amostras o fator passa a pesar na pontuação dinâmica: o resultado REAL confirma (ou demite) o backtest.</p>';
    }
    box.innerHTML = html;
}
