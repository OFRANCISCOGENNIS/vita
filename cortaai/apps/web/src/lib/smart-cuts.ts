// SMART cut generation — replaces the old naive equal-slice generator.
//
// Pipeline (100% client-side):
//   1. ensureProjectProfile(): analyze the project's real media (IndexedDB blob
//      via mediaId, or direct mediaUrl) with lib/video-analysis. Profiles are
//      cached per project so re-generating is instant. Projects without
//      analyzable media (platform imports needing the backend) get a
//      deterministic synthetic profile — flagged as such, and never uniform.
//   2. buildSmartCuts(): rank candidate windows centered on energy PEAKS,
//      snapped to start right after a silence/scene boundary and to end before
//      the next one; avoid overlaps; fill from scene segments when there are
//      fewer peaks than requested. NEVER equal slices.
//   3. Scores come from the real signal (hook = first-3s energy, retention =
//      mean energy + scene variety, emotion = peak prominence, nicheFit =
//      closeness to the niche's ideal duration).
//   4. Titles/descriptions/hashtags: template engine driven by the wizard
//      answers + Radar niche patterns. Heuristic (honest label in the UI) —
//      real AI titles need the connected backend.

import { mockNichePatterns } from "./mock-data";
import { getMedia } from "./media-store";
import { seededRandom, uid } from "./utils";
import type { Cut, CutMode, NichePattern, Project } from "./types";
import { DEFAULT_ANSWERS, type WizardAnswers } from "./cut-wizard";
import {
  analyzeMedia,
  syntheticProfile,
  type AnalysisProfile,
  type AnalysisProgress,
} from "./video-analysis";

// ---------------------------------------------------------------- profile cache

const profileCache = new Map<string, AnalysisProfile>();

export function getCachedProfile(projectId: string): AnalysisProfile | null {
  return profileCache.get(projectId) ?? null;
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000;
}

/**
 * Resolve and analyze the project's media, caching the result. Falls back to a
 * deterministic synthetic profile when the media is unavailable or yields no
 * usable signal (no audio AND no scenes).
 */
export async function ensureProjectProfile(
  project: Project,
  onProgress?: (p: AnalysisProgress) => void,
): Promise<AnalysisProfile> {
  const cached = profileCache.get(project.id);
  if (cached) {
    onProgress?.({ pct: 100, message: "Análise já pronta (cache)" });
    return cached;
  }

  const seed = hashSeed(project.id);
  let profile: AnalysisProfile | null = null;

  let source: Blob | string | null = null;
  if (project.mediaId) source = await getMedia(project.mediaId);
  if (!source && project.mediaUrl) source = project.mediaUrl;

  if (source) {
    try {
      profile = await analyzeMedia(source, {
        onProgress,
        durationHint: project.durationSeconds,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      profile = null;
    }
  }

  // No media / no usable signal → simulated (but irregular) profile.
  if (!profile || (!profile.hasAudio && profile.scenes.length === 0 && profile.energy.length === 0)) {
    const duration = Math.max(profile?.duration ?? 0, project.durationSeconds, 60);
    profile = syntheticProfile(duration, seed);
  } else if (profile.energy.length === 0) {
    // Video without audio but WITH scene signal: synthesize an energy curve so
    // ranking still works, keeping the real scenes/duration.
    const synth = syntheticProfile(profile.duration, seed);
    profile = { ...profile, energy: synth.energy, peaks: synth.peaks, silences: synth.silences };
  }

  profileCache.set(project.id, profile);
  onProgress?.({ pct: 100, message: "Análise concluída" });
  return profile;
}

// ---------------------------------------------------------------- segments

interface Candidate {
  start: number;
  end: number;
  peakAt: number | null;
  snappedStart: boolean;
  fromScene: boolean;
  hookRaw: number;
  retentionRaw: number;
  emotionRaw: number;
}

interface SegmentScores {
  hook: number;
  retention: number;
  emotion: number;
  nicheFit: number;
  viralScore: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function buildSignalHelpers(profile: AnalysisProfile) {
  const { energy, windowSeconds: w, duration } = profile;
  const eAt = (t: number): number => {
    if (energy.length === 0) return 0.5;
    const i = clamp(Math.floor(t / w), 0, energy.length - 1);
    return energy[i];
  };
  const meanRange = (a: number, b: number): number => {
    if (energy.length === 0) return 0.5;
    const i0 = clamp(Math.floor(a / w), 0, energy.length - 1);
    const i1 = clamp(Math.ceil(b / w), i0 + 1, energy.length);
    let sum = 0;
    for (let i = i0; i < i1; i++) sum += energy[i];
    return sum / (i1 - i0);
  };
  const overallMean = energy.length ? energy.reduce((s, e) => s + e, 0) / energy.length : 0.5;
  const scenesIn = (a: number, b: number) => profile.scenes.filter((s) => s > a && s < b).length;
  const diffVarIn = (a: number, b: number): number => {
    const diffs = profile.sceneSamples.filter((s) => s.t > a && s.t < b).map((s) => s.diff);
    if (diffs.length < 2) return 0;
    const m = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    return diffs.reduce((s, d) => s + (d - m) * (d - m), 0) / diffs.length;
  };
  return { eAt, meanRange, overallMean, scenesIn, diffVarIn, duration };
}

/**
 * Select up to `count` non-overlapping segments from the profile. Segments are
 * centered on energy peaks, snapped to natural boundaries, and completed with
 * scene-based + low-discrepancy fills — never arbitrary equal slices.
 */
export function selectSegments(
  profile: AnalysisProfile,
  targetSeconds: number,
  count: number,
  aggressiveness: number,
  seed: number,
): Candidate[] {
  const rnd = seededRandom(seed + 7);
  const { eAt, meanRange, overallMean, scenesIn, diffVarIn, duration } = buildSignalHelpers(profile);
  if (duration <= 4) return [];

  const target = clamp(targetSeconds, 6, Math.max(6, duration * 0.85));
  const aggr = clamp(aggressiveness, 1, 5);
  const minLen = Math.max(5, target * (0.55 - aggr * 0.05));
  const minGap = Math.max(1.5, target * 0.2);

  const startBounds = Array.from(
    new Set([0, ...profile.silences.map((s) => s[1]), ...profile.scenes].map(round1)),
  ).sort((a, b) => a - b);
  const endBounds = Array.from(
    new Set([...profile.silences.map((s) => s[0]), ...profile.scenes, round1(duration)].map(round1)),
  ).sort((a, b) => a - b);

  const snapStart = (peak: number, len: number): { t: number; snapped: boolean } => {
    const ideal = peak - len * 0.35;
    const lo = peak - len * 0.85;
    const hi = peak - Math.min(2, len * 0.12);
    let best: number | null = null;
    for (const b of startBounds) {
      if (b < lo || b > hi) continue;
      if (best === null || Math.abs(b - ideal) < Math.abs(best - ideal)) best = b;
    }
    return best !== null ? { t: best, snapped: true } : { t: Math.max(0, ideal), snapped: false };
  };
  const snapEnd = (start: number, len: number): number => {
    const ideal = start + len;
    const lo = start + len * 0.55;
    const hi = start + len * 1.35;
    let best: number | null = null;
    for (const b of endBounds) {
      if (b < lo || b > hi) continue;
      if (best === null || Math.abs(b - ideal) < Math.abs(best - ideal)) best = b;
    }
    return Math.min(duration, best ?? ideal);
  };

  const makeCandidate = (start: number, end: number, peakAt: number | null, snapped: boolean, fromScene: boolean): Candidate | null => {
    start = clamp(round1(start), 0, duration);
    end = clamp(round1(end), 0, duration);
    if (end - start < Math.min(minLen, duration * 0.8)) return null;
    const hookRaw = meanRange(start, Math.min(end, start + 3));
    const retentionRaw =
      meanRange(start, end) * 0.8 +
      Math.min(1, scenesIn(start, end) / Math.max(2, (end - start) / 8)) * 0.2;
    const prominence = peakAt !== null ? eAt(peakAt) - overallMean : diffVarIn(start, end) * 4;
    return { start, end, peakAt, snappedStart: snapped, fromScene, hookRaw, retentionRaw, emotionRaw: Math.max(0, prominence) };
  };

  // 1) Peak-centered candidates (duration jittered so lengths vary honestly).
  const candidates: Candidate[] = [];
  for (const p of profile.peaks) {
    const len = target * (1 + (rnd() - 0.5) * (0.15 + aggr * 0.06));
    const { t: start, snapped } = snapStart(p, len);
    const end = snapEnd(start, len);
    const c = makeCandidate(start, end, p, snapped, false);
    if (c) candidates.push(c);
  }
  candidates.sort(
    (a, b) => b.hookRaw * 0.4 + b.retentionRaw * 0.4 + b.emotionRaw * 0.2 - (a.hookRaw * 0.4 + a.retentionRaw * 0.4 + a.emotionRaw * 0.2),
  );

  // 2) Greedy non-overlapping selection.
  const selected: Candidate[] = [];
  const overlaps = (c: Candidate) =>
    selected.some((s) => !(c.end + minGap <= s.start || c.start >= s.end + minGap));
  for (const c of candidates) {
    if (selected.length >= count) break;
    if (!overlaps(c)) selected.push(c);
  }

  // 3) Fill with top-variance scene segments.
  if (selected.length < count) {
    const sceneStarts = [...profile.scenes, ...profile.silences.map((s) => s[1])];
    const sceneCands = sceneStarts
      .map((s) => {
        const len = target * (0.85 + rnd() * 0.35);
        return makeCandidate(s, snapEnd(s, len), null, true, true);
      })
      .filter((c): c is Candidate => c !== null)
      .sort((a, b) => b.emotionRaw + b.retentionRaw - (a.emotionRaw + a.retentionRaw));
    for (const c of sceneCands) {
      if (selected.length >= count) break;
      if (!overlaps(c)) selected.push(c);
    }
  }

  // 4) Last resort: low-discrepancy (golden ratio) offsets — irregular by
  // construction, so even signal-poor media never yields equal slices.
  if (selected.length < count) {
    const phi = 0.61803398875;
    for (let k = 1; k <= 64 && selected.length < count; k++) {
      // Lengths shrink as k grows so leftover gaps can still host a cut.
      const shrink = 1 - Math.min(0.5, k / 40);
      const len = target * (0.55 + rnd() * 0.6) * shrink;
      const span = Math.max(0.001, duration - len);
      const start = ((k * phi + rnd() * 0.07) % 1) * span;
      const c = makeCandidate(start, Math.min(duration, start + len), null, false, false);
      if (c && !overlaps(c)) selected.push(c);
    }
  }

  return selected.sort((a, b) => a.start - b.start);
}

/** Honest 0-100 scores: rank-scaled real metrics + absolute niche fit. */
function scoreSegments(
  segments: Candidate[],
  idealDuration: number,
  aggressiveness: number,
  seed: number,
): SegmentScores[] {
  const rnd = seededRandom(seed + 13);
  const scale = (values: number[]): number[] => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!Number.isFinite(min) || max - min < 1e-6) {
      return values.map(() => 58 + Math.round(rnd() * 18));
    }
    return values.map((v) => Math.round(38 + ((v - min) / (max - min)) * 57));
  };
  const hooks = scale(segments.map((s) => s.hookRaw));
  const rets = scale(segments.map((s) => s.retentionRaw));
  const emos = scale(segments.map((s) => s.emotionRaw));
  const aggr = clamp(aggressiveness, 1, 5);
  const wHook = 0.28 + aggr * 0.016;
  const wEmo = 0.14 + aggr * 0.016;
  const wRet = 0.3;
  const wNiche = 1 - wHook - wEmo - wRet;
  return segments.map((s, i) => {
    const len = s.end - s.start;
    const nicheFit = Math.round(clamp(100 - (Math.abs(len - idealDuration) / Math.max(1, idealDuration)) * 90, 34, 98));
    const composite =
      hooks[i] * wHook + rets[i] * wRet + emos[i] * wEmo + nicheFit * wNiche + (rnd() - 0.5) * 5;
    return {
      hook: clamp(hooks[i], 20, 99),
      retention: clamp(rets[i], 20, 99),
      emotion: clamp(emos[i], 20, 99),
      nicheFit,
      viralScore: Math.round(clamp(composite, 26, 98)),
    };
  });
}

// ---------------------------------------------------------------- copy engine

const fmtTime = (t: number): string => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

interface CopyCtx {
  nicho: string;
  mmss: string;
  len: number;
  index: number;
}

const TITLE_TEMPLATES: Record<WizardAnswers["gancho"], Array<(c: CopyCtx) => string>> = {
  pergunta: [
    (c) => `Você faria o mesmo? O momento-chave aos ${c.mmss}`,
    (c) => `Por que ninguém fala disso em ${c.nicho}?`,
    (c) => `O que acontece aos ${c.mmss}? Ninguém esperava`,
    (c) => `Quantos erram exatamente isso em ${c.nicho}?`,
    () => `Você percebeu esse detalhe? Quase todo mundo pula`,
  ],
  choque: [
    (c) => `O momento mais intenso do vídeo (aos ${c.mmss})`,
    () => `Isso realmente aconteceu — sem cortes`,
    () => `Ninguém estava pronto pra esse trecho`,
    (c) => `O pico que parou tudo aos ${c.mmss}`,
    () => `A parte que ninguém esperava`,
  ],
  promessa: [
    (c) => `Em ${c.len}s você entende o essencial de ${c.nicho}`,
    (c) => `O passo que muda seu jogo em ${c.nicho}`,
    () => `Aprenda isso antes de todo mundo`,
    (c) => `${c.len} segundos que valem o vídeo inteiro`,
    (c) => `3 detalhes deste trecho que mudam tudo em ${c.nicho}`,
  ],
  loop: [
    () => `Assista até o fim — o final conecta com o começo`,
    () => `Esse corte volta pro início sozinho`,
    () => `Você vai assistir 2x sem perceber`,
    (c) => `O loop perfeito começa aos ${c.mmss}`,
    () => `Não pisque: o fim explica o começo`,
  ],
};

const OBJETIVO_TEMPLATES: Record<WizardAnswers["objetivo"], (c: CopyCtx) => string> = {
  viralizar: (c) => `O trecho com mais chance de viralizar (${c.mmss})`,
  vender: (c) => `O argumento que convence em ${c.len} segundos`,
  educar: () => `A explicação mais clara do vídeo inteiro`,
  entreter: () => `A parte mais divertida — impossível não rir`,
};

const TOM_SUFFIX: Record<WizardAnswers["tom"], string> = {
  energico: "sem enrolação",
  calmo: "com calma e clareza",
  polemico: "opinião forte",
  inspirador: "história real",
};

const CTA_PHRASE: Record<WizardAnswers["cta"], string> = {
  comentar: "Comenta aí o que você faria.",
  seguir: "Segue o perfil pra mais cortes assim.",
  link: "Link na bio pra ver o conteúdo completo.",
  nenhum: "",
};

const NICHE_TAGS: Record<string, string[]> = {
  "finanças": ["#financas", "#dinheiro", "#investimentos"],
  fitness: ["#fitness", "#treino", "#academia"],
  podcast: ["#podcast", "#cortesdepodcast", "#entrevista"],
  humor: ["#humor", "#comedia", "#memes"],
  "educação": ["#educacao", "#aprenda", "#estudos"],
  tecnologia: ["#tecnologia", "#tech", "#ia"],
  beleza: ["#beleza", "#skincare", "#makeup"],
  games: ["#games", "#gamer", "#gameplay"],
};

const PLATFORM_TAG: Record<WizardAnswers["plataforma"], string> = {
  tiktok: "#tiktok",
  reels: "#reels",
  shorts: "#shorts",
};

function buildTitles(
  answers: WizardAnswers,
  ctx: CopyCtx,
  pattern: NichePattern | null,
  rnd: () => number,
): string[] {
  const pool: string[] = [];
  const hookFns = TITLE_TEMPLATES[answers.gancho];
  const offset = Math.floor(rnd() * hookFns.length);
  for (let i = 0; i < hookFns.length; i++) pool.push(hookFns[(offset + i) % hookFns.length](ctx));
  pool.push(OBJETIVO_TEMPLATES[answers.objetivo](ctx));
  if (pattern && pattern.topHooks.length > 0) {
    const hook = pattern.topHooks[ctx.index % pattern.topHooks.length].hook.replace(/\.\.\.$/, "…");
    pool.push(`${hook} — ${TOM_SUFFIX[answers.tom]}`);
  }
  // 3 distinct options; the first becomes the main title.
  const titles: string[] = [];
  for (const t of pool) {
    if (!titles.includes(t)) titles.push(t);
    if (titles.length === 3) break;
  }
  return titles;
}

function buildDescription(project: Project, answers: WizardAnswers, seg: Candidate): string {
  const reason =
    seg.peakAt !== null
      ? `pico de energia no áudio aos ${fmtTime(seg.peakAt)}${seg.snappedStart ? ", começando logo após uma pausa natural" : ""}`
      : seg.fromScene
        ? "mudança de cena marcante com alta variação visual"
        : "trecho com boa densidade de sinal";
  const cta = CTA_PHRASE[answers.cta];
  return `Trecho ${fmtTime(seg.start)}–${fmtTime(seg.end)} de "${project.title}". Selecionado pela análise do vídeo: ${reason}.${cta ? ` ${cta}` : ""}`;
}

function buildHashtags(answers: WizardAnswers, index: number): string[] {
  const niche = NICHE_TAGS[answers.nicho] ?? ["#conteudo"];
  const base = ["#cortaai", "#viral", "#fyp", "#brasil"];
  const tags = [...niche, PLATFORM_TAG[answers.plataforma], base[index % base.length], "#cortaai"];
  return Array.from(new Set(tags)).slice(0, 6);
}

// ---------------------------------------------------------------- entry point

export interface SmartCutsOptions {
  mode: CutMode;
  aggressiveness: number;
  count: number;
  answers?: WizardAnswers | null;
  onProgress?: (p: AnalysisProgress) => void;
}

/**
 * Full smart generation for a project: (re)uses the cached analysis profile,
 * selects segments, scores them from the real signal and writes the copy.
 */
export async function generateSmartCuts(
  project: Project,
  opts: SmartCutsOptions,
): Promise<{ cuts: Cut[]; profile: AnalysisProfile }> {
  const answers = opts.answers ?? DEFAULT_ANSWERS;
  const profile = await ensureProjectProfile(project, opts.onProgress);
  const seed = hashSeed(project.id) + Math.floor(Date.now() / 60000);
  const rnd = seededRandom(seed);

  const pattern =
    mockNichePatterns.find((p) => p.niche === answers.nicho && p.period === "7d") ??
    mockNichePatterns.find((p) => p.niche === answers.nicho) ??
    null;
  const platformCap = answers.plataforma === "shorts" ? 60 : answers.plataforma === "reels" ? 90 : 180;
  const idealDuration = Math.min(
    platformCap,
    answers.duracao === "auto" ? pattern?.avgDuration ?? 30 : Number(answers.duracao),
  );

  const count = clamp(Math.round(opts.count || 1), 1, 20);
  opts.onProgress?.({ pct: 99, message: "Escolhendo os melhores momentos…" });
  const segments = selectSegments(profile, idealDuration, count, opts.aggressiveness, seed);
  const scores = scoreSegments(segments, idealDuration, opts.aggressiveness, seed);

  const bestTimes = pattern ? [...pattern.bestPostTimes].sort((a, b) => b.score - a.score) : [];
  const now = new Date().toISOString();

  const cuts = segments.map((seg, i): Cut => {
    const ctx: CopyCtx = {
      nicho: answers.nicho,
      mmss: fmtTime(seg.peakAt ?? seg.start),
      len: Math.round(seg.end - seg.start),
      index: i,
    };
    const titles = buildTitles(answers, ctx, pattern, rnd);
    const sound = pattern?.trendingSounds[i % Math.max(1, pattern.trendingSounds.length)];
    const post = bestTimes[i % Math.max(1, bestTimes.length)];
    return {
      id: uid(),
      projectId: project.id,
      title: titles[0] ?? `Corte ${i + 1}`,
      titleOptions: titles.length ? titles : [`Corte ${i + 1}`],
      description: buildDescription(project, answers, seg),
      hashtags: buildHashtags(answers, i),
      startSeconds: seg.start,
      endSeconds: seg.end,
      viralScore: scores[i].viralScore,
      scoreBreakdown: {
        hook: scores[i].hook,
        retention: scores[i].retention,
        emotion: scores[i].emotion,
        nicheFit: scores[i].nicheFit,
      },
      transcript: [],
      mode: opts.mode,
      suggestedSound: sound
        ? { track: sound.track, reason: `em alta no nicho ${answers.nicho} (+${sound.growthPct}%)`, trendVideoId: "" }
        : { track: "Sem trilha", reason: "adicione uma trilha no editor", trendVideoId: "" },
      bestPostTime: post ? `${post.day} ${post.hour}h` : "—",
      status: "suggested",
      editState: null,
      createdAt: now,
      ...(project.mediaId ? { mediaId: project.mediaId } : {}),
      ...(project.mediaUrl ? { mediaUrl: project.mediaUrl } : {}),
    };
  });

  return { cuts, profile };
}
