'use strict';
// ============================================================================
// GERADOR DE TREINO POR REGRAS (Módulo 7)
// filtro (lesões + equipamento + nível) → split por frequência →
// volume/reps/descanso pelas diretrizes → progressão automática.
// Determinístico: ordem de seleção estável.
// ============================================================================

// Split por dias/semana (regra fixa, baseada em prática de periodização).
const SPLITS = {
  1: ['full_body'],
  2: ['full_body', 'full_body'],
  3: ['full_body', 'full_body', 'full_body'],
  4: ['upper', 'lower', 'upper', 'lower'],
  5: ['push', 'pull', 'legs', 'upper', 'lower'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

const DAY_PATTERNS = {
  full_body: ['squat', 'push_h', 'pull_h', 'hinge', 'push_v', 'core'],
  upper:     ['push_h', 'pull_h', 'push_v', 'pull_v', 'push_h', 'pull_h'],
  lower:     ['squat', 'hinge', 'squat', 'hinge', 'core', 'core'],
  push:      ['push_h', 'push_v', 'push_h', 'push_v', 'push_h'],
  pull:      ['pull_v', 'pull_h', 'pull_v', 'pull_h', 'pull_h'],
  legs:      ['squat', 'hinge', 'squat', 'hinge', 'core'],
};

// Faixas por objetivo (guideline ACSM/Schoenfeld codificada).
const GOAL_PARAMS = {
  hypertrophy: { repMin: 6, repMax: 12, targetRir: 2, restCompound: 150, restIsolation: 75 },
  strength:    { repMin: 3, repMax: 6,  targetRir: 2, restCompound: 180, restIsolation: 90 },
  fat_loss:    { repMin: 8, repMax: 15, targetRir: 2, restCompound: 120, restIsolation: 60 },
  health:      { repMin: 8, repMax: 15, targetRir: 3, restCompound: 120, restIsolation: 60 },
};

const LEVEL_SETS = { beginner: 2, intermediate: 3, advanced: 4 };
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

// Filtro determinístico: lesões excluem, equipamento e nível limitam.
function eligibleExercises(exercises, { conditions = [], equipment = [], level = 'beginner' }) {
  return exercises.filter((ex) => {
    if (ex.contraindicated_conditions.some((c) => conditions.includes(c))) return false;
    if (!ex.equipment.some((e) => equipment.includes(e))) return false;
    if (LEVEL_RANK[ex.difficulty] > LEVEL_RANK[level]) return false;
    return true;
  });
}

// Escolhe exercício para um padrão de movimento: composto primeiro, depois
// menor uso no plano (variedade), desempate por nome (determinismo).
function pickExercise(pattern, pool, usage) {
  const candidates = pool
    .filter((ex) => ex.movement_pattern === pattern)
    .sort((a, b) =>
      (b.is_compound - a.is_compound) ||
      ((usage.get(a.code) || 0) - (usage.get(b.code) || 0)) ||
      a.code.localeCompare(b.code));
  if (!candidates.length) return null;
  const chosen = candidates[0];
  usage.set(chosen.code, (usage.get(chosen.code) || 0) + 1);
  return chosen;
}

function generateWorkoutPlan({ exercises, goal = 'hypertrophy', level = 'beginner', daysPerWeek = 3, conditions = [], equipment = ['bodyweight'], sessionMinutes = 60 }) {
  const split = SPLITS[Math.min(Math.max(daysPerWeek, 1), 6)];
  const params = GOAL_PARAMS[goal] || GOAL_PARAMS.health;
  const sets = LEVEL_SETS[level] || 2;
  const pool = eligibleExercises(exercises, { conditions, equipment, level });
  if (!pool.length) return { blocked: true, reason: 'Nenhum exercício elegível — revise equipamentos/lesões.' };

  // Tempo limita quantidade de exercícios: ~8 min por exercício (séries+descanso).
  const maxExercises = Math.max(3, Math.floor(sessionMinutes / 8));
  const usage = new Map();

  const sessions = split.map((dayType, i) => {
    const patterns = DAY_PATTERNS[dayType].slice(0, maxExercises);
    const items = [];
    for (const pattern of patterns) {
      const ex = pickExercise(pattern, pool, usage);
      if (!ex) continue; // padrão sem exercício elegível: pula (registrado abaixo)
      items.push({
        exercise: ex.name, code: ex.code, pattern,
        sets, repMin: params.repMin, repMax: params.repMax,
        targetRir: params.targetRir,
        restSeconds: ex.is_compound ? params.restCompound : params.restIsolation,
        tempo: '2-0-1-0',
      });
    }
    return { day: i + 1, type: dayType, warmup: '5-8 min cardio leve + mobilidade específica', items };
  });

  // Auditoria de volume semanal por músculo (guideline 10-20 séries/semana).
  const weeklyVolume = {};
  for (const s of sessions) for (const it of s.items) {
    const ex = pool.find((e) => e.code === it.code);
    weeklyVolume[ex.primary_muscle] = (weeklyVolume[ex.primary_muscle] || 0) + it.sets;
  }

  return {
    blocked: false, split: split.join('/'), sessions, weeklyVolume,
    guidelines: { volume: 'Schoenfeld 2017: 10-20 séries/músculo/semana', reps: `${params.repMin}-${params.repMax} (${goal})`, deload: 'a cada 4-6 semanas' },
  };
}

// ---------------------------------------------------------------------------
// PROGRESSÃO AUTOMÁTICA (regra PROGRESS_LOAD_TOP_REPS_2X do seed)
// Recebe histórico de sessões de um exercício → decide próxima carga.
// ---------------------------------------------------------------------------
function nextLoad({ history, repMax, isCompound }) {
  // history: [{ sets: [{reps, loadKg, rir}] }] mais recente por último.
  if (history.length < 2) return { change: 'keep', reason: 'Histórico insuficiente (mínimo 2 sessões).' };
  const lastTwo = history.slice(-2);
  const mastered = lastTwo.every((session) =>
    session.sets.length > 0 && session.sets.every((s) => s.reps >= repMax && (s.rir == null || s.rir >= 1)));
  if (!mastered) return { change: 'keep', reason: 'Topo da faixa ainda não dominado em 2 sessões consecutivas.' };
  const pct = isCompound ? 2.5 : 5.0;
  const currentLoad = lastTwo[1].sets[0].loadKg;
  const next = Math.round((currentLoad * (1 + pct / 100)) * 2) / 2; // arredonda a 0,5 kg
  return { change: 'increase', nextLoadKg: next, deltaPct: pct, rule: 'PROGRESS_LOAD_TOP_REPS_2X', reason: `Todas as séries no topo da faixa (${repMax} reps) com RIR≥1 em 2 sessões.` };
}

// ---------------------------------------------------------------------------
// LANDMARKS DE VOLUME MEV/MAV/MRV por músculo (séries/semana).
// Baseado em Israetel/Renaissance Periodization + dose-resposta Pelland 2024
// (retornos decrescentes; MRV sustentável só 1–2 semanas → deload).
// ---------------------------------------------------------------------------
const VOLUME_LANDMARKS = {
  chest:      { mev: 8,  mav: 16, mrv: 22 },
  back:       { mev: 10, mav: 18, mrv: 25 },
  lats:       { mev: 10, mav: 18, mrv: 25 },
  quadriceps: { mev: 8,  mav: 16, mrv: 20 },
  hamstrings: { mev: 6,  mav: 14, mrv: 18 },
  glutes:     { mev: 4,  mav: 12, mrv: 16 },
  shoulders:  { mev: 8,  mav: 18, mrv: 26 },
  biceps:     { mev: 8,  mav: 16, mrv: 26 },
  triceps:    { mev: 6,  mav: 14, mrv: 18 },
  calves:     { mev: 8,  mav: 16, mrv: 20 },
  core:       { mev: 6,  mav: 16, mrv: 25 },
};
const DEFAULT_LANDMARK = { mev: 8, mav: 16, mrv: 22 };

// Classifica as séries semanais de um músculo contra seus landmarks.
function classifyVolume(muscle, sets) {
  const lm = VOLUME_LANDMARKS[muscle] || DEFAULT_LANDMARK;
  let status;
  if (sets < lm.mev) status = 'below_mev';        // submáximo — pode subir
  else if (sets <= lm.mav) status = 'productive'; // faixa produtiva
  else if (sets <= lm.mrv) status = 'high';       // alto — sustentável por pouco
  else status = 'above_mrv';                       // acima do recuperável — reduzir
  return { muscle, sets, status, ...lm };
}

// Audita um plano inteiro: séries/músculo/semana → classificação por landmark.
function auditVolume(weeklyVolume) {
  return Object.entries(weeklyVolume)
    .map(([muscle, sets]) => classifyVolume(muscle, sets))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

// ---------------------------------------------------------------------------
// PERIODIZAÇÃO em mesociclo: semanas de acúmulo rampam o volume (MEV→MRV) e a
// proximidade da falha (RIR 3→1); a última semana é DELOAD (50% volume, 80%
// carga, longe da falha). Baseado em periodização por acúmulo + Pelland 2024
// (MRV sustentável só 1–2 semanas → descarga programada).
// ---------------------------------------------------------------------------
function periodize(week, mesoLength = 5) {
  const w = Math.max(1, Math.min(week, mesoLength));
  if (w >= mesoLength) {
    return { week: w, mesoLength, phase: 'deload', setMult: 0.5, intensityMult: 0.8, targetRir: 4,
      note: 'Deload: 50% do volume, 80% da carga, longe da falha — dissipa fadiga e ressensibiliza.' };
  }
  const acc = mesoLength - 1;
  const t = acc > 1 ? (w - 1) / (acc - 1) : 0; // 0 na 1ª semana → 1 na última de acúmulo
  const setMult = Math.round((1 + t * 0.5) * 100) / 100; // +0% a +50% de volume
  const targetRir = Math.max(1, 3 - Math.round(t * 2));   // RIR 3 → 1
  return { week: w, mesoLength, phase: 'accumulation', setMult, intensityMult: 1, targetRir,
    progressPct: Math.round(t * 100),
    note: `Acúmulo: volume em ${Math.round(setMult * 100)}% da base, alvo RIR ${targetRir}.` };
}

// Aplica a periodização a um plano: escala as séries de cada exercício,
// respeitando o MRV do músculo (nunca ultrapassa o máximo recuperável).
function applyPeriodization(sessions, poolByCode, week, mesoLength = 5) {
  const per = periodize(week, mesoLength);
  const scaled = sessions.map((s) => ({
    ...s,
    items: s.items.map((it) => {
      const ex = poolByCode[it.code];
      const lm = (ex && VOLUME_LANDMARKS[ex.primary_muscle]) || DEFAULT_LANDMARK;
      const perExMrv = Math.max(1, Math.round(lm.mrv / 3)); // teto por exercício (~1/3 do MRV do músculo)
      const sets = Math.max(1, Math.min(Math.round(it.sets * per.setMult), perExMrv));
      return { ...it, sets, targetRir: per.targetRir };
    }),
  }));
  return { periodization: per, sessions: scaled };
}

module.exports = {
  generateWorkoutPlan, eligibleExercises, nextLoad, SPLITS, GOAL_PARAMS,
  classifyVolume, auditVolume, VOLUME_LANDMARKS,
  periodize, applyPeriodization,
};
