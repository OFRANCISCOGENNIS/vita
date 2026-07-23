'use strict';
// ============================================================================
// SCORE DE RECUPERAÇÃO (readiness) a partir de dados reais — determinístico.
// Combina sono, desvio da FC de repouso e frescor/carga de treino, cada um com
// peso; renormaliza sobre os componentes disponíveis. Sem HRV (não capturado).
// Inspirado no conceito de recovery do WHOOP, mas com regras transparentes.
// ============================================================================

function recoveryScore(inp = {}) {
  const comps = [];

  // Sono (peso 0,40): 7,5–9,5 h ótimo; abaixo penaliza; excesso leve.
  if (inp.sleepH != null) {
    let s;
    if (inp.sleepH >= 7.5 && inp.sleepH <= 9.5) s = 100;
    else if (inp.sleepH > 9.5) s = 90;
    else if (inp.sleepH >= 6) s = Math.round(60 + (inp.sleepH - 6) / 1.5 * 40);
    else s = Math.max(20, Math.round(inp.sleepH / 6 * 60));
    comps.push({ key: 'sleep', label: 'Sono', value: s, weight: 0.40, detail: `${inp.sleepH} h` });
  }

  // FC de repouso (peso 0,30): cada bpm acima da linha de base tira 8 pontos.
  if (inp.rhrLatest != null && inp.rhrBaseline != null) {
    const dev = inp.rhrLatest - inp.rhrBaseline;
    const s = Math.max(0, Math.min(100, Math.round(100 - dev * 8)));
    comps.push({ key: 'rhr', label: 'FC repouso', value: s, weight: 0.30, detail: `${dev >= 0 ? '+' : ''}${Math.round(dev)} bpm vs base` });
  }

  // Frescor/carga (peso 0,30): 1–2 dias desde o último treino é ideal; treinar
  // muito perto da falha (RIR baixo) na última sessão reduz a recuperação.
  if (inp.daysSinceWorkout != null) {
    let s = 80;
    if (inp.daysSinceWorkout >= 1 && inp.daysSinceWorkout <= 2) s = 95;
    else if (inp.daysSinceWorkout === 0) s = 70;
    else if (inp.daysSinceWorkout >= 4) s = 88;
    if (inp.lastSessionAvgRir != null && inp.lastSessionAvgRir <= 1) s = Math.max(40, s - 25);
    comps.push({ key: 'load', label: 'Carga/frescor', value: s, weight: 0.30, detail: `${inp.daysSinceWorkout}d desde o treino` });
  }

  if (!comps.length) return { score: null, components: [], basis: 'sem dados' };
  const tw = comps.reduce((a, c) => a + c.weight, 0);
  const score = Math.round(comps.reduce((a, c) => a + c.value * c.weight, 0) / tw);
  return {
    score, components: comps, basis: 'dados reais',
    zone: score >= 75 ? 'alta' : score >= 50 ? 'moderada' : 'baixa',
  };
}

module.exports = { recoveryScore };
