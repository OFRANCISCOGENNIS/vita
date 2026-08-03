// Camada 4 — Memória Universal (MVP): memória temporária (sessões em RAM com
// espelho em disco) + memória persistente de fatos (JSON), com extração simples
// de fatos e recuperação por relevância de termos.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.OMEGA_DATA_DIR
  || join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FACTS_FILE = join(DATA_DIR, 'facts.json');
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json');

function load(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
function save(file, obj) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2));
}

const facts = load(FACTS_FILE, []);        // [{text, source, at}]
const sessions = load(SESSIONS_FILE, {});  // {sessionId: [{role, text, at}]}

// --- memória temporária (contexto da sessão) ---
export function remember(sessionId, role, text) {
  (sessions[sessionId] ||= []).push({ role, text, at: new Date().toISOString() });
  if (sessions[sessionId].length > 200) sessions[sessionId].splice(0, 100);
  save(SESSIONS_FILE, sessions);
}
export function history(sessionId, last = 10) {
  return (sessions[sessionId] || []).slice(-last);
}

// --- memória persistente (fatos) ---
const FACT_PATTERNS = [
  /(?:meu nome [ée]|me chamo)\s+([^.,!\n]{2,40})/i,
  /(?:eu trabalho (?:com|na|no|em)|minha empresa [ée])\s+([^.,!\n]{2,60})/i,
  /(?:eu prefiro|minha prefer[êe]ncia [ée])\s+([^.\n]{2,80})/i,
  /(?:meu objetivo [ée]|minha meta [ée])\s+([^.\n]{2,100})/i
];

export function extractFacts(sessionId, text) {
  const found = [];
  for (const re of FACT_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const fact = m[0].trim();
      if (!facts.some(f => f.text.toLowerCase() === fact.toLowerCase())) {
        facts.push({ text: fact, source: sessionId, at: new Date().toISOString() });
        found.push(fact);
      }
    }
  }
  if (found.length) save(FACTS_FILE, facts);
  return found;
}

// Recuperação: pontua fatos pela sobreposição de termos com a consulta.
export function retrieve(query, max = 5) {
  const terms = query.toLowerCase().split(/\W+/).filter(t => t.length > 3);
  return facts
    .map(f => ({ f, s: terms.filter(t => f.text.toLowerCase().includes(t)).length }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(x => x.f.text);
}

export function allFacts() { return facts.slice(); }
export function forget(index) {           // direito ao esquecimento (C15)
  const removed = facts.splice(index, 1);
  save(FACTS_FILE, facts);
  return removed[0] || null;
}
