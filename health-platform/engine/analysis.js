'use strict';
// ============================================================================
// ANÁLISE DE PRECISÃO (Módulos 4 e 15) — auditoria determinística do plano
// gerado contra as metas. O gerador monta; este módulo CONFERE, com fonte.
// ============================================================================

// Tolerâncias codificadas (auditáveis, não mágicas).
const TOL = {
  kcalDayPct: 10,        // desvio aceitável do dia vs meta calórica
  kcalMealPct: 15,       // desvio aceitável por refeição
  proteinDayPct: 12,     // desvio aceitável de proteína no dia
  leucineMinMg: 2000,    // limiar de disparo de síntese por refeição (~2 g)
  sodiumMaxMg: 2300,     // teto diário (DASH / AHA)
  fiberPer1000: 14,      // g/1000 kcal (IOM/DRI 2005)
};

function pct(actual, target) {
  if (!target) return 0;
  return Math.round(((actual - target) / target) * 1000) / 10;
}

// Audita um dia: totais + refeições contra as metas do motor de cálculo.
// dayTotals: {kcal, proteinG, fiberG, sodiumMg}
// meals: [{slot, kcal, proteinG, leucineMg, targetKcal}]
// targets: {kcal, proteinG}
function nutritionReport({ dayTotals, meals, targets }) {
  const checks = [];
  const add = (code, ok, detail, source) => checks.push({ code, status: ok ? 'ok' : 'warn', detail, source });

  const dKcal = pct(dayTotals.kcal, targets.kcal);
  add('KCAL_DAY', Math.abs(dKcal) <= TOL.kcalDayPct,
    `dia ${dayTotals.kcal} kcal vs meta ${targets.kcal} (${dKcal > 0 ? '+' : ''}${dKcal}%)`, `tolerância ±${TOL.kcalDayPct}%`);

  const dProt = pct(dayTotals.proteinG, targets.proteinG);
  add('PROTEIN_DAY', dProt >= -TOL.proteinDayPct,
    `proteína ${dayTotals.proteinG} g vs meta ${targets.proteinG} g (${dProt > 0 ? '+' : ''}${dProt}%)`, 'Morton 2018 / Helms 2014');

  const fiberMin = Math.round(TOL.fiberPer1000 * targets.kcal / 1000);
  add('FIBER_DAY', dayTotals.fiberG >= fiberMin,
    `fibra ${dayTotals.fiberG} g vs mínimo ${fiberMin} g`, 'IOM/DRI: 14 g/1000 kcal');

  add('SODIUM_DAY', dayTotals.sodiumMg <= TOL.sodiumMaxMg,
    `sódio ${dayTotals.sodiumMg} mg vs teto ${TOL.sodiumMaxMg} mg`, 'AHA/DASH');

  for (const m of meals) {
    const dm = pct(m.kcal, m.targetKcal);
    add(`KCAL_MEAL_${m.slot}`, Math.abs(dm) <= TOL.kcalMealPct,
      `${m.slot}: ${m.kcal} kcal vs alvo ${m.targetKcal} (${dm > 0 ? '+' : ''}${dm}%)`, `tolerância ±${TOL.kcalMealPct}%`);
    if (m.leucineMg != null) {
      add(`LEUCINE_${m.slot}`, m.leucineMg >= TOL.leucineMinMg,
        `${m.slot}: leucina ${m.leucineMg} mg vs limiar ${TOL.leucineMinMg} mg`, 'ISSN 2017 (gatilho de síntese)');
    }
  }

  const warns = checks.filter((c) => c.status === 'warn').length;
  // Score simples e transparente: % de checagens aprovadas.
  const score = Math.round(