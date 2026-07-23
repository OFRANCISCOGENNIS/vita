'use strict';
// ============================================================================
// TESTES DO MOTOR DETERMINÍSTICO — rodar com: node test.js
// Sem framework: assert nativo. Cada teste também valida DETERMINISMO
// (duas chamadas idênticas → resultados idênticos).
// ============================================================================
const assert = require('assert');
const F = require('./formulas');
const G = require('./guardrails');
const D = require('./dietGenerator');
const W = require('./workoutGenerator');
const A = require('./adaptation');
const C = require('./coach');
const REC = require('./recovery');
const NA = require('./nutritionAnalysis');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok - ${name}`); }
  catch (e) { console.error(`  FAIL - ${name}\n    ${e.message}`); process.exitCode = 1; }
}
const deterministic = (fn) => assert.deepStrictEqual(fn(), fn(), 'não determinístico!');

// ---------------------------------------------------------------------------
console.log('formulas.js');
// ---------------------------------------------------------------------------
const maleProfile = { weightKg: 80, heightCm: 180, age: 30, sex: 'M', activityLevel: 'moderate', goal: 'fat_loss', bodyFatPct: 20 };

test('Mifflin-St Jeor homem 80kg/180cm/30a = 1780 kcal', () => {
  assert.strictEqual(F.bmrMifflinStJeor(maleProfile).value, 1780); // 800+1125-150+5
});
test('Mifflin-St Jeor mulher 60kg/165cm/25a = 1345 kcal', () => {
  assert.strictEqual(F.bmrMifflinStJeor({ weightKg: 60, heightCm: 165, age: 25, sex: 'F' }).value, 1345);
});
test('Katch-McArdle LBM 64kg = 1752 kcal', () => {
  assert.strictEqual(F.bmrKatchMcArdle({ lbmKg: 64 }).value, 1752);
});
test('bmr() escolhe Katch-McArdle quando %gordura é confiável', () => {
  assert.strictEqual(F.bmr({ ...maleProfile, bfConfidence: 'high' }).formula, 'KATCH_MCARDLE');
  assert.strictEqual(F.bmr(maleProfile).formula, 'MIFFLIN_ST_JEOR');
});
test('TDEE = TMB × 1.55 (moderate)', () => {
  assert.strictEqual(F.tdee(maleProfile).value, Math.round(1780 * 1.55));
});
test('targetKcal em fat_loss = TDEE -20%, nunca abaixo de 1,1×TMB', () => {
  const t = F.targetKcal(maleProfile);
  assert.strictEqual(t.value, Math.round(2759 * 0.8));
  const sedentary = F.targetKcal({ ...maleProfile, activityLevel: 'sedentary' });
  assert.ok(sedentary.value >= 1780 * 1.1 - 1, 'piso 1,1×TMB violado');
});
test('macros em déficit usa 2,6 g/kg LBM (Helms)', () => {
  const m = F.macros(maleProfile);
  assert.strictEqual(m.proteinG, Math.round(2.6 * 80 * 0.8)); // LBM=64 → 166g
  assert.strictEqual(m.fatG, 64); // 0,8 g/kg
  assert.ok(m.carbG > 0);
  assert.ok(m.sources.protein.includes('Helms'));
});
test('macros fecham a conta calórica (±4 kcal de arredondamento por macro)', () => {
  const m = F.macros(maleProfile);
  const sum = m.proteinG * 4 + m.carbG * 4 + m.fatG * 9;
  assert.ok(Math.abs(sum - m.kcal) <= 8, `soma ${sum} vs alvo ${m.kcal}`);
});
test('US Navy %gordura homem — caso conhecido', () => {
  const bf = F.bodyFatUsNavy({ sex: 'M', heightCm: 180, waistCm: 85, neckCm: 38 });
  assert.ok(bf.value > 14 && bf.value < 19, `fora da faixa esperada: ${bf.value}`);
  assert.strictEqual(bf.confidence, 'medium');
});
test('US Navy exige quadril para sexo F', () => {
  assert.throws(() => F.bodyFatUsNavy({ sex: 'F', heightCm: 165, waistCm: 70, neckCm: 32 }));
});
test('Epley 1RM: 100kg × 10 reps = 133,3 kg; 1 rep = a própria carga', () => {
  assert.strictEqual(F.oneRepMaxEpley({ loadKg: 100, reps: 10 }).value, 133.3);
  assert.strictEqual(F.oneRepMaxEpley({ loadKg: 140, reps: 1 }).value, 140);
});
test('Zonas Karvonen coerentes (z1<z5, dentro de FCrep..FCmáx)', () => {
  const z = F.hrZonesKarvonen({ age: 30, hrRest: 60 });
  assert.strictEqual(z.hrMax, 187); // Tanaka: 208-21
  assert.ok(z.zones.z1.min >= 60 && z.zones.z5.max === 187);
  assert.ok(z.zones.z1.max < z.zones.z5.min);
});
test('água diária 80kg + 60min treino = 3550 ml', () => {
  assert.strictEqual(F.waterMl({ weightKg: 80, trainingMinPerDay: 60 }).value, 35 * 80 + 750);
});
test('Brzycki 1RM: 100kg × 10 = 133,3 kg; 1 rep = a própria carga', () => {
  assert.strictEqual(F.oneRepMaxBrzycki({ loadKg: 100, reps: 10 }).value, 133.3);
  assert.strictEqual(F.oneRepMaxBrzycki({ loadKg: 120, reps: 1 }).value, 120);
});
test('Brzycki rejeita reps fora de 1..36', () => {
  assert.throws(() => F.oneRepMaxBrzycki({ loadKg: 100, reps: 40 }));
});
test('carga para reps: 5 reps ≈ 89% do 1RM', () => {
  const r = F.loadForReps({ oneRm: 100, reps: 5 });
  assert.strictEqual(r.pctOfMax, 89);
  assert.strictEqual(r.value, 89);
});
test('pace: 10 km em 50 min = 5:00/km e 12 km/h', () => {
  const r = F.pacePerKm({ distanceKm: 10, totalMinutes: 50 });
  assert.strictEqual(r.label, '5:00/km');
  assert.strictEqual(r.speedKmh, 12);
});
test('pace arredonda segundos sem estourar (7,5 km em 40 min ≈ 5:20/km)', () => {
  assert.strictEqual(F.pacePerKm({ distanceKm: 7.5, totalMinutes: 40 }).label, '5:20/km');
});
test('gasto por atividade (MET): corrida leve 30min a 80kg = 332 kcal', () => {
  const r = F.activityKcal({ activity: 'corrida_leve', weightKg: 80, minutes: 30 });
  assert.strictEqual(r.value, Math.round(8.3 * 80 * 0.5));
  assert.strictEqual(r.met, 8.3);
});
test('atividade inválida lança erro', () => {
  assert.throws(() => F.activityKcal({ activity: 'teletransporte', weightKg: 80, minutes: 30 }));
});
test('VO2máx Cooper: 2400 m em 12 min ≈ 42,4 ml/kg/min', () => {
  assert.strictEqual(F.vo2maxCooper({ distanceM: 2400 }).value, 42.4);
});
test('RFM homem 180cm/85cm cintura = 21,6%', () => {
  assert.strictEqual(F.bodyFatRfm({ sex: 'M', heightCm: 180, waistCm: 85 }).value, 21.6);
});
test('RFM mulher usa base 76 (12 pontos acima do homem p/ mesma proporção)', () => {
  const m = F.bodyFatRfm({ sex: 'M', heightCm: 165, waistCm: 75 }).value;
  const f = F.bodyFatRfm({ sex: 'F', heightCm: 165, waistCm: 75 }).value;
  assert.strictEqual(Math.round((f - m) * 10) / 10, 12);
});
test('RFM exige cintura', () => {
  assert.throws(() => F.bodyFatRfm({ sex: 'M', heightCm: 180 }));
});
test('Jackson-Pollock 3 dobras homem (soma 60mm, 30a) em faixa plausível', () => {
  const r = F.bodyFatJacksonPollock3({ sex: 'M', age: 30, sumMm: 60 });
  assert.ok(r.value > 15 && r.value < 22, `fora do esperado: ${r.value}`);
  assert.strictEqual(r.formula, 'JACKSON_POLLOCK_3');
});
test('JP: mulher tem %gordura maior que homem p/ mesma soma/idade', () => {
  const m = F.bodyFatJacksonPollock3({ sex: 'M', age: 30, sumMm: 60 }).value;
  const f = F.bodyFatJacksonPollock3({ sex: 'F', age: 30, sumMm: 60 }).value;
  assert.ok(f > m);
});
test('JP7 exige soma positiva', () => {
  assert.throws(() => F.bodyFatJacksonPollock7({ sex: 'M', age: 30, sumMm: 0 }));
});
test('JP: mais dobras (soma maior) → mais gordura', () => {
  const lo = F.bodyFatJacksonPollock3({ sex: 'M', age: 30, sumMm: 40 }).value;
  const hi = F.bodyFatJacksonPollock3({ sex: 'M', age: 30, sumMm: 90 }).value;
  assert.ok(hi > lo);
});
test('proteína por refeição = 0,4 g/kg (Schoenfeld)', () => {
  assert.strictEqual(F.macros(maleProfile).proteinPerMealG, 32); // 0,4×80
  assert.ok(F.macros(maleProfile).sources.perMeal.includes('Schoenfeld'));
});
test('meta de Zona 2: saúde 150–200 min; endurance mais', () => {
  assert.deepStrictEqual([F.zone2Weekly({ goal: 'health' }).minMin, F.zone2Weekly({ goal: 'health' }).maxMin], [150, 200]);
  assert.ok(F.zone2Weekly({ goal: 'running' }).maxMin > 200);
});
test('formulas: determinismo', () => {
  deterministic(() => F.macros(maleProfile));
  deterministic(() => F.hrZonesKarvonen({ age: 41, hrRest: 55 }));
  deterministic(() => F.pacePerKm({ distanceKm: 21.1, totalMinutes: 105 }));
  deterministic(() => F.activityKcal({ activity: 'ciclismo', weightKg: 72, minutes: 45 }));
  deterministic(() => F.bodyFatRfm({ sex: 'F', heightCm: 168, waistCm: 78 }));
});

// ---------------------------------------------------------------------------
console.log('guardrails.js');
// ---------------------------------------------------------------------------
test('sem respostas de risco → sem flags, não bloqueia', () => {
  const r = G.evaluateRedFlags({ answers: {}, age: 30, weightKg: 80, heightCm: 180, goal: 'fat_loss' });
  assert.strictEqual(r.flags.length, 0);
  assert.strictEqual(r.blocksGeneration, false);
});
test('dor no peito bloqueia geração', () => {
  const r = G.evaluateRedFlags({ answers: { chest_pain_exertion: true } });
  assert.strictEqual(r.blocksGeneration, true);
  assert.strictEqual(r.flags[0].code, 'CHEST_PAIN');
});
test('IMC <17,5 com meta emagrecer bloqueia', () => {
  const r = G.evaluateRedFlags({ answers: {}, weightKg: 45, heightCm: 170, goal: 'fat_loss' });
  assert.ok(r.flags.some((f) => f.code === 'BMI_LT_175_CUTTING'));
  assert.strictEqual(r.blocksGeneration, true);
});
test('mesmo IMC baixo SEM meta de emagrecer não bloqueia', () => {
  const r = G.evaluateRedFlags({ answers: {}, weightKg: 45, heightCm: 170, goal: 'hypertrophy' });
  assert.strictEqual(r.blocksGeneration, false);
});
test('2 de 3 indicadores de TA disparam ED_INDICATORS', () => {
  const r = G.evaluateRedFlags({ answers: { extreme_restriction: true, compensatory_behavior: true } });
  assert.ok(r.flags.some((f) => f.code === 'ED_INDICATORS'));
});
test('menor de 16 sem responsável bloqueia; com responsável não', () => {
  assert.strictEqual(G.evaluateRedFlags({ answers: {}, age: 15, hasGuardian: false }).blocksGeneration, true);
  assert.strictEqual(G.evaluateRedFlags({ answers: {}, age: 15, hasGuardian: true }).blocksGeneration, false);
});
test('exame crítico gera flag NÃO bloqueante', () => {
  const r = G.evaluateRedFlags({ answers: {}, criticalLabs: ['GLUCOSE'] });
  assert.ok(r.flags.some((f) => f.code === 'CRITICAL_LAB' && !f.blocks));
  assert.strictEqual(r.blocksGeneration, false);
});
test('interpretLab cobre as 4 saídas', () => {
  const range = { normalMin: 70, normalMax: 99, criticalMin: 50, criticalMax: 200 };
  assert.strictEqual(G.interpretLab({ value: 85, range }), 'in_range');
  assert.strictEqual(G.interpretLab({ value: 60, range }), 'below_range');
  assert.strictEqual(G.interpretLab({ value: 120, range }), 'above_range');
  assert.strictEqual(G.interpretLab({ value: 220, range }), 'critical');
  assert.strictEqual(G.interpretLab({ value: 40, range }), 'critical');
});

// ---------------------------------------------------------------------------
console.log('dietGenerator.js');
// ---------------------------------------------------------------------------
// Base espelhando o SEED (nomes/valores idênticos ao SEED.sql).
const FOODS = [
  { name: 'Arroz, integral, cozido', category: 'cereals', kcal: 124, protein_g: 2.6, carb_g: 25.8, fat_g: 1.0, tags: ['vegan', 'vegetarian', 'gluten_free'] },
  { name: 'Feijão, carioca, cozido', category: 'legumes', kcal: 76, protein_g: 4.8, carb_g: 13.6, fat_g: 0.5, tags: ['vegan', 'vegetarian', 'gluten_free'] },
  { name: 'Frango, peito, grelhado', category: 'meats', kcal: 159, protein_g: 32.0, carb_g: 0.0, fat_g: 2.5, tags: ['gluten_free', 'lactose_free', 'animal_based', 'keto_friendly'] },
  { name: 'Ovo, cozido', category: 'eggs', kcal: 146, protein_g: 13.3, carb_g: 0.6, fat_g: 9.5, tags: ['vegetarian', 'gluten_free', 'lactose_free', 'animal_based', 'keto_friendly'] },
  { name: 'Batata, doce, cozida', category: 'tubers', kcal: 77, protein_g: 0.6, carb_g: 18.4, fat_g: 0.1, tags: ['vegan', 'vegetarian', 'gluten_free'] },
  { name: 'Azeite, extra virgem', category: 'oils', kcal: 884, protein_g: 0, carb_g: 0, fat_g: 100, tags: ['vegan', 'vegetarian', 'gluten_free', 'keto_friendly'] },
  { name: 'Tilápia, grelhada', category: 'fish', kcal: 96, protein_g: 20.1, carb_g: 0, fat_g: 1.7, tags: ['gluten_free', 'lactose_free', 'animal_based', 'keto_friendly'] },
  { name: 'Queijo, minas', category: 'dairy', kcal: 264, protein_g: 17.4, carb_g: 3.2, fat_g: 20.2, tags: ['vegetarian', 'gluten_free', 'keto_friendly'] },
];
const macros80kg = F.macros(maleProfile);

test('plano do dia gera 4 refeições e chega perto das metas', () => {
  const plan = D.generateDayPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] } });
  assert.strictEqual(plan.blocked, false);
  assert.strictEqual(plan.meals.length, 4);
  assert.ok(Math.abs(plan.totals.kcal - macros80kg.kcal) / macros80kg.kcal < 0.20, `kcal ${plan.totals.kcal} vs ${macros80kg.kcal}`);
  assert.ok(plan.totals.proteinG >= macros80kg.proteinG * 0.75, `proteína ${plan.totals.proteinG} vs ${macros80kg.proteinG}`);
});
test('nenhuma refeição passa de 40g de proteína (teto ISSN por refeição)', () => {
  const plan = D.generateDayPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] } });
  for (const m of plan.meals) assert.ok(m.totalProteinG <= 46, `${m.slot}: ${m.totalProteinG}g (com tolerância de arredondamento 5g)`);
});
test('restrição vegana remove todos os alimentos animais do plano', () => {
  const plan = D.generateDayPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] }, restrictions: ['vegan'] });
  const names = plan.meals.flatMap((m) => m.items.map((i) => i.food));
  for (const n of names) {
    const f = FOODS.find((x) => x.name === n);
    assert.ok(f.tags.includes('vegan'), `${n} não é vegano`);
  }
});
test('alergia a lactose exclui queijo', () => {
  const pool = D.eligibleFoods(FOODS, { allergies: ['lactose'] });
  assert.ok(!pool.some((f) => f.name.includes('Queijo')));
  assert.ok(pool.some((f) => f.name.includes('Frango')));
});
test('estratégia keto é BLOQUEADA para diabetes tipo 1 (contraindicação)', () => {
  const keto = { code: 'keto', foodTagFilter: { require: ['keto_friendly'] }, contraindications: ['t1_diabetes', 'pregnancy'] };
  const plan = D.generateDayPlan({ macros: macros80kg, foods: FOODS, strategy: keto, userConditions: ['t1_diabetes'] });
  assert.strictEqual(plan.blocked, true);
  assert.ok(plan.reason.includes('t1_diabetes'));
});
test('keto sem contraindicação filtra por tag keto_friendly', () => {
  const keto = { code: 'keto', foodTagFilter: { require: ['keto_friendly'] }, contraindications: ['t1_diabetes'] };
  const pool = D.eligibleFoods(FOODS, { strategy: keto });
  assert.ok(pool.every((f) => f.tags.includes('keto_friendly')));
});
test('substitutos do frango priorizam perfil proteico similar (tilápia primeiro)', () => {
  const frango = FOODS.find((f) => f.name.includes('Frango'));
  const subs = D.findSubstitutes(frango, FOODS);
  assert.strictEqual(subs[0].name, 'Tilápia, grelhada');
  assert.ok(subs[0].gramsPer100gOriginal > 100, 'tilápia tem menos kcal → precisa de mais gramas p/ isocalórico');
});
test('gerador de dieta: determinismo', () => {
  deterministic(() => D.generateDayPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] } }));
});
test('plano semanal: 7 dias, com VARIEDADE de proteína entre os dias (rotação)', () => {
  const week = D.generateWeekPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] } });
  assert.strictEqual(week.blocked, false);
  assert.strictEqual(week.days.length, 7);
  const lunchProteins = week.days.map((d) => d.meals[1].items[0].food);
  assert.ok(new Set(lunchProteins).size >= 3, `pouca variedade: ${[...new Set(lunchProteins)].join(', ')}`);
});
test('plano semanal: cada dia continua perto da meta calórica', () => {
  const week = D.generateWeekPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] } });
  for (const d of week.days) {
    assert.ok(Math.abs(d.totals.kcal - macros80kg.kcal) / macros80kg.kcal < 0.25, `${d.label}: ${d.totals.kcal} kcal vs ${macros80kg.kcal}`);
  }
});
test('lista de compras: soma da semana bate com os itens dos dias', () => {
  const week = D.generateWeekPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] } });
  const somaLista = week.shoppingList.reduce((s, i) => s + i.totalG, 0);
  const somaDias = week.days.reduce((s, d) => s + d.meals.reduce((s2, m) => s2 + m.items.reduce((s3, it) => s3 + it.grams, 0), 0), 0);
  assert.strictEqual(somaLista, somaDias);
  assert.ok(week.shoppingList.length >= 3);
});
test('plano semanal vegano: nenhuma fonte animal em nenhum dia', () => {
  const week = D.generateWeekPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] }, restrictions: ['vegan'] });
  for (const d of week.days) for (const m of d.meals) for (const it of m.items) {
    const f = FOODS.find((x) => x.name === it.food);
    assert.ok(f.tags.includes('vegan'), `${d.label}/${m.slot}: ${it.food} não é vegano`);
  }
});
test('plano semanal: determinismo', () => {
  deterministic(() => D.generateWeekPlan({ macros: macros80kg, foods: FOODS, strategy: { code: 'flexible', contraindications: [] } }));
});

// ---------------------------------------------------------------------------
console.log('workoutGenerator.js');
// ---------------------------------------------------------------------------
const EXERCISES = [
  { code: 'BB_BACK_SQUAT', name: 'Agachamento livre', primary_muscle: 'quadriceps', movement_pattern: 'squat', equipment: ['barbell'], difficulty: 'intermediate', is_compound: true, contraindicated_conditions: ['knee_injury', 'lumbar_hernia'] },
  { code: 'GOBLET_SQUAT', name: 'Agachamento goblet', primary_muscle: 'quadriceps', movement_pattern: 'squat', equipment: ['dumbbell'], difficulty: 'beginner', is_compound: true, contraindicated_conditions: ['knee_injury'] },
  { code: 'LEG_PRESS', name: 'Leg press', primary_muscle: 'quadriceps', movement_pattern: 'squat', equipment: ['machine'], difficulty: 'beginner', is_compound: true, contraindicated_conditions: ['knee_injury'] },
  { code: 'DB_RDL', name: 'Stiff halteres', primary_muscle: 'hamstrings', movement_pattern: 'hinge', equipment: ['dumbbell'], difficulty: 'beginner', is_compound: true, contraindicated_conditions: ['lumbar_hernia'] },
  { code: 'HIP_THRUST', name: 'Elevação pélvica', primary_muscle: 'glutes', movement_pattern: 'hinge', equipment: ['barbell', 'bodyweight'], difficulty: 'beginner', is_compound: true, contraindicated_conditions: [] },
  { code: 'DB_BENCH_PRESS', name: 'Supino halteres', primary_muscle: 'chest', movement_pattern: 'push_h', equipment: ['dumbbell'], difficulty: 'beginner', is_compound: true, contraindicated_conditions: ['shoulder_injury'] },
  { code: 'PUSH_UP', name: 'Flexão', primary_muscle: 'chest', movement_pattern: 'push_h', equipment: ['bodyweight'], difficulty: 'beginner', is_compound: true, contraindicated_conditions: ['wrist_injury'] },
  { code: 'OHP', name: 'Desenvolvimento', primary_muscle: 'shoulders', movement_pattern: 'push_v', equipment: ['barbell', 'dumbbell'], difficulty: 'intermediate', is_compound: true, contraindicated_conditions: ['shoulder_injury'] },
  { code: 'SEATED_ROW', name: 'Remada sentada', primary_muscle: 'back', movement_pattern: 'pull_h', equipment: ['machine', 'cable'], difficulty: 'beginner', is_compound: true, contraindicated_conditions: [] },
  { code: 'PULL_UP', name: 'Barra fixa', primary_muscle: 'lats', movement_pattern: 'pull_v', equipment: ['bodyweight'], difficulty: 'advanced', is_compound: true, contraindicated_conditions: ['shoulder_injury'] },
  { code: 'LAT_PULLDOWN', name: 'Puxada', primary_muscle: 'lats', movement_pattern: 'pull_v', equipment: ['cable', 'machine'], difficulty: 'beginner', is_compound: true, contraindicated_conditions: [] },
  { code: 'PLANK', name: 'Prancha', primary_muscle: 'core', movement_pattern: 'core', equipment: ['bodyweight'], difficulty: 'beginner', is_compound: false, contraindicated_conditions: [] },
];

test('lesão de joelho exclui TODOS os agachamentos; hérnia lombar exclui terra/stiff', () => {
  const pool = W.eligibleExercises(EXERCISES, { conditions: ['knee_injury'], equipment: ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable'], level: 'advanced' });
  assert.ok(!pool.some((e) => ['BB_BACK_SQUAT', 'GOBLET_SQUAT', 'LEG_PRESS'].includes(e.code)));
  const pool2 = W.eligibleExercises(EXERCISES, { conditions: ['lumbar_hernia'], equipment: ['barbell', 'dumbbell'], level: 'advanced' });
  assert.ok(!pool2.some((e) => ['DB_RDL', 'BB_BACK_SQUAT'].includes(e.code)));
  assert.ok(pool2.some((e) => e.code === 'HIP_THRUST'));
});
test('iniciante não recebe exercício advanced (barra fixa)', () => {
  const pool = W.eligibleExercises(EXERCISES, { conditions: [], equipment: ['bodyweight', 'cable'], level: 'beginner' });
  assert.ok(!pool.some((e) => e.code === 'PULL_UP'));
  assert.ok(pool.some((e) => e.code === 'LAT_PULLDOWN'));
});
test('só peso corporal em casa ainda gera plano', () => {
  const plan = W.generateWorkoutPlan({ exercises: EXERCISES, daysPerWeek: 3, equipment: ['bodyweight'], level: 'beginner' });
  assert.strictEqual(plan.blocked, false);
  const codes = plan.sessions.flatMap((s) => s.items.map((i) => i.code));
  assert.ok(codes.every((c) => EXERCISES.find((e) => e.code === c).equipment.includes('bodyweight')));
});
test('4 dias/semana gera split upper/lower; hipertrofia usa 6-12 reps', () => {
  const plan = W.generateWorkoutPlan({ exercises: EXERCISES, goal: 'hypertrophy', daysPerWeek: 4, equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'], level: 'intermediate' });
  assert.strictEqual(plan.split, 'upper/lower/upper/lower');
  for (const s of plan.sessions) for (const it of s.items) {
    assert.strictEqual(it.repMin, 6);
    assert.strictEqual(it.repMax, 12);
    assert.strictEqual(it.sets, 3); // intermediate
  }
});
test('descanso maior em compostos (150s) que isolados (75s) em hipertrofia', () => {
  const plan = W.generateWorkoutPlan({ exercises: EXERCISES, goal: 'hypertrophy', daysPerWeek: 3, equipment: ['bodyweight', 'cable', 'machine'], level: 'beginner' });
  const plank = plan.sessions.flatMap((s) => s.items).find((i) => i.code === 'PLANK');
  const compound = plan.sessions.flatMap((s) => s.items).find((i) => i.code !== 'PLANK');
  if (plank) assert.strictEqual(plank.restSeconds, 75);
  assert.strictEqual(compound.restSeconds, 150);
});
test('progressão: topo da faixa com RIR≥1 em 2 sessões → +2,5% composto', () => {
  const history = [
    { sets: [{ reps: 12, loadKg: 100, rir: 2 }, { reps: 12, loadKg: 100, rir: 1 }] },
    { sets: [{ reps: 12, loadKg: 100, rir: 2 }, { reps: 12, loadKg: 100, rir: 1 }] },
  ];
  const r = W.nextLoad({ history, repMax: 12, isCompound: true });
  assert.strictEqual(r.change, 'increase');
  assert.strictEqual(r.nextLoadKg, 102.5);
});
test('progressão: uma sessão abaixo do topo → mantém carga', () => {
  const history = [
    { sets: [{ reps: 12, loadKg: 100, rir: 1 }] },
    { sets: [{ reps: 10, loadKg: 100, rir: 0 }] },
  ];
  assert.strictEqual(W.nextLoad({ history, repMax: 12, isCompound: true }).change, 'keep');
});
test('landmarks de volume: classifica peito por MEV/MAV/MRV', () => {
  assert.strictEqual(W.classifyVolume('chest', 5).status, 'below_mev');   // <8
  assert.strictEqual(W.classifyVolume('chest', 12).status, 'productive'); // 8..16
  assert.strictEqual(W.classifyVolume('chest', 20).status, 'high');       // 16..22
  assert.strictEqual(W.classifyVolume('chest', 26).status, 'above_mrv');  // >22
});
test('músculo desconhecido usa landmark padrão sem quebrar', () => {
  const r = W.classifyVolume('forearms', 10);
  assert.strictEqual(r.mev, 8);
  assert.strictEqual(r.status, 'productive');
});
test('auditVolume ordena por séries desc e classifica cada músculo', () => {
  const audit = W.auditVolume({ chest: 12, quadriceps: 6, back: 20 });
  assert.strictEqual(audit[0].muscle, 'back');
  assert.strictEqual(audit.find((a) => a.muscle === 'quadriceps').status, 'below_mev');
});
test('periodização: semana 1 acúmulo (base, RIR 3); semana 4 pico (+50%, RIR 1)', () => {
  const w1 = W.periodize(1), w4 = W.periodize(4);
  assert.strictEqual(w1.phase, 'accumulation');
  assert.strictEqual(w1.setMult, 1);
  assert.strictEqual(w1.targetRir, 3);
  assert.strictEqual(w4.setMult, 1.5);
  assert.strictEqual(w4.targetRir, 1);
});
test('periodização: última semana é deload (50% volume, 80% carga)', () => {
  const d = W.periodize(5);
  assert.strictEqual(d.phase, 'deload');
  assert.strictEqual(d.setMult, 0.5);
  assert.strictEqual(d.intensityMult, 0.8);
});
test('periodização: semana além do mesociclo satura no deload', () => {
  assert.strictEqual(W.periodize(9).phase, 'deload');
});
test('applyPeriodization escala séries e nunca ultrapassa teto por exercício', () => {
  const sessions = [{ items: [{ code: 'BB_BENCH_PRESS', sets: 3 }] }];
  const pool = { BB_BENCH_PRESS: { primary_muscle: 'chest' } };
  const s1 = W.applyPeriodization(sessions, pool, 1);
  const s4 = W.applyPeriodization(sessions, pool, 4);
  assert.ok(s4.sessions[0].items[0].sets >= s1.sessions[0].items[0].sets); // pico ≥ base
  const deload = W.applyPeriodization(sessions, pool, 5);
  assert.ok(deload.sessions[0].items[0].sets < s1.sessions[0].items[0].sets); // deload reduz
});
test('periodização: determinismo', () => {
  deterministic(() => W.periodize(3, 5));
});
test('gerador de treino: determinismo', () => {
  deterministic(() => W.generateWorkoutPlan({ exercises: EXERCISES, goal: 'hypertrophy', daysPerWeek: 5, equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'], level: 'advanced' }));
});

// ---------------------------------------------------------------------------
console.log('adaptation.js');
// ---------------------------------------------------------------------------
const flat14d = Array.from({ length: 10 }, (_, i) => ({ day: i * 1.5, value: 82 + (i % 2 ? 0.1 : -0.1) })); // ruído sem tendência
const falling = Array.from({ length: 10 }, (_, i) => ({ day: i * 1.5, value: 84 - i * 0.12 })); // -~0,5 kg/sem
const crashing = Array.from({ length: 10 }, (_, i) => ({ day: i * 1.5, value: 84 - i * 0.35 })); // perda agressiva

test('peso estável 14d + adesão 85% → platô detectado', () => {
  const r = A.detectPlateau({ weighins: flat14d, adherencePct: 85, goal: 'fat_loss' });
  assert.strictEqual(r.plateau, true);
  assert.strictEqual(r.rule, 'PLATEAU_WEIGHT_14D');
});
test('peso caindo → NÃO é platô (tendência vence ruído)', () => {
  assert.strictEqual(A.detectPlateau({ weighins: falling, adherencePct: 90, goal: 'fat_loss' }).plateau, false);
});
test('adesão <80% → NÃO corta caloria; manda simplificar plano primeiro', () => {
  const r = A.detectPlateau({ weighins: flat14d, adherencePct: 60, goal: 'fat_loss' });
  assert.strictEqual(r.plateau, false);
  assert.ok(r.reason.includes('ADHERENCE_LOW_SIMPLIFY'));
});
test('menos de 8 pesagens → dados insuficientes', () => {
  assert.strictEqual(A.detectPlateau({ weighins: flat14d.slice(0, 5), adherencePct: 90, goal: 'fat_loss' }).plateau, false);
});
test('ação de platô: -5% kcal, mas respeita piso 1,1×TMB', () => {
  const a = A.applyPlateauAction({ targetKcal: 2200, bmrKcal: 1780 });
  assert.strictEqual(a.newTargetKcal, 2090);
  const floored = A.applyPlateauAction({ targetKcal: 1960, bmrKcal: 1800 });
  assert.strictEqual(floored.action, 'suggest_neat'); // 1960*0,95=1862 < 1980
  assert.strictEqual(floored.newTargetKcal, 1960);
});
test('freio de perda rápida: >1,5%/sem → +10% kcal e flag de revisão', () => {
  const r = A.rapidLossBrake({ weighins: crashing, targetKcal: 2000 });
  assert.strictEqual(r.triggered, true);
  assert.strictEqual(r.newTargetKcal, 2200);
  assert.strictEqual(r.flag, 'review_red_flags');
});
test('perda no ritmo seguro não dispara o freio', () => {
  assert.strictEqual(A.rapidLossBrake({ weighins: falling, targetKcal: 2000 }).triggered, false);
});
test('ETA de meta com faixa de incerteza (nunca ponto exato)', () => {
  const eta = A.goalEta({ weighins: falling, targetValue: 80 });
  assert.strictEqual(eta.reachable, true);
  assert.ok(eta.etaDays > 0 && eta.etaRangeDays >= 7);
});
test('meta na direção oposta da tendência → não alcançável', () => {
  assert.strictEqual(A.goalEta({ weighins: falling, targetValue: 90 }).reachable, false);
});
test('adaptation: determinismo', () => {
  deterministic(() => A.detectPlateau({ weighins: flat14d, adherencePct: 85, goal: 'fat_loss' }));
});

// ---------------------------------------------------------------------------
console.log('coach.js');
// ---------------------------------------------------------------------------
test('estado saudável com sequência → mensagem "no rumo certo"', () => {
  const msgs = C.selectCoachMessages({ streakDays: 5 });
  assert.ok(msgs.some((m) => m.code === 'ON_TRACK'));
});
test('red flag tem prioridade máxima (aparece primeiro)', () => {
  const msgs = C.selectCoachMessages({ redFlags: 1, waterPctToday: 20, streakDays: 3 });
  assert.strictEqual(msgs[0].code, 'RED_FLAG');
});
test('água baixa gera lembrete com o percentual interpolado', () => {
  const msgs = C.selectCoachMessages({ waterPctToday: 30 });
  const w = msgs.find((m) => m.code === 'LOW_WATER');
  assert.ok(w && w.body.includes('30%'));
});
test('marco de streak dispara só nos valores canônicos (7,14,30,60,100)', () => {
  assert.ok(C.selectCoachMessages({ streakDays: 7 }).some((m) => m.code === 'STREAK_MILESTONE'));
  assert.ok(!C.selectCoachMessages({ streakDays: 8 }).some((m) => m.code === 'STREAK_MILESTONE'));
});
test('perda rápida e platô nunca aparecem no mesmo estado, mas ambos vencem ON_TRACK', () => {
  const rapid = C.selectCoachMessages({ rapidLoss: true, streakDays: 3 });
  assert.strictEqual(rapid[0].code, 'RAPID_LOSS');
  assert.ok(!rapid.some((m) => m.code === 'ON_TRACK'));
});
test('limite N retorna as mensagens mais urgentes', () => {
  const msgs = C.selectCoachMessages({ redFlags: 1, waterPctToday: 10, sleepAvg7d: 5, streakDays: 3 }, 2);
  assert.strictEqual(msgs.length, 2);
  assert.strictEqual(msgs[0].code, 'RED_FLAG');
});
test('estado vazio não quebra e não inventa mensagem falsa', () => {
  const msgs = C.selectCoachMessages({});
  assert.ok(Array.isArray(msgs));
  assert.ok(!msgs.some((m) => m.code === 'ON_TRACK')); // sem streak, não afirma progresso
});
test('coach: determinismo', () => {
  deterministic(() => C.selectCoachMessages({ waterPctToday: 40, streakDays: 7, proteinGapPct: 20 }));
});

// ---------------------------------------------------------------------------
console.log('nutritionAnalysis.js');
// ---------------------------------------------------------------------------
const F_CHICKEN = { name: 'Frango', category: 'meats', kcal: 159, protein_g: 32, carb_g: 0, fat_g: 2.5, pdcaas: 0.92, glycemic_index: null, tags: ['animal'], micros: { potassium_mg: 256, magnesium_mg: 29, iron_mg: 1, zinc_mg: 1.8, calcium_mg: 12, vitc_mg: 0, vita_mcg: 16, omega3_g: 0.03, sodium_mg: 82 } };
const F_RICE = { name: 'Arroz', category: 'cereals', kcal: 124, protein_g: 2.6, carb_g: 25.8, fat_g: 1, pdcaas: 0.5, glycemic_index: 50, tags: ['vegan'], micros: { potassium_mg: 42, magnesium_mg: 43, iron_mg: 0.3, zinc_mg: 0.7, calcium_mg: 5, vitc_mg: 0, vita_mcg: 0, omega3_g: 0.01, sodium_mg: 1 } };
const F_BEANS = { name: 'Feijão', category: 'legumes', kcal: 76, protein_g: 4.8, carb_g: 13.6, fat_g: 0.5, pdcaas: 0.68, glycemic_index: 30, tags: ['vegan'], micros: { potassium_mg: 355, magnesium_mg: 42, iron_mg: 1.3, zinc_mg: 0.7, calcium_mg: 27, vitc_mg: 0, vita_mcg: 0, omega3_g: 0.1, sodium_mg: 2 } };

test('micros: soma proporcional às gramas e compara à meta por sexo', () => {
  const micros = NA.analyzeMicros([{ food: F_BEANS, grams: 200 }], 'F');
  const k = micros.find((x) => x.key === 'potassium_mg');
  assert.strictEqual(k.amount, 710); // 355×2
  assert.strictEqual(k.target, 2600); // F
  assert.strictEqual(k.status, 'low');
});
test('micros: sódio é teto (>100% vira "over")', () => {
  const salty = { name: 'x', micros: { sodium_mg: 3000 } };
  const s = NA.analyzeMicros([{ food: salty, grams: 100 }], 'M').find((x) => x.key === 'sodium_mg');
  assert.strictEqual(s.kind, 'ceiling');
  assert.strictEqual(s.status, 'over');
});
test('qualidade proteica: arroz+feijão sem animal → complementados, +0,1', () => {
  const q = NA.proteinQuality([{ food: F_RICE, grams: 200 }, { food: F_BEANS, grams: 200 }]);
  assert.strictEqual(q.complemented, true);
  // média ponderada (0.5×5.2 + 0.68×9.6)/14.8 = 0.617 → +0.1 = 0.72
  assert.ok(q.score > 0.7 && q.score <= 0.8);
});
test('qualidade proteica: cereal isolado → limitante = lisina', () => {
  const q = NA.proteinQuality([{ food: F_RICE, grams: 200 }]);
  assert.strictEqual(q.complemented, false);
  assert.strictEqual(q.limiting, 'lisina');
});
test('qualidade proteica: frango eleva score e zera limitante', () => {
  const q = NA.proteinQuality([{ food: F_CHICKEN, grams: 200 }]);
  assert.strictEqual(q.limiting, null);
  assert.ok(q.score >= 0.9);
});
test('distribuição proteica: alvo 0,4 g/kg e leucina ≥2,5 g', () => {
  const d = NA.proteinDistribution([{ slot: 'almoço', proteinG: 40 }, { slot: 'lanche', proteinG: 10 }], 80);
  assert.strictEqual(d.perMealTargetG, 32); // 0,4×80
  assert.strictEqual(d.rows[0].adequate, true);  // 40≥32 e leucina 3,4≥2,5
  assert.strictEqual(d.rows[1].adequate, false); // 10<32
  assert.strictEqual(d.nAdequate, 1);
});
test('carga glicêmica: soma IG×carbo/100 e classifica', () => {
  const gl = NA.glycemicLoad([{ food: F_RICE, grams: 200 }]); // IG50, carbo 51,6 → GL 25,8→26
  assert.strictEqual(gl.glDay, 26);
  assert.strictEqual(gl.status, 'low');
});
test('diário: soma consumo proporcional às gramas', () => {
  const s = NA.sumIntake([{ food: F_CHICKEN, grams: 150 }, { food: F_RICE, grams: 200 }]);
  assert.strictEqual(s.protein, Math.round(32 * 1.5 + 2.6 * 2)); // 48+5,2 → 53
  assert.ok(s.kcal > 0);
});
test('aderência: consumo no alvo → alta', () => {
  const a = NA.adherenceScore({ kcal: 2000, protein: 160 }, { kcal: 2000, protein: 160 });
  assert.strictEqual(a.adherence, 100);
  assert.strictEqual(a.status, 'high');
});
test('aderência: 500 kcal a menos e proteína curta → cai', () => {
  const a = NA.adherenceScore({ kcal: 1500, protein: 100 }, { kcal: 2000, protein: 160 });
  assert.ok(a.adherence < 70);
  assert.strictEqual(a.kcalDevPct, 25);
});
test('aderência: sobrar proteína não penaliza (só falta pesa)', () => {
  const mais = NA.adherenceScore({ kcal: 2000, protein: 200 }, { kcal: 2000, protein: 160 });
  assert.strictEqual(mais.proteinDeficitPct, 0);
  assert.strictEqual(mais.adherence, 100);
});
test('nutritionAnalysis: determinismo', () => {
  deterministic(() => NA.analyzeMicros([{ food: F_BEANS, grams: 150 }, { food: F_RICE, grams: 100 }], 'M'));
  deterministic(() => NA.proteinQuality([{ food: F_RICE, grams: 200 }, { food: F_BEANS, grams: 200 }]));
  deterministic(() => NA.adherenceScore({ kcal: 1800, protein: 140 }, { kcal: 2000, protein: 160 }));
});

// ---------------------------------------------------------------------------
console.log('recovery.js');
// ---------------------------------------------------------------------------
test('sem dados → score nulo', () => {
  assert.strictEqual(REC.recoveryScore({}).score, null);
});
test('sono ótimo + FC na base + frescor ideal → recuperação alta', () => {
  const r = REC.recoveryScore({ sleepH: 8, rhrLatest: 58, rhrBaseline: 58, daysSinceWorkout: 1 });
  assert.ok(r.score >= 90, `esperava alto, veio ${r.score}`);
  assert.strictEqual(r.zone, 'alta');
});
test('sono ruim derruba o score', () => {
  const bom = REC.recoveryScore({ sleepH: 8 }).score;
  const ruim = REC.recoveryScore({ sleepH: 4.5 }).score;
  assert.ok(ruim < bom);
});
test('FC de repouso elevada penaliza (cada bpm −8)', () => {
  const r = REC.recoveryScore({ rhrLatest: 63, rhrBaseline: 58 }); // +5 → 100-40=60
  assert.strictEqual(r.components.find((c) => c.key === 'rhr').value, 60);
});
test('treinar perto da falha (RIR baixo) reduz frescor', () => {
  const fresco = REC.recoveryScore({ daysSinceWorkout: 2, lastSessionAvgRir: 3 }).score;
  const fatigado = REC.recoveryScore({ daysSinceWorkout: 2, lastSessionAvgRir: 0.5 }).score;
  assert.ok(fatigado < fresco);
});
test('renormaliza pesos sobre componentes disponíveis (só sono = valor do sono)', () => {
  const r = REC.recoveryScore({ sleepH: 8 });
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.components.length, 1);
});
test('recovery: determinismo', () => {
  deterministic(() => REC.recoveryScore({ sleepH: 7, rhrLatest: 60, rhrBaseline: 57, daysSinceWorkout: 1, lastSessionAvgRir: 2 }));
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} testes passaram${process.exitCode ? ' (com falhas acima)' : ', 0 falhas'}`);
