'use strict';
// ============================================================================
// MOTOR DE CÁLCULO DETERMINÍSTICO (Módulos 3, 4, 14)
// JS puro, sem dependências. Toda função é pura: mesmo input → mesmo output.
// Cada resultado carrega { value, formula, source, confidence } — auditável.
// ============================================================================

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// TMB / BMR
// ---------------------------------------------------------------------------
function bmrMifflinStJeor({ weightKg, heightCm, age, sex }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const value = sex === 'M' ? base + 5 : base - 161;
  return { value: round(value, 0), formula: 'MIFFLIN_ST_JEOR', source: 'Mifflin et al. 1990', confidence: 'high' };
}

function bmrKatchMcArdle({ lbmKg }) {
  return { value: round(370 + 21.6 * lbmKg, 0), formula: 'KATCH_MCARDLE', source: 'Katch & McArdle 1996', confidence: 'high' };
}

function bmrHarrisBenedict({ weightKg, heightCm, age, sex }) {
  const value = sex === 'M'
    ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
    : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age;
  return { value: round(value, 0), formula: 'HARRIS_BENEDICT', source: 'Roza & Shizgal 1984', confidence: 'medium' };
}

// Seleção de fórmula por regra: Katch-McArdle se %gordura confiável, senão Mifflin.
function bmr(profile) {
  if (profile.bodyFatPct != null && profile.bfConfidence === 'high') {
    const lbmKg = profile.weightKg * (1 - profile.bodyFatPct / 100);
    return bmrKatchMcArdle({ lbmKg });
  }
  return bmrMifflinStJeor(profile);
}

// ---------------------------------------------------------------------------
// TDEE — fatores de atividade padronizados
// ---------------------------------------------------------------------------
const ACTIVITY_FACTORS = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, athlete: 1.9,
};

function tdee(profile) {
  const b = bmr(profile);
  const factor = ACTIVITY_FACTORS[profile.activityLevel];
  if (!factor) throw new Error(`activityLevel inválido: ${profile.activityLevel}`);
  return { value: round(b.value * factor, 0), formula: `${b.formula} x AF(${factor})`, source: b.source, confidence: b.confidence };
}

// ---------------------------------------------------------------------------
// %Gordura — US Navy
// ---------------------------------------------------------------------------
function bodyFatUsNavy({ sex, heightCm, waistCm, neckCm, hipCm }) {
  const log10 = Math.log10;
  let value;
  if (sex === 'M') {
    value = 495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
  } else {
    if (hipCm == null) throw new Error('hipCm obrigatório para sexo F na fórmula US Navy');
    value = 495 / (1.29579 - 0.35004 * log10(waistCm + hipCm - neckCm) + 0.22100 * log10(heightCm)) - 450;
  }
  return { value: round(value, 1), formula: 'US_NAVY_BF', source: 'Hodgdon & Beckett 1984', confidence: 'medium', errorMargin: '±3-4%' };
}

// ---------------------------------------------------------------------------
// %Gordura — RFM (Relative Fat Mass): só altura + cintura, validado vs DXA,
// mais preciso que IMC (Woolcott & Bergman 2018, NHANES). sex: 'M'|'F'.
// ---------------------------------------------------------------------------
function bodyFatRfm({ sex, heightCm, waistCm }) {
  if (!(waistCm > 0)) throw new Error('waistCm obrigatório para RFM');
  const base = sex === 'M' ? 64 : 76;
  const value = base - 20 * (heightCm / waistCm);
  return { value: round(value, 1), formula: 'RFM', source: 'Woolcott & Bergman 2018 (NHANES/DXA)', confidence: 'medium', errorMargin: '±~5% vs DXA' };
}

// %Gordura por dobras cutâneas — Jackson-Pollock + Siri.
// JP3 homem: peito, abdômen, coxa | mulher: tríceps, supra-ilíaca, coxa.
function bodyFatJacksonPollock3({ sex, age, sumMm }) {
  if (!(sumMm > 0)) throw new Error('sumMm > 0');
  const bd = sex === 'M'
    ? 1.10938 - 0.0008267 * sumMm + 0.0000016 * sumMm * sumMm - 0.0002574 * age
    : 1.0994921 - 0.0009929 * sumMm + 0.0000023 * sumMm * sumMm - 0.0001392 * age;
  return { value: round(495 / bd - 450, 1), formula: 'JACKSON_POLLOCK_3', source: 'Jackson & Pollock 1978/1980 + Siri', confidence: 'medium', errorMargin: '±3-4%' };
}
// JP7: peito, axilar-média, tríceps, subescapular, abdômen, supra-ilíaca, coxa.
function bodyFatJacksonPollock7({ sex, age, sumMm }) {
  if (!(sumMm > 0)) throw new Error('sumMm > 0');
  const bd = sex === 'M'
    ? 1.112 - 0.00043499 * sumMm + 0.00000055 * sumMm * sumMm - 0.00028826 * age
    : 1.097 - 0.00046971 * sumMm + 0.00000056 * sumMm * sumMm - 0.00012828 * age;
  return { value: round(495 / bd - 450, 1), formula: 'JACKSON_POLLOCK_7', source: 'Jackson & Pollock 1978/1980 + Siri', confidence: 'medium', errorMargin: '±3%' };
}

// Meta semanal de Zona 2 (base aeróbica/mitocondrial) por objetivo.
// San Millán: 150–200 min/sem saúde; mais para endurance. Sessões ≥45 min.
function zone2Weekly({ goal }) {
  const min = goal === 'performance' || goal === 'running' || goal === 'cycling' ? 240 : 150;
  const max = goal === 'performance' || goal === 'running' || goal === 'cycling' ? 400 : 200;
  return { minMin: min, maxMin: max, sessionMin: 45, source: 'San Millán (Zona 2, lactato 1,5–2 mmol)' };
}

// ---------------------------------------------------------------------------
// Meta calórica + macros (Módulo 4) — faixas ISSN codificadas
// ---------------------------------------------------------------------------
const GOAL_KCAL_ADJUST = {
  fat_loss:    { deltaPct: -20, guideline: 'DEFICIT_PCT 15-25% TDEE (Helms 2014)' },
  hypertrophy: { deltaPct: +10, guideline: 'SURPLUS_PCT 5-15% TDEE (Iraki 2019)' },
  maintenance: { deltaPct: 0,   guideline: 'manutenção' },
};

function targetKcal(profile) {
  const t = tdee(profile);
  const adj = GOAL_KCAL_ADJUST[profile.goal] || GOAL_KCAL_ADJUST.maintenance;
  const bmrFloor = bmr(profile).value * 1.1; // piso de segurança: nunca abaixo de 1,1×TMB
  const raw = t.value * (1 + adj.deltaPct / 100);
  return {
    value: round(Math.max(raw, bmrFloor), 0),
    formula: `TDEE ${adj.deltaPct >= 0 ? '+' : ''}${adj.deltaPct}%`,
    source: adj.guideline,
    confidence: t.confidence,
    flooredAtBmr: raw < bmrFloor,
  };
}

function macros(profile) {
  const kcal = targetKcal(profile);
  // Proteína: em déficit usa g/kg LBM alto (Helms); senão faixa ISSN por kg.
  let proteinG, proteinSrc;
  if (profile.goal === 'fat_loss' && profile.bodyFatPct != null) {
    const lbm = profile.weightKg * (1 - profile.bodyFatPct / 100);
    proteinG = round(2.6 * lbm, 0);
    proteinSrc = 'Helms 2014: 2,3-3,1 g/kg LBM em déficit';
  } else {
    // 1,8 g/kg: dentro do teto de 1,6 g/kg (Morton 2018, IC até 2,2) com margem.
    proteinG = round(1.8 * profile.weightKg, 0);
    proteinSrc = 'Morton 2018: teto 1,6 g/kg (IC 2,2)';
  }
  const fatG = round(0.8 * profile.weightKg, 0); // ISSN: mínimo 0,6-0,8 g/kg
  const carbG = round(Math.max(0, (kcal.value - proteinG * 4 - fatG * 9) / 4), 0);
  const fiberG = round(14 * kcal.value / 1000, 0); // IOM/DRI: 14 g/1000 kcal
  // Proteína por refeição p/ maximizar síntese: ~0,4 g/kg (Schoenfeld & Aragon 2018).
  const proteinPerMealG = round(0.4 * profile.weightKg, 0);
  return {
    kcal: kcal.value, proteinG, fatG, carbG, fiberG, proteinPerMealG,
    sources: { kcal: kcal.source, protein: proteinSrc, fat: 'ISSN 2017: ≥0,8 g/kg', fiber: 'IOM/DRI 2005', perMeal: 'Schoenfeld & Aragon 2018: ~0,4 g/kg/refeição' },
    confidence: kcal.confidence,
  };
}

function waterMl({ weightKg, trainingMinPerDay = 0 }) {
  const value = 35 * weightKg + Math.round(trainingMinPerDay / 60) * 750;
  return { value: Math.round(value), formula: 'WATER_ML_KG', source: 'EFSA 2010 (35 ml/kg + treino)', confidence: 'medium' };
}

// ---------------------------------------------------------------------------
// Performance (Módulo 14)
// ---------------------------------------------------------------------------
function oneRepMaxEpley({ loadKg, reps }) {
  if (reps < 1) throw new Error('reps >= 1');
  const value = reps === 1 ? loadKg : loadKg * (1 + reps / 30);
  return { value: round(value, 1), formula: 'EPLEY_1RM', source: 'Epley 1985', confidence: reps <= 10 ? 'high' : 'low' };
}

function oneRepMaxBrzycki({ loadKg, reps }) {
  if (reps < 1 || reps >= 37) throw new Error('reps entre 1 e 36');
  const value = reps === 1 ? loadKg : loadKg * (36 / (37 - reps));
  return { value: round(value, 1), formula: 'BRZYCKI_1RM', source: 'Brzycki 1993', confidence: reps <= 10 ? 'high' : 'low' };
}

// Percentuais de 1RM por repetições-alvo (tabela de treino padrão).
function loadForReps({ oneRm, reps }) {
  const pct = { 1: 1.0, 2: 0.97, 3: 0.94, 4: 0.92, 5: 0.89, 6: 0.86, 8: 0.81, 10: 0.75, 12: 0.71, 15: 0.65 };
  const p = pct[reps] != null ? pct[reps] : Math.max(0.5, 1 - 0.0333 * (reps - 1)); // Epley invertido
  return { value: round(oneRm * p, 1), pctOfMax: Math.round(p * 100), formula: '1RM×%', source: 'Tabela de intensidade (ACSM)', confidence: reps <= 12 ? 'high' : 'low' };
}

// Pace de corrida: min/km a partir de distância (km) e tempo (min).
function pacePerKm({ distanceKm, totalMinutes }) {
  if (distanceKm <= 0) throw new Error('distanceKm > 0');
  const minPerKm = totalMinutes / distanceKm;
  const mm = Math.floor(minPerKm);
  const ss = Math.round((minPerKm - mm) * 60);
  const [MM, SS] = ss === 60 ? [mm + 1, 0] : [mm, ss];
  return { value: round(minPerKm, 3), label: `${MM}:${String(SS).padStart(2, '0')}/km`, speedKmh: round(60 / minPerKm, 1), formula: 'PACE', source: 'aritmética', confidence: 'high' };
}

// Gasto calórico por atividade via MET (1 MET = 1 kcal/kg/h — Compêndio de Ainsworth).
const MET = {
  caminhada: 3.5, corrida_leve: 8.3, corrida_forte: 11.0, ciclismo: 8.0,
  natacao: 7.0, musculacao: 5.0, hiit: 8.5, funcional: 6.0, yoga: 2.5, futebol: 7.0,
};
function activityKcal({ activity, weightKg, minutes }) {
  const met = MET[activity];
  if (met == null) throw new Error(`atividade inválida: ${activity}`);
  return { value: Math.round(met * weightKg * (minutes / 60)), met, formula: 'MET_KCAL', source: 'Ainsworth Compendium 2011', confidence: 'medium' };
}

// VO2máx estimado pelo teste de Cooper (distância em metros em 12 min).
function vo2maxCooper({ distanceM }) {
  const value = (distanceM - 504.9) / 44.73;
  return { value: round(value, 1), formula: 'VO2MAX_COOPER', source: 'Cooper 1968', confidence: 'medium', errorMargin: '±10%' };
}

function hrMaxTanaka({ age }) {
  return { value: Math.round(208 - 0.7 * age), formula: 'TANAKA_HRMAX', source: 'Tanaka 2001', confidence: 'medium', errorMargin: '±7-10 bpm' };
}

function hrZonesKarvonen({ age, hrRest }) {
  const hrMax = hrMaxTanaka({ age }).value;
  const zone = (lo, hi) => ({
    min: Math.round(hrRest + lo * (hrMax - hrRest)),
    max: Math.round(hrRest + hi * (hrMax - hrRest)),
  });
  return {
    hrMax,
    zones: { z1: zone(0.5, 0.6), z2: zone(0.6, 0.7), z3: zone(0.7, 0.8), z4: zone(0.8, 0.9), z5: zone(0.9, 1.0) },
    formula: 'KARVONEN_HR + TANAKA_HRMAX', source: 'Karvonen 1957; Tanaka 2001', confidence: 'medium',
  };
}

function bmi({ weightKg, heightCm }) {
  const h = heightCm / 100;
  return { value: round(weightKg / (h * h), 1), formula: 'BMI', source: 'OMS', confidence: 'high' };
}

function ffmi({ weightKg, heightCm, bodyFatPct }) {
  const h = heightCm / 100;
  const lbm = weightKg * (1 - bodyFatPct / 100);
  const value = lbm / (h * h) + 6.1 * (1.8 - h);
  return { value: round(value, 1), formula: 'FFMI', source: 'Kouri 1995', confidence: 'medium' };
}

module.exports = {
  bmr, bmrMifflinStJeor, bmrKatchMcArdle, bmrHarrisBenedict,
  tdee, targetKcal, macros, waterMl,
  bodyFatUsNavy, bodyFatRfm, bodyFatJacksonPollock3, bodyFatJacksonPollock7, zone2Weekly,
  oneRepMaxEpley, oneRepMaxBrzycki, loadForReps,
  pacePerKm, activityKcal, vo2maxCooper,
  hrMaxTanaka, hrZonesKarvonen, bmi, ffmi,
  ACTIVITY_FACTORS, MET,
};
