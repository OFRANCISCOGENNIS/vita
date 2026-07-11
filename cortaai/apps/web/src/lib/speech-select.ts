// Speech-driven segment selection + copy helpers (pure functions, no DOM).
//
// Given the real transcript (grouped into sentences) and the signal profile,
// picks cut windows that START on a strong "hook" sentence (question, number,
// imperative, impact word) and END on a sentence boundary — so cuts follow what
// is actually SAID in the video, not just where the audio is loud.

import type { AnalysisProfile } from "./video-analysis";
import type { SpeechSentence } from "./sentences";
import type { TranscriptWord } from "./types";

export interface HookScore {
  score: number; // 0..1
  reasons: string[];
}

export interface SpeechSegment {
  start: number;
  end: number;
  hookScore: number;
  hookText: string;
  sentences: SpeechSentence[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

// pt-BR cues -------------------------------------------------------------

const INTERROGATIVE_START =
  /^(por ?que|como|quanto|quantos?|qual|quais|o que|que que|você sabia|vocês sabiam|será que|cadê|quem|onde|quando)\b/i;

const IMPERATIVE_START =
  /^(olha|olhe|veja|vejam|presta|preste|imagina|imagine|escuta|escute|para|pare|cuidado|atenção|anota|anote|aprende|aprenda|não faça|não faz|lembra|lembre|pensa|pense|repara|repare|entende|entenda)\b/i;

const IMPACT_WORDS = [
  "segredo", "erro", "erros", "nunca", "ninguém", "proibido", "verdade", "mentira",
  "dinheiro", "grátis", "gratuito", "perigo", "perigoso", "absurdo", "chocante",
  "polêmico", "viral", "dica", "dicas", "truque", "macete", "urgente", "incrível",
  "impossível", "surreal", "bizarro", "cuidado", "atenção", "golpe", "armadilha",
];

const SUPERLATIVE = /\bo (maior|pior|melhor|único|mais)\b|\ba (maior|pior|melhor|única|mais)\b/i;

const NUMBER_CUE = /\d|r\$|%|\b(mil|milhão|milhões|bilhão|bilhões|por cento|metade|dobro|triplo)\b/i;

/** Leading fillers stripped from titles (common spoken-pt sentence starts). */
const LEADING_FILLERS =
  /^((né|então|tipo|assim|cara|mano|velho|bom|olha só|é o seguinte|enfim|aí|e aí|beleza|tá|ok|certo)[,.!?…]?\s+)+/i;

/** Small pt stoplist for keyword extraction (accent-stripped, matches `clean`). */
const STOPWORDS = new Set([
  "sobre", "porque", "quando", "entao", "tambem", "muito", "muita", "menos",
  "tudo", "nada", "aqui", "agora", "ainda", "gente", "coisa", "coisas", "fazer",
  "fazendo", "estava", "estou", "voces", "elas", "eles", "essa", "esse", "isso",
  "aquela", "aquele", "aquilo", "minha", "sempre", "nunca", "ficar", "ficou",
  "tinha", "tenho", "podem", "vamos", "onde", "depois", "antes", "assim",
]);

// -------------------------------------------------------------- hook scoring

export function scoreHook(text: string): HookScore {
  const t = text.trim();
  let score = 0;
  const reasons: string[] = [];
  const add = (v: number, why: string) => {
    score += v;
    reasons.push(why);
  };

  if (/\?\s*$/.test(t)) add(0.35, "pergunta");
  if (INTERROGATIVE_START.test(t)) add(0.2, "abre perguntando");
  if (NUMBER_CUE.test(t)) add(0.2, "número/valor concreto");
  if (IMPERATIVE_START.test(t)) add(0.15, "chamada direta");
  if (SUPERLATIVE.test(t)) add(0.15, "superlativo");

  const lower = t.toLowerCase();
  let impact = 0;
  for (const w of IMPACT_WORDS) {
    if (lower.includes(w)) impact += 0.15;
    if (impact >= 0.3) break;
  }
  if (impact > 0) add(Math.min(0.3, impact), "palavra de impacto");

  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4) add(-0.2, "frase curta demais");

  return { score: clamp(score, 0, 1), reasons };
}

// ---------------------------------------------------------- segment selection

/**
 * Pick up to `count` non-overlapping windows, each starting at a hook sentence
 * and ending at a sentence boundary near the ideal duration.
 */
export function selectSpeechSegments(
  sentences: SpeechSentence[],
  profile: AnalysisProfile,
  idealDuration: number,
  count: number,
  aggressiveness: number,
): SpeechSegment[] {
  if (sentences.length === 0 || count < 1) return [];
  const aggr = clamp(aggressiveness, 1, 5);
  const maxLen = idealDuration * (1.15 + aggr * 0.06);
  const minLen = Math.max(5, idealDuration * 0.45);

  // Long silences act as hard window stops (speaker pause / topic change).
  const hardStops = profile.silences.filter(([a, b]) => b - a > 1.5).map(([a]) => a);

  const scored = sentences.map((s, i) => ({ s, i, hook: scoreHook(s.text) }));
  let candidates = scored.filter((c) => c.hook.score >= 0.25);
  if (candidates.length < count) {
    candidates = [...scored].sort((a, b) => b.hook.score - a.hook.score).slice(0, count * 3);
  }

  const segments: SpeechSegment[] = [];
  for (const cand of candidates) {
    const included: SpeechSentence[] = [cand.s];
    let end = cand.s.end;
    for (let j = cand.i + 1; j < sentences.length; j++) {
      const next = sentences[j];
      const nextEnd = next.end;
      const len = nextEnd - cand.s.start;
      if (len > maxLen) break;
      // Stop when a long silence sits between the current end and the next sentence.
      const hitsStop = hardStops.some((t) => t >= end && t <= next.start);
      if (hitsStop && end - cand.s.start >= minLen) break;
      included.push(next);
      end = nextEnd;
      if (end - cand.s.start >= idealDuration * 0.7 && /[.!?…]$/.test(next.text)) break;
    }
    const start = Math.max(0, round1(cand.s.start - 0.3));
    const finalEnd = Math.min(profile.duration || end + 0.3, round1(end + 0.3));
    if (finalEnd - start < minLen) continue;
    segments.push({
      start,
      end: finalEnd,
      hookScore: cand.hook.score,
      hookText: cand.s.text,
      sentences: included,
    });
  }

  // Rank by hook + mean energy in the window + closeness to ideal duration.
  const energyMean = (a: number, b: number): number => {
    const { energy, windowSeconds: w } = profile;
    if (!energy.length) return 0.5;
    const i0 = clamp(Math.floor(a / w), 0, energy.length - 1);
    const i1 = clamp(Math.ceil(b / w), i0 + 1, energy.length);
    let sum = 0;
    for (let i = i0; i < i1; i++) sum += energy[i];
    return sum / (i1 - i0);
  };
  const rank = (seg: SpeechSegment): number => {
    const len = seg.end - seg.start;
    const durationFit = clamp(1 - Math.abs(len - idealDuration) / Math.max(1, idealDuration), 0, 1);
    return seg.hookScore * 0.45 + energyMean(seg.start, seg.end) * 0.3 + durationFit * 0.25;
  };
  segments.sort((a, b) => rank(b) - rank(a));

  // Greedy non-overlap (same min-gap rule as the signal pipeline).
  const minGap = Math.max(1.5, idealDuration * 0.2);
  const selected: SpeechSegment[] = [];
  const overlaps = (c: SpeechSegment) =>
    selected.some((s) => !(c.end + minGap <= s.start || c.start >= s.end + minGap));
  for (const seg of segments) {
    if (selected.length >= count) break;
    if (!overlaps(seg)) selected.push(seg);
  }
  return selected.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------- copy helpers

/** Turn a spoken sentence into a title: strip fillers, trim to `max`, capitalize. */
export function titleFromSentence(text: string, max = 60): string {
  let t = text.trim().replace(LEADING_FILLERS, "").trim();
  if (!t) t = text.trim();
  // Drop trailing period but keep ? / ! (they carry the hook).
  t = t.replace(/\.+$/, "");
  if (t.length > max) {
    const cut = t.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    t = `${cut.slice(0, lastSpace > max * 0.5 ? lastSpace : max).trimEnd()}…`;
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Most frequent meaningful word (≥5 chars, not a stopword) → "#palavra". */
export function pickKeywordHashtag(words: TranscriptWord[]): string | null {
  const freq = new Map<string, number>();
  for (const w of words) {
    const clean = w.word
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    if (clean.length < 5 || STOPWORDS.has(clean)) continue;
    freq.set(clean, (freq.get(clean) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 1;
  freq.forEach((count, word) => {
    if (count > bestCount) {
      best = word;
      bestCount = count;
    }
  });
  return best ? `#${best}` : null;
}
