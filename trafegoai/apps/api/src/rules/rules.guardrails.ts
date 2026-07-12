import { round } from '../common/metrics.util';

/** Limites de segurança aplicados às ações de orçamento das regras. */
export const BUDGET_GUARDRAILS = {
  MIN: 5, // R$/dia
  MAX: 100_000,
  MAX_STEP_PCT: 50, // teto de variação por disparo
};

/**
 * Calcula o próximo orçamento de uma ação INCREASE_BUDGET/DECREASE_BUDGET
 * aplicando: teto de variação por disparo, piso e teto absolutos.
 * Função pura — fácil de testar isoladamente.
 */
export function nextBudget(action: 'INCREASE_BUDGET' | 'DECREASE_BUDGET', current: number, rawPct: number): number {
  const pct = Math.min(Math.abs(rawPct), BUDGET_GUARDRAILS.MAX_STEP_PCT) * (action === 'INCREASE_BUDGET' ? 1 : -1);
  const next = current * (1 + pct / 100);
  return round(Math.min(Math.max(next, BUDGET_GUARDRAILS.MIN), BUDGET_GUARDRAILS.MAX));
}
