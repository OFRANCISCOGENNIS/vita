'use strict';
// ============================================================================
// MOTOR DE ADAPTAÇÃO (Módulo 15) — detecção de platô por TENDÊNCIA, não ruído.
// Regressão linear simples sobre a janela; decisões pelas adaptation_rules.
// ============================================================================

// Regressão linear: retorna inclinação em unidade/dia. Determinística.
function linearTrend(points) {
  // points: [{ day: number, value: number }]
  const n = points.length;
  if (n < 2) return null;
  const sx = points.reduce((s, p) => s + p.day, 0);
  const sy = points.reduce((s, p) => s + p.value, 0);
  const sxx = points.reduce((s, p) => s + p.day * p.day, 0);
  const sxy = points.reduce((s, p) => s + p.day * p.value, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return { slopePerDay: (n * sxy - sx * sy) / denom, mean: sy / n };
}

// Regra PLATEAU_WEIGHT_14D do seed: janela 14d, ≥8 pontos, |Δ| < 0,3%,
// adesão ≥80% → -5% kcal com piso 1,1×TMB.
function detectPlateau({ weighins, adherencePct, goal }) {
  if (goal !== 'fat_loss') return { plateau: false, reason: 'Regra aplica-se apenas a fat_loss.' };
  if (weighins.length < 8) return { plateau: false, reason: `Dados insuficientes (${weighins.length}/8 pesagens em 14 dias).` };
  if (adherencePct < 80) return { plateau: false, reason: `Adesão ${adherencePct}% < 80%: ajustar adesão antes de cortar calorias (regra ADHERENCE_LOW_SIMPLIFY).` };
  const trend = linearTrend(weighins);
  const changePct14d = Math.abs((trend.slopePerDay * 14) / trend.mean) * 100;
  if (changePct14d >= 0.3) return { plateau: false, reason: `Tendência de ${changePct14d.toFixed(2)}%/14d — ainda respondendo.` };
  return { plateau: true, changePct14d: Math.round(changePct14d * 100) / 100, rule: 'PLATEAU_WEIGHT_14D' };
}

function applyPlateauAction({ targetKcal, bmrKcal }) {
  const floor = Math.round(bmrKcal * 1.1);
  const proposed = Math.round(targetKcal * 0.95);
  if (proposed < floor) {
    return { newTargetKcal: targetKcal, action: 'suggest_neat', detail: 'Piso de 1,1×TMB atingido: sem novo corte. Ação: +2000 passos/dia e/ou 1-2 sessões de cardio Z2.' };
  }
  return { newTargetKcal: proposed, action: 'reduce_kcal', deltaPct: -5, alsoSuggest: '+2000 passos/dia', explanation: { beginner: 'Seu peso ficou parado por 2 semanas mesmo seguindo o plano, então vamos reduzir um pouco as calorias.', advanced: 'Platô por regressão 14d; -5% kcal com piso 1,1×TMB (mitiga adaptação metabólica, Trexler 2014).' } };
}

// Freio de perda rápida (RAPID_LOSS_BRAKE): >1,5%/semana sustentado → +10% kcal.
function rapidLossBrake({ weighins, targetKcal }) {
  const trend = linearTrend(weighins);
  if (!trend) return { triggered: false };
  const lossPctWeek = (-(trend.slopePerDay * 7) / trend.mean) * 100;
  if (lossPctWeek <= 1.5) return { triggered: false, lossPctWeek: Math.round(lossPctWeek * 100) / 100 };
  return {
    triggered: true, rule: 'RAPID_LOSS_BRAKE',
    lossPctWeek: Math.round(lossPctWeek * 100) / 100,
    newTargetKcal: Math.round(targetKcal * 1.10),
    flag: 'review_red_flags',
    reason: 'Perda >1,5%/semana eleva perda de massa magra (Garthe 2011).',
  };
}

// ETA de meta (Módulo 9): projeção por tendência com faixa de incerteza.
function goalEta({ weighins, targetValue }) {
  const trend = linearTrend(weighins);
  if (!trend || trend.slopePerDay === 0) return { reachable: false, reason: 'Sem tendência mensurável.' };
  const current = weighins[weighins.length - 1].value;
  const daysNeeded = (targetValue - current) / trend.slopePerDay;
  if (daysNeeded < 0) return { reachable: false, reason: 'Tendência atual afasta da meta.' };
  return {
    reachable: true,
    etaDays: Math.round(daysNeeded),
    // Incerteza: ±25% da projeção (mínimo 7 dias) — faixa, não ponto.
    etaRangeDays: Math.max(7, Math.round(daysNeeded * 0.25)),
    confidence: weighins.length >= 14 ? 'medium' : 'low',
  };
}

module.exports = { linearTrend, detectPlateau, applyPlateauAction, rapidLossBrake, goalEta };
