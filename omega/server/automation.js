// Camada 7 — Motor de Automação: fluxos armazenados + runtime de execução
// encadeada + framework de conectores + portão de aprovação humana para toda
// ação externa (princípio human-in-the-loop da arquitetura).
//
// Um fluxo é uma sequência de passos:
//   { id, name, active, steps: [{ connector, config }] }
// Cada passo recebe o "envelope" (contexto acumulado) e devolve um patch dele.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { route } from './router.js';

const DATA_DIR = process.env.OMEGA_DATA_DIR
  || join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FLOWS_FILE = join(DATA_DIR, 'flows.json');
const RUNS_FILE = join(DATA_DIR, 'runs.json');

function load(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
function save(file, obj) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2));
}

let flows = load(FLOWS_FILE, []);
let runs = load(RUNS_FILE, []);       // histórico de execuções (últimas 100)
const pending = new Map();            // runId -> { resolve, run } aprovações abertas

// --------------------------------------------------------------------------
// Framework de conectores. `external: true` exige aprovação humana antes de agir.
// Cada conector: { name, external, describe(config), run(config, envelope, ctx) }
// --------------------------------------------------------------------------
export const CONNECTORS = {
  // Gatilho manual/webhook: injeta o payload inicial no envelope.
  trigger: {
    name: 'trigger', external: false,
    describe: c => `Gatilho: ${c.source || 'manual'}`,
    run: (c, env) => ({ input: env.input ?? c.sample ?? '' })
  },

  // Resumo por IA: usa o Model Router (Camada 5). Interno (não escreve fora).
  summarize: {
    name: 'summarize', external: false,
    describe: () => 'Resumir conteúdo com IA',
    run: async (c, env) => {
      const text = String(env.input ?? env.text ?? '');
      const r = await route(
        'Você é um assistente que resume textos de forma concisa em português. Responda apenas com o resumo.',
        [{ role: 'user', content: `Resuma em até 3 frases:\n\n${text.slice(0, 4000)}` }]
      );
      return { summary: r.text, _provider: r.provider };
    }
  },

  // Transformação simples (template com ${campo} do envelope). Interno.
  transform: {
    name: 'transform', external: false,
    describe: c => `Formatar: "${(c.template || '').slice(0, 40)}…"`,
    run: (c, env) => ({
      output: String(c.template || '${summary}').replace(/\$\{(\w+)\}/g, (_, k) => env[k] ?? '')
    })
  },

  // AÇÃO EXTERNA — envio para Slack. Requer aprovação humana.
  slack: {
    name: 'slack', external: true,
    describe: c => `Enviar mensagem ao Slack (canal ${c.channel || '#geral'})`,
    run: async (c, env, ctx) => {
      const message = env.output ?? env.summary ?? env.input ?? '';
      if (c.webhookUrl) { // integração real quando configurada
        const res = await fetch(c.webhookUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ channel: c.channel, text: message })
        });
        return { delivered: res.ok, channel: c.channel, via: 'webhook' };
      }
      ctx.note('sem webhookUrl configurada — envio simulado (dry-run)');
      return { delivered: true, channel: c.channel || '#geral', message, via: 'dry-run' };
    }
  },

  // AÇÃO EXTERNA — requisição HTTP arbitrária. Requer aprovação humana.
  http: {
    name: 'http', external: true,
    describe: c => `${(c.method || 'GET').toUpperCase()} ${c.url}`,
    run: async (c, env, ctx) => {
      if (!/^https:\/\//.test(c.url || '')) throw new Error('http: apenas URLs https são permitidas');
      const res = await fetch(c.url, {
        method: c.method || 'GET',
        headers: c.headers || {},
        body: c.method && c.method !== 'GET' ? JSON.stringify(env.output ?? {}) : undefined
      });
      ctx.note(`resposta ${res.status}`);
      return { status: res.status, ok: res.ok };
    }
  }
};

// --------------------------------------------------------------------------
// CRUD de fluxos
// --------------------------------------------------------------------------
export function listFlows() { return flows; }
export function getFlow(id) { return flows.find(f => f.id === id) || null; }

export function createFlow({ name, steps = [], active = false }) {
  const flow = { id: randomUUID().slice(0, 8), name: name || 'Fluxo sem nome', steps, active,
    createdAt: new Date().toISOString() };
  // valida conectores
  for (const s of steps) {
    if (!CONNECTORS[s.connector]) throw new Error(`conector desconhecido: ${s.connector}`);
  }
  flows.push(flow); save(FLOWS_FILE, flows);
  return flow;
}

export function setActive(id, active) {
  const f = getFlow(id); if (!f) return null;
  f.active = !!active; save(FLOWS_FILE, flows); return f;
}

export function deleteFlow(id) {
  const i = flows.findIndex(f => f.id === id);
  if (i < 0) return false;
  flows.splice(i, 1); save(FLOWS_FILE, flows); return true;
}

// --------------------------------------------------------------------------
// Execução. `emit(event, data)` transmite progresso (SSE). Quando um passo
// externo é alcançado e não há autoApprove, a execução PAUSA aguardando
// aprovação via approveRun()/rejectRun().
// --------------------------------------------------------------------------
export function listRuns(flowId) {
  return runs.filter(r => !flowId || r.flowId === flowId).slice(-50).reverse();
}

function recordRun(run) {
  runs.push(run);
  if (runs.length > 100) runs.splice(0, runs.length - 100);
  save(RUNS_FILE, runs);
}

export async function runFlow(id, { input = '', autoApprove = false } = {}, emit = () => {}) {
  const flow = getFlow(id);
  if (!flow) throw new Error('fluxo não encontrado');

  const run = {
    id: randomUUID().slice(0, 8), flowId: id, flowName: flow.name,
    startedAt: new Date().toISOString(), status: 'rodando', steps: []
  };
  let envelope = { input };

  emit('run:start', { runId: run.id, flow: flow.name });

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const conn = CONNECTORS[step.connector];
    const entry = { i, connector: conn.name, describe: conn.describe(step.config || {}) };

    // Portão de aprovação humana para ações externas.
    if (conn.external && !autoApprove) {
      emit('run:approval', { runId: run.id, step: i, action: entry.describe });
      entry.status = 'aguardando aprovação';
      run.steps.push(entry);
      run.status = 'aguardando aprovação';
      run.pendingStep = i; run.envelope = envelope;
      recordRun(run);
      const decision = await new Promise(resolve => pending.set(run.id, { resolve, run }));
      if (decision === 'reject') {
        entry.status = 'rejeitado'; run.status = 'rejeitado';
        run.finishedAt = new Date().toISOString();
        save(RUNS_FILE, runs);
        emit('run:end', { runId: run.id, status: 'rejeitado' });
        return run;
      }
      entry.status = 'aprovado';
      emit('run:step', { runId: run.id, step: i, status: 'aprovado — executando' });
    } else {
      emit('run:step', { runId: run.id, step: i, status: 'executando', action: entry.describe });
    }

    try {
      const ctx = { note: msg => { entry.note = msg; } };
      const patch = await conn.run(step.config || {}, envelope, ctx);
      envelope = { ...envelope, ...patch };
      entry.status = 'ok';
      emit('run:step', { runId: run.id, step: i, status: 'ok', note: entry.note });
    } catch (err) {
      entry.status = 'erro'; entry.error = err.message;
      run.status = 'erro'; run.finishedAt = new Date().toISOString();
      recordRun(run);
      emit('run:end', { runId: run.id, status: 'erro', error: err.message });
      return run;
    }
  }

  run.status = 'concluído';
  run.finishedAt = new Date().toISOString();
  run.result = envelope;
  delete run.pendingStep; delete run.envelope;
  recordRun(run);
  emit('run:end', { runId: run.id, status: 'concluído', result: envelope });
  return run;
}

export function approveRun(runId) {
  const p = pending.get(runId);
  if (!p) return false;
  pending.delete(runId); p.resolve('approve'); return true;
}
export function rejectRun(runId) {
  const p = pending.get(runId);
  if (!p) return false;
  pending.delete(runId); p.resolve('reject'); return true;
}
export function pendingApprovals() {
  return [...pending.keys()];
}
