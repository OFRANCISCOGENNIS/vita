'use strict';
// ============================================================================
// ANÁLISE NUTRICIONAL DE PRECISÃO (Módulo 4/8) — vai além de calorias e macros:
// completude de micronutrientes vs DRI, qualidade proteica (PDCAAS com
// complementaridade), distribuição de proteína/leucina por refeição, carga
// glicêmica do dia. Funções puras: mesmo input → mesmo output, com fonte.
// ============================================================================

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// Metas de micronutrientes (RDA/AI adulto — IOM/DRI). Sódio é TETO (UL prático).
// ---------------------------------------------------------------------------
const MICRO_TARGETS = {
  potassium_mg: { M: 3400, F: 2600, kind: 'target', label: 'Potássio', source: 'IOM/DRI AI' },
  magnesium_mg: { M: 400, F: 310, kind: 'target', label: 'Magnésio', source: 'IOM/DRI RDA' },
  iron_mg: { M: 8, F: 18, kind: 'target', label: 'Ferro', source: 'IOM/DRI RDA' },
  zinc_mg: { M: 11, F: 8, kind: 'target', label: 'Zinco', source: 'IOM/DRI RDA' },
  calcium_mg: { M: 1000, F: 1000, kind: 'target', label: 'Cálcio', source: 'IOM/DRI RDA' },
  vitc_mg: { M: 90, F: 75, kind: 'target', label: 'Vitamina C', source: 'IOM/DRI RDA' },
  vita_mcg: { M: 900, F: 700, kind: 'target', label: 'Vitamina A', source: 'IOM/DRI RDA' },
  omega3_g: { M: 1.6, F: 1.1, kind: 'target', label: 'Ômega-3 (ALA)', source: 'IOM/DRI AI' },
  sodium_mg: { M: 2300, F: 2300, kind: 'ceiling', label: 'Sódio', source: 'AHA/CDC (limite)' },
};

// Soma micronutrientes do conjunto de itens (cada item: {food, grams}) e compara
// à meta por sexo. Alvos são "quanto mais perto de 100%, melhor" (até saturar);
// tetos invertem: >100% é ruim. Status: low / ok / high / over.
function analyzeMicros(items, sex) {
  const total = {};
  for (const key of Object.keys(MICRO_TARGETS)) total[key] = 0;
  for (const { food, grams } of items) {
    const m = food.micros || {};
    for (const key of Object.keys(MICRO_TARGETS)) {
      total[key] += (m[key] || 0) * grams / 100;
    }
  }
  return Object.keys(MICRO_TARGETS).map((key) => {
    const t = MICRO_TARGETS[key];
    const target = t[sex] != null ? t[sex] : t.M;
    const amount = round(total[key], 1);
    const pct = Math.round(amount / target * 100);
    let status;
    if (t.kind === 'ceiling') status = pct > 100 ? 'over' : 'ok';
    else if (pct < 70) status = 'low';
    else if (pct <= 140) status = 'ok';
    else status = 'high';
    return { key, label: t.label, amount, target, pct, unit: key.split('_')[1], kind: t.kind, status, source: t.source };
  });
}

// ---------------------------------------------------------------------------
// Qualidade proteica: PDCAAS ponderado pela contribuição de proteína de cada
// alimento. Complementaridade (leguminosa + cereal no mesmo dia) eleva o
// aminoácido limitante das proteínas vegetais (Young & Pellett 1994).
// ---------------------------------------------------------------------------
function proteinQuality(items) {
  let protTotal = 0, weighted = 0;
  let hasLegume = false, hasCereal = false, hasAnimal = false;
  for (const { food, grams } of items) {
    const p = (food.protein_g != null ? food.protein_g : food.p || 0) * grams / 100;
    if (p <= 0) continue;
    protTotal += p;
    weighted += (food.pdcaas != null ? food.pdcaas : 0.7) * p;
    const cat = food.category || food.c || '';
    const tags = food.tags || food.t || [];
    if (cat === 'legumes') hasLegume = true;
    if (cat === 'cereals' || cat === 'tubers') hasCereal = true;
    if (tags.includes('animal') || tags.includes('animal_based') || cat === 'meats' || cat === 'fish' || cat === 'eggs' || cat === 'dairy') hasAnimal = true;
  }
  if (protTotal === 0) return { score: 0, protTotal: 0, complemented: false, limiting: null, note: 'Sem proteína no conjunto.' };
  let score = weighted / protTotal;
  const complemented = !hasAnimal && hasLegume && hasCereal;
  if (complemented) score = Math.min(1, score + 0.1); // bônus de complementaridade
  const limiting = hasAnimal ? null : (hasLegume && !hasCereal ? 'metionina' : (!hasLegume && hasCereal ? 'lisina' : null));
  return {
    score: round(score, 2), protTotal: round(protTotal, 0), complemented, limiting,
    source: 'PDCAAS (FAO/WHO) + complementaridade Young & Pellett 1994',
    note: complemented ? 'Leguminosa + cereal se complementam — qualidade elevada.'
      : limiting ? `Proteína vegetal isolada: aminoácido limitante provável = ${limiting}.` : 'Fontes de alta qualidade.',
  };
}

// ---------------------------------------------------------------------------
// Distribuição de proteína por refeição vs alvo 0,4 g/kg (Schoenfeld & Aragon
// 2018) e limiar de leucina ~2,5 g/refeição para maximizar síntese (ISSN).
// meals: [{ slot, proteinG }]. weightKg: peso do paciente.
// ---------------------------------------------------------------------------
function proteinDistribution(meals, weightKg) {
  const target = round(0.4 * weightKg, 0);
  const rows = meals.map((m) => {
    const p = m.proteinG != null ? m.proteinG : 0;
    const leucine = round(0.085 * p, 1); // ~8,5% da proteína mista
    const adequate = p >= target && leucine >= 2.5;
    return { slot: m.slot, proteinG: p, leucineG: leucine, target, adequate, pctOfTarget: Math.round(p / target * 100) };
  });
  const nAdequate = rows.filter((r) => r.adequate).length;
  return {
    perMealTargetG: target, leucineThresholdG: 2.5, rows, nAdequate, nMeals: rows.length,
    source: 'Schoenfeld & Aragon 2018 (0,4 g/kg/refeição); ISSN 2017 (leucina ~2,5 g)',
  };
}

// ---------------------------------------------------------------------------
// Carga glicêmica do dia: GL = Σ (IG × carbo_disponível_g / 100). Classifica
// (baixa ≤80, média 81–120, alta >120 para o dia). GI/carbo por alimento.
// ---------------------------------------------------------------------------
function glycemicLoad(items) {
  let gl = 0, carbTotal = 0;
  for (const { food, grams } of items) {
    const gi = food.glycemic_index != null ? food.glycemic_index : food.gi;
    const carb = (food.carb_g != null ? food.carb_g : food.ch || 0) * grams / 100;
    carbTotal += carb;
    if (gi != null) gl += gi * carb / 100;
  }
  gl = round(gl, 0);
  const status = gl <= 80 ? 'low' : gl <= 120 ? 'medium' : 'high';
  return { glDay: gl, carbTotalG: round(carbTotal, 0), status, source: 'Carga glicêmica (IG × carbo/100), Foster-Powell 2002' };
}

// ---------------------------------------------------------------------------
// DIÁRIO ALIMENTAR: soma do que foi realmente consumido e aderência ao alvo.
// items: [{ food, grams }]. Aceita food no formato engine (kcal/protein_g/...)
// ou web (kcal/p/ch/f) — lê ambos.
// ---------------------------------------------------------------------------
function sumIntake(items) {
  let kcal = 0, protein = 0, carb = 0, fat = 0;
  for (const { food, grams } of items) {
    const g = grams;
    kcal += (food.kcal || 0) * g / 100;
    protein += (food.protein_g != null ? food.protein_g : food.p || 0) * g / 100;
    carb += (food.carb_g != null ? food.carb_g : food.ch || 0) * g / 100;
    fat += (food.fat_g != null ? food.fat_g : food.f || 0) * g / 100;
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein), carb: Math.round(carb), fat: Math.round(fat) };
}

// Aderência ao alvo: penaliza desvio calórico (para os dois lados) e défice
// de proteína (faltar proteína pesa; sobrar não penaliza). 0–100.
function adherenceScore(consumed, target) {
  const kcalDev = target.kcal ? Math.abs(consumed.kcal - target.kcal) / target.kcal : 0;
  const protDeficit = target.protein ? Math.max(0, target.protein - consumed.protein) / target.protein : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - kcalDev * 100 - protDeficit * 50)));
  return {
    adherence: score,
    kcalDevPct: Math.round(kcalDev * 100),
    proteinDeficitPct: Math.round(protDeficit * 100),
    status: score >= 85 ? 'high' : score >= 60 ? 'ok' : 'low',
  };
}

module.exports = {
  analyzeMicros, proteinQuality, proteinDistribution, glycemicLoad,
  sumIntake, adherenceScore, MICRO_TARGETS,
};
