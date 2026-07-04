// Camada 2 — OMEGA Core (Orchestrator): recebe a intenção, recupera contexto,
// seleciona agentes, roteia para o melhor modelo e valida com OMEGA PRIME.
// Emite eventos de progresso (para SSE) via callback `emit(event, data)`.
import { selectAgents, PRIME } from './agents.js';
import { route } from './router.js';
import { remember, history, extractFacts, retrieve } from './memory.js';

let taskCount = 0;
export function tasksToday() { return taskCount; }

function buildSystem(agent, factList) {
  const parts = [agent.persona];
  if (factList.length) {
    parts.push('Fatos conhecidos sobre o usuário:\n' + factList.map(f => `- ${f}`).join('\n'));
  }
  parts.push('Responda em português, de forma direta e útil. Nunca execute ações externas sem aprovação explícita do usuário.');
  return parts.join('\n\n');
}

export async function handleTask(sessionId, text, emit) {
  taskCount++;
  remember(sessionId, 'user', text);
  const learned = extractFacts(sessionId, text);
  if (learned.length) emit('memory', { learned });

  // 1. Recuperação de contexto (Camada 4)
  const factList = retrieve(text);

  // 2. Planejamento: seleção de agentes (Camada 3)
  const agents = selectAgents(text);
  emit('plan', {
    agents: agents.map(a => ({ name: a.name, domain: a.domain })),
    reviewer: PRIME.name,
    memoryHits: factList.length
  });

  // 3. Execução: cada agente responde (paralelo)
  const past = history(sessionId, 8)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  const results = await Promise.all(agents.map(async agent => {
    emit('step', { agent: agent.name, status: 'executando' });
    const r = await route(buildSystem(agent, factList), past.length ? past : [{ role: 'user', content: text }]);
    emit('step', { agent: agent.name, status: 'concluído', provider: r.provider, model: r.model });
    return { agent, ...r };
  }));

  // 4. Validação final — OMEGA PRIME (Camada 3)
  emit('step', { agent: PRIME.name, status: 'validando' });
  let final;
  if (results.length === 1) {
    final = results[0].text;
  } else {
    // Síntese: PRIME consolida as respostas dos agentes em uma só.
    const merged = results.map(r => `## ${r.agent.name} (${r.agent.domain})\n${r.text}`).join('\n\n');
    const r = await route(
      buildSystem(PRIME, []),
      [{ role: 'user', content: `Consolide as respostas dos agentes abaixo em uma única resposta final ao usuário (pergunta original: "${text}"):\n\n${merged}` }]
    );
    final = r.text;
  }
  emit('step', { agent: PRIME.name, status: 'aprovado' });

  remember(sessionId, 'jarvis', final);
  emit('final', {
    text: final,
    agents: results.map(r => r.agent.name),
    provider: results[0].provider,
    model: results[0].model
  });
}
