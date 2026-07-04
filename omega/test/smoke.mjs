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
} finally {
  server.kill();
}

console.log(failures === 0 ? '\nTodos os testes passaram.' : `\n${failures} teste(s) falharam.`);
process.exit(failures === 0 ? 0 : 1);
