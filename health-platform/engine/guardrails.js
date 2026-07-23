'use strict';
// ============================================================================
// GUARDRAILS DE SEGURANÇA (Parte B) — regras determinísticas de red flag.
// Retorna { flags: [...], blocksGeneration: bool }. Sem flag → segue o fluxo;
// com flag bloqueante → pausa recomendação padrão e orienta profissional.
// ============================================================================

const { bmi } = require('./formulas');

const RED_FLAG_DEFS = {
  CHEST_PAIN:        { blocks: true,  message: 'Dor no peito ao esforço requer avaliação médica ANTES de qualquer plano de treino. Procure um cardiologista; se a dor for atual, procure emergência.' },
  PREGNANCY:         { blocks: true,  message: 'Gestação/lactação exige acompanhamento profissional individualizado. O sistema não gera déficit calórico nem estratégias restritivas neste estado.' },
  T1_DIABETES:       { blocks: true,  message: 'Diabetes tipo 1 exige plano supervisionado por equipe de saúde. Estratégias como jejum e cetogênica são bloqueadas.' },
  BMI_LT_175_CUTTING:{ blocks: true,  message: 'IMC abaixo de 17,5 com meta de emagrecimento não é seguro. Recomendamos avaliação com médico e nutricionista.' },
  ED_INDICATORS:     { blocks: true,  message: 'Suas respostas indicam um padrão que merece cuidado especializado. Procure um profissional de saúde mental e um nutricionista. CVV: 188.' },
  MINOR_NO_GUARDIAN: { blocks: true,  message: 'Menores de 16 anos precisam de responsável cadastrado para usar a plataforma.' },
  CRITICAL_LAB:      { blocks: false, message: 'Um exame retornou valor em faixa crítica. Leve o resultado a um médico o quanto antes.' },
  RAPID_LOSS:        { blocks: false, message: 'Perda de peso acima do ritmo seguro detectada; as calorias-alvo foram ajustadas automaticamente.' },
};

function evaluateRedFlags(input) {
  const flags = [];
  const add = (code, source) => flags.push({ code, source, ...RED_FLAG_DEFS[code] });

  const a = input.answers || {};
  if (a.chest_pain_exertion === true) add('CHEST_PAIN', 'questionnaire');
  if (a.pregnancy === true) add('PREGNANCY', 'questionnaire');
  if (a.t1_diabetes === true) add('T1_DIABETES', 'questionnaire');
  if (input.age != null && input.age < 16 && !input.hasGuardian) add('MINOR_NO_GUARDIAN', 'profile');

  if (input.weightKg && input.heightCm && input.goal === 'fat_loss') {
    if (bmi(input).value < 17.5) add('BMI_LT_175_CUTTING', 'measurement');
  }

  // Indicadores de transtorno alimentar: qualquer 2 de 3 sinais dispara.
  const ed = [a.extreme_restriction, a.compensatory_behavior, a.body_image_distortion].filter(Boolean).length;
  if (ed >= 2) add('ED_INDICATORS', 'questionnaire');

  for (const lab of input.criticalLabs || []) add('CRITICAL_LAB', `lab:${lab}`);

  return { flags, blocksGeneration: flags.some((f) => f.blocks) };
}

// Interpretação educativa de exame (Módulo 8): comparação com faixa, nunca dose.
function interpretLab({ value, range }) {
  const { normalMin, normalMax, criticalMin, criticalMax } = range;
  if (criticalMin != null && value < criticalMin) return 'critical';
  if (criticalMax != null && value > criticalMax) return 'critical';
  if (normalMin != null && value < normalMin) return 'below_range';
  if (normalMax != null && value > normalMax) return 'above_range';
  return 'in_range';
}

module.exports = { evaluateRedFlags, interpretLab, RED_FLAG_DEFS };
