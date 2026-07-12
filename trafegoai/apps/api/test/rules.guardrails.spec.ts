import { BUDGET_GUARDRAILS, nextBudget } from '../src/rules/rules.guardrails';

describe('rules.guardrails — cálculo seguro de orçamento', () => {
  it('aumenta a verba pelo percentual informado', () => {
    expect(nextBudget('INCREASE_BUDGET', 100, 20)).toBe(120);
  });

  it('reduz a verba pelo percentual informado', () => {
    expect(nextBudget('DECREASE_BUDGET', 100, 30)).toBe(70);
  });

  it('limita a variação ao teto por disparo (MAX_STEP_PCT)', () => {
    // pedir +200% é limitado a +50%
    expect(nextBudget('INCREASE_BUDGET', 100, 200)).toBe(150);
  });

  it('nunca cai abaixo do piso absoluto', () => {
    expect(nextBudget('DECREASE_BUDGET', 6, 50)).toBe(BUDGET_GUARDRAILS.MIN); // 6*0.5=3 → piso 5
  });

  it('nunca passa do teto absoluto', () => {
    expect(nextBudget('INCREASE_BUDGET', 99_000, 50)).toBe(BUDGET_GUARDRAILS.MAX); // 99000*1.5 > 100000
  });
});
