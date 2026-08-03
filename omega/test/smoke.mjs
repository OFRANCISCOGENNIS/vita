// Teste de fumaça: sobe o servidor em porta efêmera e exercita a API completa.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18000 + Math.floor(Math.random() * 2000);
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

const server = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT, OMEGA_DATA_DIR: mkdtempSync(join(tmpdir(), 'omega-')) },
  stdio: 'inherit'
});

try {
  // espera o servidor subir
  let up = false;
  for (let i = 0; i < 30 && !up; i++) {
    await new Promise(r => setTimeout(r, 200));
    up = await fetch(`${BASE}/api/status`).then(r => r.ok).catch(() => false);
  }
  check('servidor sobe', up);

  const status = await fetch(`${BASE}/api/status`).then(r => r.json());
  check('status ONLINE', status.status === 'ONLINE');
  check('14 agentes registrados', status.agents === 14);
  check('provedor local sempre disponível',
    status.providers.some(p => p.name === 'local' && p.available));

  const agents = await fetch(`${BASE}/api/agents`).then(r => r.json());
  check('lista de agentes tem OMEGA PRIME', agents.some(a => a.name === 'OMEGA PRIME'));

  // chat: intenção financeira deve rotear para IOTA e emitir plan/step/final via SSE
  const chat = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'smoke', text: 'Meu nome é Teste. Analise meus custos do mês.' })
  });
  const sse = await chat.text();
  check('chat responde SSE', chat.headers.get('content-type')?.includes('event-stream'));
  check('emite evento plan', sse.includes('event: plan'));
  check('roteia para IOTA (finanças)', sse.includes('"IOTA"'));
  check('emite resposta final', sse.includes('event: final'));
  check('emite done', sse.includes('event: done'));
  check('aprende fato (memória)', sse.includes('event: memory'));

  const facts = await fetch(`${BASE}/api/memory`).then(r => r.json());
  check('fato persistido na memória', facts.some(f => /meu nome é teste/i.test(f.text)));

  const bad = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '' })
  });
  check('rejeita texto vazio (400)', bad.status === 400);

  const cockpit = await fetch(`${BASE}/`).then(r => r.text());
  check('cockpit servido na raiz', cockpit.includes('OMEGA') && cockpit.includes('JARVIS'));

  const traversal = await fetch(`${BASE}/..%2f..%2fpackage.json`);
  check('bloqueia path traversal', traversal.status !== 200 || !(await traversal.text()).includes('"scripts"'));

  // ---------- Motor de Automação (Camada 7) ----------
  const connectors = await fetch(`${BASE}/api/connectors`).then(r => r.json());
  check('lista conectores', connectors.some(c => c.name === 'slack' && c.external));

  // fluxo: gatilho → resumo → transform → slack (ação externa)
  const flow = await fetch(`${BASE}/api/flows`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Resumo de e-mail no Slack',
      steps: [
        { connector: 'trigger', config: { source: 'manual' } },
        { connector: 'summarize', config: {} },
        { connector: 'transform', config: { template: 'Resumo: ${summary}' } },
        { connector: 'slack', config: { channel: '#financeiro' } }
      ]
    })
  }).then(r => r.json());
  check('cria fluxo com id', typeof flow.id === 'string' && flow.steps.length === 4);

  const badFlow = await fetch(`${BASE}/api/flows`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'x', steps: [{ connector: 'inexistente' }] })
  });
  check('rejeita conector desconhecido (400)', badFlow.status === 400);

  // executa: deve PAUSAR na ação externa (slack) aguardando aprovação.
  // Lançamos sem aguardar, detectamos a aprovação pendente e a rejeitamos
  // para liberar a conexão (a execução ficaria pendurada de outra forma).
  const runPromise = fetch(`${BASE}/api/flows/${flow.id}/run`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: 'Fatura de energia venceu; valor R$ 340; pagar até sexta.' })
  }).then(r => r.text());

  let pendingRunId = null;
  for (let i = 0; i < 40 && !pendingRunId; i++) {
    await new Promise(r => setTimeout(r, 100));
    const st = await fetch(`${BASE}/api/runs`).then(r => r.json());
    pendingRunId = st.pending[0] || null;
  }
  check('pausa aguardando aprovação humana na ação externa', !!pendingRunId);

  const rejected = await fetch(`${BASE}/api/runs/${pendingRunId}/reject`, { method: 'POST' }).then(r => r.json());
  check('aprovação humana pode rejeitar a ação', rejected.ok === true);

  const runSse = await runPromise;
  check('emite run:start', runSse.includes('event: run:start'));
  check('registra rejeição no run', runSse.includes('"status":"rejeitado"'));

  // com autoApprove, o fluxo roda até o fim e entrega no slack (dry-run)
  const autoSse = await fetch(`${BASE}/api/flows/${flow.id}/run`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: 'teste', autoApprove: true })
  }).then(r => r.text());
  check('com autoApprove conclui o fluxo', autoSse.includes('"status":"concluído"'));
  check('ação externa registrada (dry-run)', autoSse.includes('dry-run') || autoSse.includes('run:end'));

  const runs = await fetch(`${BASE}/api/runs`).then(r => r.json());
  check('histórico de execuções registrado', Array.isArray(runs.runs) && runs.runs.length >= 1);

  const activated = await fetch(`${BASE}/api/flows/${flow.id}/activate`, { method: 'POST' }).then(r => r.json());
  check('ativa fluxo', activated.active === true);
} finally {
  server.kill();
}

console.log(failures === 0 ? '\nTodos os testes passaram.' : `\n${failures} teste(s) falharam.`);
process.exit(failures === 0 ? 0 : 1);
