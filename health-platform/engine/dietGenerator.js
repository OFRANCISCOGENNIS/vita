'use strict';
// ============================================================================
// GERADOR NUTRICIONAL POR REGRAS (Módulo 6)
// Recebe macros do motor + base de alimentos → seleciona e dosa por otimização
// gulosa determinística (ordem estável, sem aleatoriedade).
// ============================================================================

// Distribuição padrão de refeições (fração das kcal do dia).
const MEAL_SLOTS = [
  { slot: 'breakfast',       time: '07:00', kcalPct: 0.25 },
  { slot: 'lunch',           time: '12:00', kcalPct: 0.35 },
  { slot: 'afternoon_snack', time: '16:00', kcalPct: 0.15 },
  { slot: 'dinner',          time: '20:00', kcalPct: 0.25 },
];

// Filtro de elegibilidade: estratégia + alergias + restrições. Determinístico.
function eligibleFoods(foods, { strategy = {}, allergies = [], restrictions = [] }) {
  const req = (strategy.foodTagFilter && strategy.foodTagFilter.require) || [];
  const exc = (strategy.foodTagFilter && strategy.foodTagFilter.exclude) || [];
  const allergyTag = { lactose: 'lactose_free', gluten: 'gluten_free' };
  return foods.filter((f) => {
    if (req.some((t) => !f.tags.includes(t))) return false;
    if (exc.some((t) => f.tags.includes(t))) return false;
    for (const al of allergies) {
      const need = allergyTag[al];
      if (need && !f.tags.includes(need)) return false;
    }
    if (restrictions.includes('vegan') && !f.tags.includes('vegan')) return false;
    if (restrictions.includes('vegetarian') && !f.tags.includes('vegetarian')) return false;
    return true;
  });
}

// Contraindicação de estratégia (Módulo 6): condição do usuário bloqueia dieta.
function strategyAllowed(strategy, userConditions) {
  const contra = strategy.contraindications || [];
  return !contra.some((c) => userConditions.includes(c));
}

// Monta uma refeição: proteína primeiro (20-40 g/refeição — ISSN), depois
// carbo e gordura até bater a meta kcal do slot. Ordem de escolha estável:
// melhor densidade do nutriente-alvo, desempate por nome (determinismo).
// `rotate` desloca a escolha dentro do ranking (variedade semanal SEM sorteio:
// dia 0 usa a 1ª melhor fonte, dia 1 a 2ª, ... — determinístico por índice).
function buildMeal({ targetKcal, targetProteinG, foods, rotate = 0 }) {
  const byProteinDensity = [...foods]
    // Densidade >0,08 g proteína/kcal inclui ovo (0,091) e outras fontes mistas;
    // mínimo absoluto de 12 g/100 g barra fontes fracas (iogurte, tofu) como
    // prato principal — com elas, a porção de 300 g não fecha a meta proteica.
    .filter((f) => f.protein_g / Math.max(f.kcal, 1) > 0.08 && f.protein_g >= 12)
    .sort((a, b) => (b.protein_g / b.kcal) - (a.protein_g / a.kcal) || a.name.localeCompare(b.name));
  const byCarb = [...foods]
    .filter((f) => f.carb_g > f.protein_g && f.carb_g > f.fat_g)
    .sort((a, b) => b.carb_g - a.carb_g || a.name.localeCompare(b.name));
  const byFat = [...foods]
    .filter((f) => f.fat_g / Math.max(f.kcal, 1) > 0.05)
    .sort((a, b) => (b.fat_g / b.kcal) - (a.fat_g / a.kcal) || a.name.localeCompare(b.name));

  const items = [];
  let kcal = 0, protein = 0;

  const addFood = (food, grams) => {
    grams = Math.round(grams / 5) * 5; // arredonda a 5 g: prático na balança
    if (grams < 10) return;
    items.push({ food: food.name, grams, kcal: Math.round(food.kcal * grams / 100), proteinG: Math.round(food.protein_g * grams / 100) });
    kcal += food.kcal * grams / 100;
    protein += food.protein_g * grams / 100;
  };

  const pick = (list) => list.length ? list[rotate % list.length] : null;

  // 1. Proteína: fecha a meta proteica do slot com a melhor fonte elegível.
  // Reserva 15% da meta para a proteína dos acompanhamentos (arroz, feijão...),
  // senão o teto de 40 g/refeição (ISSN) estoura ao somar o prato inteiro.
  const p = pick(byProteinDensity);
  if (p) addFood(p, Math.min((targetProteinG * 0.85 / p.protein_g) * 100, 300));
  // 2. Carboidrato: preenche até ~80% das kcal restantes.
  const c = pick(byCarb);
  if (c && kcal < targetKcal) addFood(c, ((targetKcal - kcal) * 0.8 / c.kcal) * 100);
  // 3. Gordura: fecha o restante.
  const g = pick(byFat);
  if (g && kcal < targetKcal * 0.95) addFood(g, Math.min(((targetKcal - kcal) / g.kcal) * 100, 30));

  return { items, totalKcal: Math.round(kcal), totalProteinG: Math.round(protein) };
}

function generateDayPlan({ macros, foods, strategy = {}, allergies = [], restrictions = [], userConditions = [], dayIndex = 0 }) {
  if (!strategyAllowed(strategy, userConditions)) {
    return { blocked: true, reason: `Estratégia ${strategy.code || ''} contraindicada para: ${strategy.contraindications.filter((c) => userConditions.includes(c)).join(', ')}` };
  }
  const pool = eligibleFoods(foods, { strategy, allergies, restrictions });
  if (pool.length < 3) return { blocked: true, reason: 'Base de alimentos insuficiente após filtros — revise restrições ou amplie o catálogo.' };

  const meals = MEAL_SLOTS.map(({ slot, time, kcalPct }) => ({
    slot, time,
    targetKcal: Math.round(macros.kcal * kcalPct),
    // Proteína distribuída por refeição, respeitando teto de 40 g (ISSN).
    ...buildMeal({
      targetKcal: macros.kcal * kcalPct,
      targetProteinG: Math.min(Math.round(macros.proteinG * kcalPct * 1.15), 40),
      foods: pool,
      rotate: dayIndex,
    }),
  }));

  const totals = meals.reduce((t, m) => ({ kcal: t.kcal + m.totalKcal, proteinG: t.proteinG + m.totalProteinG }), { kcal: 0, proteinG: 0 });
  return { blocked: false, meals, totals, targets: { kcal: macros.kcal, proteinG: macros.proteinG } };
}

// Plano semanal (Módulo 6): 7 dias com rotação determinística de fontes
// (dia N usa a N-ésima melhor fonte de cada ranking) + lista de compras
// agregada da semana, ordenada por gramas totais.
const WEEK_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function generateWeekPlan(opts) {
  const days = WEEK_DAYS.map((label, i) => {
    const plan = generateDayPlan({ ...opts, dayIndex: i });
    return { label, dayIndex: i, ...plan };
  });
  if (days.some((d) => d.blocked)) return { blocked: true, reason: days.find((d) => d.blocked).reason };

  // Lista de compras: soma de gramas por alimento na semana inteira.
  const grams = new Map();
  for (const d of days) for (const m of d.meals) for (const it of m.items) {
    grams.set(it.food, (grams.get(it.food) || 0) + it.grams);
  }
  const shoppingList = [...grams.entries()]
    .map(([food, totalG]) => ({ food, totalG }))
    .sort((a, b) => b.totalG - a.totalG || a.food.localeCompare(b.food));

  const weekTotals = days.reduce((t, d) => ({ kcal: t.kcal + d.totals.kcal, proteinG: t.proteinG + d.totals.proteinG }), { kcal: 0, proteinG: 0 });
  return { blocked: false, days, shoppingList, weekTotals };
}

// Substituição inteligente: mesmo perfil de macros (menor distância euclidiana
// normalizada por kcal), mesma categoria preferida. Determinístico.
function findSubstitutes(food, pool, limit = 3) {
  const dist = (a, b) => {
    const ka = Math.max(a.kcal, 1), kb = Math.max(b.kcal, 1);
    return Math.hypot(a.protein_g / ka - b.protein_g / kb, a.carb_g / ka - b.carb_g / kb, a.fat_g / ka - b.fat_g / kb);
  };
  return pool
    .filter((f) => f.name !== food.name)
    .map((f) => ({ food: f, score: dist(food, f) + (f.category === food.category ? 0 : 0.05) }))
    .sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map(({ food: f, score }) => ({
      name: f.name,
      gramsPer100gOriginal: Math.round((food.kcal / Math.max(f.kcal, 1)) * 100), // isocalórico
      similarity: Math.round((1 - Math.min(score, 1)) * 1000) / 1000,
    }));
}

module.exports = { generateDayPlan, generateWeekPlan, eligibleFoods, strategyAllowed, buildMeal, findSubstitutes, MEAL_SLOTS, WEEK_DAYS };
