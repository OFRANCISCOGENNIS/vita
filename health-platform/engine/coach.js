'use strict';
// ============================================================================
// COACH POR REGRAS (Módulo 12) — mensagens SELECIONADAS de um banco condicionado
// ao estado do usuário, nunca geradas livremente. Determinístico: mesmo estado →
// mesma lista, na mesma ordem (por prioridade, desempate por código).
// ============================================================================

// Banco de mensagens. Cada uma: gatilho (predicado puro sobre `state`), prioridade
// (menor = mais urgente/no topo), categoria, nível e corpo. Espelha coach_message
// do SEED.sql. `body` pode ser função para interpolar números do estado.
const MESSAGES = [
  {
    code: 'RED_FLAG', priority: 0, category: 'alert', level: 'all',
    when: (s) => (s.redFlags || 0) > 0,
    body: () => 'Há uma bandeira de segurança ativa. Antes de seguir o plano, veja a aba Segurança e procure um profissional habilitado.',
  },
  {
    code: 'RAPID_LOSS', priority: 1, category: 'alert', level: 'all',
    when: (s) => s.rapidLoss === true,
    body: () => 'Você está perdendo peso rápido demais — isso custa massa muscular. O motor já sugeriu subir 10% das calorias. Reveja a meta.',
  },
  {
    code: 'LOW_WATER', priority: 2, category: 'reminder', level: 'all',
    when: (s) => s.waterPctToday != null && s.waterPctToday < 50,
    body: (s) => `Você bebeu ${Math.round(s.waterPctToday)}% da meta de água até agora. Uma garrafa de 500 ml agora te recoloca no ritmo.`,
  },
  {
    code: 'LOW_SLEEP', priority: 3, category: 'alert', level: 'all',
    when: (s) => s.sleepAvg7d != null && s.sleepAvg7d < 6,
    body: (s) => `Sua média de sono está em ${s.sleepAvg7d.toFixed(1)} h. Sono curto atrapalha recuperação e apetite — tente antecipar 30 min hoje.`,
  },
  {
    code: 'PLATEAU', priority: 4, category: 'feedback', level: 'all',
    when: (s) => s.plateau === true,
    body: () => 'Seu peso estagnou por 2 semanas mesmo com boa adesão. O motor ajustou −5% nas calorias e sugere +2000 passos/dia.',
  },
  {
    code: 'PROTEIN_GAP', priority: 5, category: 'correction', level: 'all',
    when: (s) => s.proteinGapPct != null && s.proteinGapPct > 15,
    body: (s) => `Faltam cerca de ${Math.round(s.proteinGapPct)}% da sua proteína do dia. Priorize uma fonte magra na próxima refeição.`,
  },
  {
    code: 'STREAK_MILESTONE', priority: 6, category: 'motivation', level: 'all',
    when: (s) => [7, 14, 30, 60, 100].includes(s.streakDays),
    body: (s) => `${s.streakDays} dias seguidos! Consistência é o que separa quem tenta de quem consegue. 🔥`,
  },
  {
    code: 'ADHERENCE_LOW', priority: 7, category: 'feedback', level: 'all',
    when: (s) => s.adherencePct != null && s.adherencePct < 60,
    body: () => 'Está difícil seguir o plano? Vamos simplificar antes de qualquer ajuste — adesão vale mais que perfeição teórica.',
  },
  {
    code: 'ON_TRACK', priority: 9, category: 'motivation', level: 'all',
    when: (s) => !s.plateau && !s.rapidLoss && (s.redFlags || 0) === 0 && (s.streakDays || 0) >= 1,
    body: (s) => `No rumo certo — sequência de ${s.streakDays} dia${s.streakDays === 1 ? '' : 's'} e nenhuma bandeira ativa. Mantenha o ritmo.`,
  },
];

// Seleciona todas as mensagens cujo gatilho casa, ordenadas por prioridade.
// `limit` opcional corta as N mais relevantes (as de menor prioridade).
function selectCoachMessages(state = {}, limit = Infinity) {
  return MESSAGES
    .filter((m) => {
      try { return m.when(state); } catch (e) { return false; }
    })
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))
    .slice(0, limit)
    .map((m) => ({ code: m.code, category: m.category, level: m.level, body: m.body(state) }));
}

module.exports = { selectCoachMessages, MESSAGES };
