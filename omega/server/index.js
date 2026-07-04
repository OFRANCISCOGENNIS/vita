// OMEGA JARVIS X — servidor HTTP (Camada 1/16, MVP): API REST + SSE e cockpit web.
// Zero dependências externas: apenas Node.js >= 18.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS } from './agents.js';
import { availableProviders } from './router.js';
import { handleTask, tasksToday } from './orchestrator.js';
import { allFacts, forget } from './memory.js';

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const PORT = Number(process.env.PORT || 8420);
const START = Date.now();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error('payload muito grande');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  try {
    // ---------- API ----------
    if (path === '/api/status' && req.method === 'GET') {
      return json(res, 200, {
        status: 'ONLINE',
        version: '0.1.0',
        uptimeSeconds: Math.round((Date.now() - START) / 1000),
        agents: AGENTS.length,
        tasksToday: tasksToday(),
        providers: availableProviders()
      });
    }

    if (path === '/api/agents' && req.method === 'GET') {
      return json(res, 200, AGENTS.map(a => ({ name: a.name, domain: a.domain })));
    }

    if (path === '/api/memory' && req.method === 'GET') {
      return json(res, 200, allFacts());
    }

    const forgetMatch = path.match(/^\/api\/memory\/(\d+)$/);
    if (forgetMatch && req.method === 'DELETE') {
      const removed = forget(Number(forgetMatch[1]));
      return json(res, removed ? 200 : 404, { removed });
    }

    if (path === '/api/chat' && req.method === 'POST') {
      const { sessionId = 'default', text = '' } = await readBody(req);
      if (!text.trim()) return json(res, 400, { error: 'campo "text" é obrigatório' });

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });
      const emit = (event, data) =>
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      try {
        await handleTask(sessionId, text.slice(0, 4000), emit);
      } catch (err) {
        emit('error', { message: err.message });
      }
      emit('done', {});
      return res.end();
    }

    if (path.startsWith('/api/')) return json(res, 404, { error: 'rota não encontrada' });

    // ---------- cockpit (estático) ----------
    const rel = path === '/' ? 'index.html' : path.slice(1);
    const file = normalize(join(WEB_DIR, rel));
    if (!file.startsWith(WEB_DIR)) return json(res, 403, { error: 'caminho inválido' });
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      return res.end(body);
    } catch {
      return json(res, 404, { error: 'arquivo não encontrado' });
    }
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  const providers = availableProviders().filter(p => p.available).map(p => p.name).join(', ');
  console.log(`OMEGA JARVIS X online → http://localhost:${PORT}`);
  console.log(`Provedores disponíveis: ${providers}`);
});
