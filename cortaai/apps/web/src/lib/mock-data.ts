// Rich deterministic seed mocks. The app must be fully navigable offline:
// every api.ts call falls back to this data when the API is unreachable.

import type {
  AdminMetrics,
  AdminUserRow,
  Cut,
  DashboardStats,
  EffectTemplate,
  Generation,
  Job,
  Niche,
  NichePattern,
  Project,
  RetentionPoint,
  TranscriptWord,
  TrendAnalysis,
  TrendVideo,
  User,
} from "./types";
import { seededRandom, svgThumb } from "./utils";

/** Fixed reference "now" so relative times render identically on server and client. */
export const MOCK_NOW = new Date("2026-07-08T15:00:00Z").getTime();

function iso(hoursAgo: number): string {
  return new Date(MOCK_NOW - hoursAgo * 3600_000).toISOString();
}

// ---------------------------------------------------------------- user

export const mockUser: User = {
  id: "7f3a1c9e-0b2d-4e8f-a1b2-3c4d5e6f7a8b",
  email: "criador@cortaai.com.br",
  name: "Marina Duarte",
  avatarUrl: null,
  googleId: null,
  brandingKit: {
    logoUrl: null,
    font: "Inter",
    colors: ["#8b5cf6", "#d946ef", "#0a0a0f"],
    captionPreset: "hormozi",
  },
  isAdmin: true,
  createdAt: iso(24 * 90),
};

// ---------------------------------------------------------------- trend videos (Radar Viral)

interface TvSeed {
  title: string;
  channel: string;
  niche: Niche;
  platform: TrendVideo["platform"];
  duration: number;
  views: number;
  hoursAgo: number;
  retention: number;
}

const TV_SEEDS: TvSeed[] = [
  { title: "Como eu saí de R$0 a R$10 mil/mês vendendo 1 planilha", channel: "Grana Sem Mistério", niche: "finanças", platform: "tiktok", duration: 42, views: 2_400_000, hoursAgo: 18, retention: 93 },
  { title: "O erro de investimento que 90% comete antes dos 30", channel: "Papo de Bolso", niche: "finanças", platform: "youtube", duration: 58, views: 1_100_000, hoursAgo: 60, retention: 87 },
  { title: "30 dias de agachamento: o antes e depois que ninguém mostra", channel: "Treino de Verdade", niche: "fitness", platform: "instagram", duration: 34, views: 3_800_000, hoursAgo: 30, retention: 91 },
  { title: "Coma ISSO antes do treino (nutricionista reage)", channel: "Fica Forte", niche: "fitness", platform: "tiktok", duration: 47, views: 950_000, hoursAgo: 96, retention: 78 },
  { title: "Ex-presidiário conta como reconstruiu a vida — corte emocionante", channel: "PodDelas Cortes", niche: "podcast", platform: "youtube", duration: 74, views: 5_200_000, hoursAgo: 42, retention: 95 },
  { title: "Neurocientista explica por que você procrastina (arrepiante)", channel: "Cortes do Prime", niche: "podcast", platform: "tiktok", duration: 61, views: 1_700_000, hoursAgo: 110, retention: 88 },
  { title: "POV: sua mãe descobrindo o preço do seu tênis", channel: "Rindo à Toa", niche: "humor", platform: "instagram", duration: 22, views: 6_900_000, hoursAgo: 12, retention: 96 },
  { title: "Imitei todos os professores da escola brasileira", channel: "Zueira Studios", niche: "humor", platform: "tiktok", duration: 39, views: 2_100_000, hoursAgo: 72, retention: 84 },
  { title: "A técnica de memorização que a faculdade não te ensina", channel: "Aprova Fácil", niche: "educação", platform: "youtube", duration: 55, views: 880_000, hoursAgo: 50, retention: 86 },
  { title: "Inglês em 90 dias: o método dos 15 minutos por dia", channel: "Prof. Lia Inglês", niche: "educação", platform: "instagram", duration: 44, views: 1_300_000, hoursAgo: 130, retention: 82 },
  { title: "Testei o iPhone dobrável FALSO de R$800 (chocante)", channel: "Tec na Mão", niche: "tecnologia", platform: "youtube", duration: 66, views: 4_100_000, hoursAgo: 26, retention: 89 },
  { title: "5 sites com IA que parecem ilegais de tão bons", channel: "Byte a Byte", niche: "tecnologia", platform: "tiktok", duration: 49, views: 2_800_000, hoursAgo: 80, retention: 92 },
  { title: "Transformação com maquiagem de R$30 vs R$3.000", channel: "Beleza Real BR", niche: "beleza", platform: "instagram", duration: 37, views: 1_900_000, hoursAgo: 36, retention: 85 },
  { title: "Skincare coreano em 4 passos para pele oleosa", channel: "Glow da Duda", niche: "beleza", platform: "tiktok", duration: 41, views: 760_000, hoursAgo: 150, retention: 79 },
  { title: "Clutch 1v5 no Major — a jogada que quebrou a internet", channel: "Clipes do Cenário", niche: "games", platform: "youtube", duration: 52, views: 3_300_000, hoursAgo: 20, retention: 94 },
  { title: "Speedrun de Minecraft com a lava MAIS RÁPIDA do mundo", channel: "Pixel Bruto", niche: "games", platform: "tiktok", duration: 63, views: 1_500_000, hoursAgo: 100, retention: 81 },
];

export const mockTrendVideos: TrendVideo[] = TV_SEEDS.map((s, i) => {
  const rnd = seededRandom(100 + i);
  const likes = Math.round(s.views * (0.06 + rnd() * 0.06));
  return {
    id: `trend-${String(i + 1).padStart(4, "0")}-aaaa-bbbb-cccc-000000000000`,
    platform: s.platform,
    externalId: `ext_${i + 1}`,
    url: `https://${s.platform}.com/watch/ext_${i + 1}`,
    title: s.title,
    channel: s.channel,
    thumbnailUrl: svgThumb(s.title, s.niche),
    niche: s.niche,
    language: "pt-BR",
    durationSeconds: s.duration,
    views: s.views,
    viewsPerHour: Math.round(s.views / s.hoursAgo),
    likes,
    comments: Math.round(likes * (0.04 + rnd() * 0.05)),
    publishedAt: iso(s.hoursAgo),
    retentionIndex: s.retention,
    fetchedAt: iso(1),
  };
});

// ---------------------------------------------------------------- Raio-X analyses

/** Builds a second-by-second retention curve with event markers (SPEC shape). */
function buildTimeline(
  seed: number,
  duration: number,
  floor: number,
  markers: Record<number, string>,
): RetentionPoint[] {
  const rnd = seededRandom(seed);
  const pts: RetentionPoint[] = [];
  let r = 100;
  for (let s = 0; s <= duration; s++) {
    if (s > 0) {
      const decay = (100 - floor) / duration;
      r -= decay * (0.5 + rnd());
      if (markers[s]) r += 2.5 + rnd() * 3; // retention bumps at creative events
      r = Math.min(100, Math.max(floor - 6, r));
    }
    pts.push({ second: s, retentionPct: Math.round(r * 10) / 10, marker: markers[s] ?? null });
  }
  return pts;
}

interface XraySeed {
  track: string;
  bpm: number;
  energy: number;
  wpm: number;
  tone: string;
  cutsPerMinute: number;
  zoomPunches: number;
  palette: string[];
  captionStyle: string;
  hookType: string;
  hookText: string;
  cta: string;
  loop: boolean;
  markers: Record<number, string>;
}

const XRAY_SEEDS: XraySeed[] = [
  { track: "Aesthetic Hustle — trap lo-fi", bpm: 140, energy: 0.82, wpm: 172, tone: "enérgico", cutsPerMinute: 24, zoomPunches: 7, palette: ["#0f172a", "#f59e0b", "#ffffff"], captionStyle: "hormozi", hookType: "resultado", hookText: "Saí de R$0 a R$10 mil por mês com UMA planilha", cta: "comenta PLANILHA que eu te mando", loop: true, markers: { 0: "gancho de resultado", 6: "prova social na tela", 14: "zoom + troca de música", 26: "virada: o erro que quase o quebrou", 38: "CTA + loop perfeito" } },
  { track: "Cinematic Tension Rise", bpm: 96, energy: 0.61, wpm: 155, tone: "sério e direto", cutsPerMinute: 16, zoomPunches: 4, palette: ["#111827", "#10b981", "#e5e7eb"], captionStyle: "highlightBox", hookType: "erro comum", hookText: "90% das pessoas comete esse erro antes dos 30", cta: "salva esse vídeo antes que suma", loop: false, markers: { 0: "gancho de erro comum", 9: "gráfico animado na tela", 22: "pausa estratégica", 34: "número chocante em destaque", 50: "CTA de salvamento" } },
  { track: "Gym Phonk Brasileiro", bpm: 150, energy: 0.93, wpm: 148, tone: "motivacional", cutsPerMinute: 28, zoomPunches: 9, palette: ["#18181b", "#ef4444", "#fafafa"], captionStyle: "boldEmoji", hookType: "antes e depois", hookText: "30 dias de agachamento — o que ninguém te mostra", cta: "me segue pro dia 60", loop: true, markers: { 0: "antes/depois lado a lado", 5: "zoom punch no resultado", 12: "corte rápido dia 1 → dia 15", 21: "troca de música no clímax", 30: "CTA + loop" } },
  { track: "Upbeat Kitchen Pop", bpm: 118, energy: 0.7, wpm: 165, tone: "didático animado", cutsPerMinute: 20, zoomPunches: 5, palette: ["#1c1917", "#84cc16", "#ffffff"], captionStyle: "karaoke", hookType: "contrariar senso comum", hookText: "Pare de comer banana antes do treino. Coma ISSO", cta: "compartilha com quem treina contigo", loop: false, markers: { 0: "gancho contraintuitivo", 8: "nutricionista entra em tela", 18: "b-roll do prato", 33: "comparação de macros", 43: "CTA de compartilhamento" } },
  { track: "Emotional Piano Ambient", bpm: 72, energy: 0.35, wpm: 132, tone: "emocional", cutsPerMinute: 10, zoomPunches: 2, palette: ["#0c0a09", "#7c3aed", "#f5f5f4"], captionStyle: "minimal", hookType: "história pessoal", hookText: "Eu saí da prisão sem ninguém me esperar do lado de fora", cta: "deixa um comentário de apoio", loop: false, markers: { 0: "frase de impacto", 12: "silêncio estratégico de 1s", 28: "close no rosto emocionado", 45: "virada de superação", 66: "CTA emocional" } },
  { track: "Dark Academia Beat", bpm: 88, energy: 0.5, wpm: 158, tone: "curioso", cutsPerMinute: 14, zoomPunches: 3, palette: ["#111827", "#3b82f6", "#f9fafb"], captionStyle: "typewriter", hookType: "pergunta", hookText: "Você sabia que procrastinar é um mecanismo de defesa?", cta: "segue pra parte 2", loop: false, markers: { 0: "gancho de pergunta", 10: "diagrama do cérebro na tela", 24: "exemplo prático", 40: "zoom + troca de música", 55: "CTA parte 2" } },
  { track: "Funk Comédia BR (som original)", bpm: 130, energy: 0.88, wpm: 180, tone: "cômico exagerado", cutsPerMinute: 30, zoomPunches: 8, palette: ["#0a0a0a", "#facc15", "#ffffff"], captionStyle: "boldEmoji", hookType: "POV", hookText: "POV: sua mãe descobriu o preço do seu tênis", cta: "marca sua mãe (se tiver coragem)", loop: true, markers: { 0: "POV estabelecido", 4: "zoom dramático no rosto", 9: "efeito sonoro de impacto", 15: "punchline principal", 20: "loop perfeito" } },
  { track: "Trilha nostálgica escolar", bpm: 105, energy: 0.75, wpm: 190, tone: "cômico", cutsPerMinute: 26, zoomPunches: 6, palette: ["#171717", "#fb923c", "#fef3c7"], captionStyle: "highlightBox", hookType: "lista", hookText: "TODOS os professores da escola brasileira em 40 segundos", cta: "qual desses foi teu professor?", loop: false, markers: { 0: "gancho de lista", 7: "personagem 2: prof de educação física", 16: "personagem 4: a coordenadora", 27: "personagem 6: o de matemática", 36: "CTA de comentário" } },
  { track: "Focus Flow — estudo lo-fi", bpm: 80, energy: 0.42, wpm: 150, tone: "professoral acessível", cutsPerMinute: 12, zoomPunches: 3, palette: ["#0f172a", "#22d3ee", "#f8fafc"], captionStyle: "minimal", hookType: "segredo revelado", hookText: "A técnica de memorização que a faculdade esconde de você", cta: "salva pra revisar depois", loop: false, markers: { 0: "gancho de segredo", 11: "demonstração ao vivo", 25: "quadro com o método", 39: "teste com a audiência", 50: "CTA de salvamento" } },
  { track: "British Pop Upbeat", bpm: 112, energy: 0.66, wpm: 162, tone: "encorajador", cutsPerMinute: 18, zoomPunches: 4, palette: ["#1e1b4b", "#f472b6", "#ffffff"], captionStyle: "karaoke", hookType: "promessa com prazo", hookText: "Inglês em 90 dias com 15 minutos por dia — método completo", cta: "comenta DIA 1 pra entrar no desafio", loop: false, markers: { 0: "promessa com prazo", 9: "cronograma na tela", 20: "aluna real falando inglês", 32: "zoom + troca de música", 40: "CTA do desafio" } },
  { track: "Suspense Tech Reveal", bpm: 100, energy: 0.72, wpm: 168, tone: "investigativo", cutsPerMinute: 22, zoomPunches: 6, palette: ["#030712", "#6366f1", "#e0e7ff"], captionStyle: "hormozi", hookType: "curiosidade", hookText: "Comprei o iPhone dobrável FALSO de R$800", cta: "quer a parte 2 desmontando ele?", loop: false, markers: { 0: "unboxing imediato", 8: "primeira dobra em close", 19: "comparação com o original", 35: "teste de queda", 52: "veredito + CTA" } },
  { track: "AI Future Bass", bpm: 124, energy: 0.78, wpm: 175, tone: "empolgado", cutsPerMinute: 25, zoomPunches: 7, palette: ["#09090b", "#a855f7", "#fafafa"], captionStyle: "gradientAnimated", hookType: "lista", hookText: "5 sites com IA que parecem ilegais de tão bons", cta: "salva antes que tirem do ar", loop: true, markers: { 0: "gancho de lista", 8: "site 1 em screencast", 17: "site 2: reação exagerada", 28: "site 4: zoom + troca de música", 42: "CTA + loop" } },
  { track: "Glam Transformation Pop", bpm: 108, energy: 0.68, wpm: 145, tone: "próximo e sincero", cutsPerMinute: 19, zoomPunches: 5, palette: ["#1c1917", "#ec4899", "#fdf2f8"], captionStyle: "neon", hookType: "comparação", hookText: "Metade do rosto com maquiagem de R$30, metade com R$3.000", cta: "qual lado você prefere? comenta", loop: false, markers: { 0: "tela dividida imediata", 6: "produto barato em close", 15: "produto de luxo em close", 26: "revelação lado a lado", 33: "CTA de enquete" } },
  { track: "K-Beauty Chill", bpm: 95, energy: 0.48, wpm: 138, tone: "calmo e confiante", cutsPerMinute: 13, zoomPunches: 2, palette: ["#0c0a09", "#f9a8d4", "#fff1f2"], captionStyle: "minimal", hookType: "problema/solução", hookText: "Pele oleosa? Esses 4 passos coreanos resolvem", cta: "salva sua rotina da noite", loop: false, markers: { 0: "gancho problema/solução", 9: "passo 1 com textura em macro", 19: "passo 2", 29: "passo 3 com dica extra", 37: "CTA de salvamento" } },
  { track: "Epic Orchestral Gamer", bpm: 145, energy: 0.9, wpm: 200, tone: "narração de caster", cutsPerMinute: 32, zoomPunches: 10, palette: ["#020617", "#f97316", "#fed7aa"], captionStyle: "neon", hookType: "clímax antecipado", hookText: "Ele está SOZINHO contra cinco — e o que acontece é histórico", cta: "segue pra mais clutches históricos", loop: true, markers: { 0: "clímax antecipado (spoiler do final)", 6: "replay do início da rodada", 18: "primeira dupla eliminação", 33: "zoom + troca de música no 1v2", 47: "explosão final + loop" } },
  { track: "8-bit Speedrun Anthem", bpm: 160, energy: 0.85, wpm: 185, tone: "acelerado", cutsPerMinute: 27, zoomPunches: 8, palette: ["#0a0a0a", "#4ade80", "#dcfce7"], captionStyle: "typewriter", hookType: "recorde", hookText: "O bucket de lava mais rápido já registrado em speedrun", cta: "comenta o seu recorde", loop: false, markers: { 0: "gancho de recorde", 10: "timer na tela", 24: "erro quase fatal", 41: "sprint final com música acelerando", 57: "tempo final + CTA" } },
];

export const mockTrendAnalyses: TrendAnalysis[] = mockTrendVideos.map((tv, i) => {
  const x = XRAY_SEEDS[i];
  const rnd = seededRandom(500 + i);
  return {
    id: `xray-${String(i + 1).padStart(4, "0")}-aaaa-bbbb-cccc-000000000000`,
    trendVideoId: tv.id,
    sound: {
      track: x.track,
      trackTrending: tv.retentionIndex >= 84,
      bpm: x.bpm,
      energy: x.energy,
      soundEffects: i % 3 === 0 ? ["whoosh", "ding", "riser"] : i % 3 === 1 ? ["whoosh", "impact"] : ["ding", "pop", "sub-drop"],
      voice: { wordsPerMinute: x.wpm, pauses: x.energy < 0.5 ? "longas e dramáticas" : "estratégicas", tone: x.tone },
      strategicSilences: [
        { atSecond: Math.round(tv.durationSeconds * 0.3), durationMs: 600 + Math.round(rnd() * 600) },
        { atSecond: Math.round(tv.durationSeconds * 0.72), durationMs: 400 + Math.round(rnd() * 500) },
      ],
    },
    image: {
      cutsPerMinute: x.cutsPerMinute,
      zoomPunches: x.zoomPunches,
      dominantPalette: x.palette,
      captions: { present: true, style: x.captionStyle, position: i % 2 === 0 ? "centro" : "terço inferior" },
      onScreenText: x.cutsPerMinute > 15,
      lighting: x.energy > 0.7 ? "alta, fundo escuro" : "suave, cenário natural",
      framing: x.cutsPerMinute > 22 ? "close" : "meio corpo",
    },
    structure: {
      hookType: x.hookType,
      hookText: x.hookText,
      narrativeArc: x.loop
        ? "gancho → escalada → clímax → loop"
        : "promessa → prova → virada → CTA",
      idealDuration: Math.max(20, tv.durationSeconds - 6),
      cta: x.cta,
      perfectLoop: x.loop,
    },
    retentionTimeline: buildTimeline(900 + i, tv.durationSeconds, tv.retentionIndex - 12, x.markers),
    generatedAt: iso(2),
  };
});

// ---------------------------------------------------------------- niche patterns

const HOOKS_BY_NICHE: Record<Niche, string[]> = {
  "finanças": ["Saí de R$0 a...", "O erro que 90% comete...", "Ninguém te conta isso sobre...", "Pare de fazer X com seu dinheiro"],
  fitness: ["30 dias fazendo X", "Pare de fazer X, faça Y", "O que ninguém mostra sobre...", "Antes e depois REAL"],
  podcast: ["A história que ele nunca contou...", "Especialista revela...", "O momento em que tudo mudou", "Isso me arrepiou:"],
  humor: ["POV: ...", "Todo brasileiro conhece...", "Tipos de pessoa que...", "Ninguém: / Eu:"],
  "educação": ["A técnica que a escola esconde", "Aprenda X em Y dias", "Você está estudando errado", "O método dos 15 minutos"],
  tecnologia: ["Testei o X mais barato do mundo", "5 sites que parecem ilegais", "Isso vai substituir seu emprego?", "A IA que ninguém está vendo"],
  beleza: ["R$30 vs R$3.000", "4 passos para...", "Pare de usar X no rosto", "O truque das coreanas"],
  games: ["Ele está SOZINHO contra 5", "O recorde que quebrou a internet", "Speedrun histórico", "A jogada mais insana de 2026"],
};

const SOUNDS_BY_NICHE: Record<Niche, string[]> = {
  "finanças": ["Aesthetic Hustle — trap lo-fi", "Cinematic Tension Rise", "Money Talk Beat"],
  fitness: ["Gym Phonk Brasileiro", "Hard Push Phonk", "Upbeat Kitchen Pop"],
  podcast: ["Emotional Piano Ambient", "Dark Academia Beat", "Deep Talk Pads"],
  humor: ["Funk Comédia BR (som original)", "Trilha nostálgica escolar", "Meme Horn Stack"],
  "educação": ["Focus Flow — estudo lo-fi", "British Pop Upbeat", "Chalkboard Chill"],
  tecnologia: ["AI Future Bass", "Suspense Tech Reveal", "Circuit Breaker Synth"],
  beleza: ["Glam Transformation Pop", "K-Beauty Chill", "Mirror Shine R&B"],
  games: ["Epic Orchestral Gamer", "8-bit Speedrun Anthem", "Victory Royale Brass"],
};

const NICHES_ALL: Niche[] = ["finanças", "fitness", "podcast", "humor", "educação", "tecnologia", "beleza", "games"];
const DAYS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const mockNichePatterns: NichePattern[] = NICHES_ALL.flatMap((niche, ni) =>
  (["24h", "7d", "30d"] as const).map((period, pi) => {
    const rnd = seededRandom(2000 + ni * 10 + pi);
    const styles = ["hormozi", "karaoke", "boldEmoji", "highlightBox", "minimal", "neon"];
    const shares = [38, 24, 15, 11, 8, 4];
    return {
      id: `pattern-${ni}${pi}00-aaaa-bbbb-cccc-000000000000`,
      niche,
      period,
      avgDuration: 28 + Math.round(rnd() * 30),
      topCaptionStyles: styles
        .slice(0, 4)
        .map((style, si) => ({ style, sharePct: shares[si] + Math.round(rnd() * 4) }))
        .sort((a, b) => b.sharePct - a.sharePct),
      trendingSounds: SOUNDS_BY_NICHE[niche].map((track, si) => ({
        track,
        usedBy: 800 - si * 220 + Math.round(rnd() * 150),
        growthPct: 40 + Math.round(rnd() * 260) - si * 30,
      })),
      topHooks: HOOKS_BY_NICHE[niche].map((hook, hi) => ({
        hook,
        occurrences: 320 - hi * 60 + Math.round(rnd() * 40),
      })),
      bestPostTimes: DAYS_PT.map((day, di) => ({
        day,
        hour: [12, 18, 19, 20, 21, 19, 15][di],
        score: Math.round(45 + rnd() * 55),
      })),
      computedAt: iso(3),
    };
  }),
);

// ---------------------------------------------------------------- projects

export const mockProjects: Project[] = [
  {
    id: "proj-0001-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    title: "Podcast #147 — Do zero ao primeiro milhão com Rafael Costa",
    sourceType: "youtube",
    sourceUrl: "https://youtube.com/watch?v=pod147",
    originalFilename: null,
    durationSeconds: 5820,
    resolution: "2160p",
    fps: 30,
    language: "pt-BR",
    status: "ready",
    thumbnailUrl: svgThumb("Podcast #147 — Rafael Costa", "podcast"),
    storageKey: "projects/proj-0001/source.mp4",
    createdAt: iso(52),
  },
  {
    id: "proj-0002-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    title: "Aula completa — Renda fixa em 2026 sem enrolação",
    sourceType: "upload",
    sourceUrl: null,
    originalFilename: "aula_renda_fixa_final_v3.mp4",
    durationSeconds: 2748,
    resolution: "1080p",
    fps: 30,
    language: "pt-BR",
    status: "ready",
    thumbnailUrl: svgThumb("Aula — Renda fixa 2026", "finanças"),
    storageKey: "projects/proj-0002/source.mp4",
    createdAt: iso(30),
  },
  {
    id: "proj-0003-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    title: "Live de sexta — Reagindo às builds mais quebradas do patch",
    sourceType: "twitch",
    sourceUrl: "https://twitch.tv/videos/live-sexta",
    originalFilename: null,
    durationSeconds: 9134,
    resolution: "1080p",
    fps: 60,
    language: "pt-BR",
    status: "analyzing",
    thumbnailUrl: svgThumb("Live de sexta — builds do patch", "games"),
    storageKey: "projects/proj-0003/source.mp4",
    createdAt: iso(2),
  },
];

// ---------------------------------------------------------------- cuts

function buildTranscript(sentences: string[], startAt: number, speaker = "Convidado"): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  let t = startAt;
  for (const sentence of sentences) {
    for (const w of sentence.split(" ")) {
      const dur = 0.24 + Math.min(0.3, w.length * 0.028);
      words.push({ word: w, start: Math.round(t * 100) / 100, end: Math.round((t + dur) * 100) / 100, speaker });
      t += dur + 0.06;
    }
    t += 0.5; // pause between sentences
  }
  return words;
}

interface CutSeed {
  projectId: string;
  title: string;
  alt: [string, string];
  desc: string;
  tags: string[];
  start: number;
  dur: number;
  score: number;
  br: [number, number, number, number];
  mode: Cut["mode"];
  sound: string;
  soundReason: string;
  trendIdx: number;
  postTime: string;
  sentences: string[];
}

const CUT_SEEDS: CutSeed[] = [
  {
    projectId: mockProjects[0].id,
    title: "“Eu quebrei 3 vezes antes dos 25” — a virada de Rafael Costa",
    alt: ["Ninguém fala da parte feia do primeiro milhão", "3 falências antes dos 25: a história completa"],
    desc: "Rafael Costa abre o jogo sobre as três falências que antecederam o primeiro milhão — e a decisão que mudou tudo.",
    tags: ["#empreendedorismo", "#podcast", "#negócios", "#mindset"],
    start: 1424, dur: 47, score: 94, br: [96, 91, 95, 92], mode: "viral",
    sound: "Emotional Piano Ambient", soundReason: "som em alta no nicho podcast esta semana", trendIdx: 4,
    postTime: "qui 19h", sentences: [
      "Eu quebrei três vezes antes dos vinte e cinco anos.",
      "Na terceira, eu devia mais de duzentos mil e dormia no depósito da loja.",
      "E foi ali, olhando pro teto, que eu entendi o que eu tava fazendo de errado.",
    ],
  },
  {
    projectId: mockProjects[0].id,
    title: "A pergunta de R$1 milhão que todo fundador deveria responder",
    alt: ["Responda isso antes de abrir empresa", "O filtro brutal do Rafael para novas ideias"],
    desc: "O framework de 1 pergunta que Rafael usa para decidir em que negócio entrar.",
    tags: ["#startup", "#empreendedorismo", "#cortes"],
    start: 2833, dur: 38, score: 88, br: [90, 84, 82, 93], mode: "qa",
    sound: "Dark Academia Beat", soundReason: "som em alta no nicho podcast esta semana", trendIdx: 5,
    postTime: "ter 12h", sentences: [
      "Qual é a pergunta que você faz antes de entrar em qualquer negócio?",
      "Simples: quem já está pagando por uma solução pior que a minha?",
      "Se ninguém paga por uma versão ruim, não existe mercado.",
    ],
  },
  {
    projectId: mockProjects[0].id,
    title: "Rotina das 4h da manhã? Rafael destrói o mito",
    alt: ["A verdade sobre acordar às 4h", "Produtividade de guru é cilada"],
    desc: "Contra o senso comum: por que copiar rotina de bilionário quebra o empreendedor iniciante.",
    tags: ["#produtividade", "#rotina", "#podcast"],
    start: 3911, dur: 52, score: 81, br: [78, 80, 88, 79], mode: "quotes",
    sound: "Cinematic Tension Rise", soundReason: "trilha com maior retenção em cortes de opinião", trendIdx: 1,
    postTime: "sáb 21h", sentences: [
      "Acordar às quatro da manhã não te faz rico.",
      "Te faz cansado numa reunião às três da tarde.",
      "Rotina boa é a que você sustenta por dez anos, não por dez dias.",
    ],
  },
  {
    projectId: mockProjects[0].id,
    title: "O conselho que Rafael daria ao ele de 18 anos",
    alt: ["18 anos e sem dinheiro: por onde começar", "O primeiro passo que ele repetiria"],
    desc: "Fechamento emocionante do episódio: o recado direto para quem está começando do zero.",
    tags: ["#motivação", "#começardozero", "#podcast"],
    start: 5490, dur: 33, score: 76, br: [72, 74, 90, 70], mode: "viral",
    sound: "Emotional Piano Ambient", soundReason: "som em alta no nicho podcast esta semana", trendIdx: 4,
    postTime: "dom 20h", sentences: [
      "Se eu pudesse falar com o Rafael de dezoito anos, eu diria só uma coisa.",
      "Aprende a vender antes de aprender qualquer outra coisa.",
      "Todo o resto a vida ensina no caminho.",
    ],
  },
  {
    projectId: mockProjects[0].id,
    title: "“Sócio é casamento sem lua de mel” — como escolher o seu",
    alt: ["Os 3 testes antes de assinar contrato social", "Sociedade que dá certo começa assim"],
    desc: "Os três testes práticos que Rafael aplica antes de fechar qualquer sociedade.",
    tags: ["#sociedade", "#negócios", "#dicas"],
    start: 4630, dur: 44, score: 72, br: [70, 68, 75, 78], mode: "tutorial",
    sound: "Deep Talk Pads", soundReason: "estilo consistente com cortes de conselho no nicho", trendIdx: 5,
    postTime: "qua 18h", sentences: [
      "Sócio é casamento sem lua de mel.",
      "Antes de assinar, viaje junto, tome decisão difícil junto e divida prejuízo pequeno junto.",
      "Se sobreviver aos três, assina.",
    ],
  },
  {
    projectId: mockProjects[0].id,
    title: "O dia em que ele recusou R$2 milhões de investimento",
    alt: ["Por que ele disse NÃO a R$2 milhões", "O aporte que teria destruído a empresa"],
    desc: "A história do aporte recusado e a matemática por trás da decisão.",
    tags: ["#investimento", "#startup", "#decisões"],
    start: 2110, dur: 58, score: 86, br: [88, 85, 84, 86], mode: "viral",
    sound: "Suspense Tech Reveal", soundReason: "cria tensão em histórias de decisão", trendIdx: 10,
    postTime: "sex 19h", sentences: [
      "Me ofereceram dois milhões e eu falei não na mesma mesa.",
      "O contrato tinha uma cláusula que me tirava o controle com um ano de atraso na meta.",
      "Dinheiro caro é mais perigoso que dívida.",
    ],
  },
  {
    projectId: mockProjects[1].id,
    title: "CDB de 120% do CDI é bom? A conta que ninguém faz",
    alt: ["A pegadinha dos 120% do CDI", "Quanto rende de verdade um CDB famoso"],
    desc: "A conta completa, com imposto e prazo, que muda a percepção sobre CDBs de banco médio.",
    tags: ["#rendafixa", "#investimentos", "#finanças", "#cdb"],
    start: 512, dur: 41, score: 90, br: [92, 88, 76, 97], mode: "tutorial",
    sound: "Aesthetic Hustle — trap lo-fi", soundReason: "som em alta no nicho finanças esta semana", trendIdx: 0,
    postTime: "seg 12h", sentences: [
      "Cento e vinte por cento do CDI parece muito, né?",
      "Só que com IOF, imposto regressivo e carência, o líquido real é outro.",
      "Vem comigo que a conta cabe em trinta segundos.",
    ],
  },
  {
    projectId: mockProjects[1].id,
    title: "Tesouro IPCA ou CDB? Decida em 30 segundos",
    alt: ["O fluxograma definitivo da renda fixa", "Nunca mais trave nessa escolha"],
    desc: "Fluxograma mental de 3 perguntas para escolher entre Tesouro IPCA+ e CDB.",
    tags: ["#tesourodireto", "#rendafixa", "#finanças"],
    start: 1290, dur: 36, score: 84, br: [82, 86, 71, 95], mode: "qa",
    sound: "Money Talk Beat", soundReason: "batida usada nos 3 maiores cortes do nicho em 7 dias", trendIdx: 1,
    postTime: "qua 19h", sentences: [
      "Tesouro IPCA ou CDB? Três perguntas e você decide.",
      "Primeiro: você precisa desse dinheiro antes de dois anos?",
      "Segundo: você aguenta ver o título oscilar? Terceiro: qual é a taxa real?",
    ],
  },
  {
    projectId: mockProjects[1].id,
    title: "Reserva de emergência: o número exato para o seu caso",
    alt: ["Pare de chutar 6 meses de reserva", "Sua reserva ideal em 1 fórmula"],
    desc: "Fórmula prática que ajusta a reserva de emergência à estabilidade da sua renda.",
    tags: ["#reservadeemergência", "#finançaspessoais"],
    start: 2050, dur: 49, score: 79, br: [76, 81, 69, 89], mode: "tutorial",
    sound: "Focus Flow — estudo lo-fi", soundReason: "ritmo calmo aumenta retenção em conteúdo didático", trendIdx: 8,
    postTime: "dom 18h", sentences: [
      "Seis meses de reserva é chute, não é planejamento.",
      "CLT estável é uma conta, PJ com renda variável é outra completamente diferente.",
      "Anota a fórmula: custo fixo vezes fator de estabilidade.",
    ],
  },
  {
    projectId: mockProjects[1].id,
    title: "“Poupança ainda é o maior imposto sobre a paciência”",
    alt: ["A frase que resume a poupança em 2026", "Quanto a poupança te custou em 10 anos"],
    desc: "A comparação de 10 anos entre poupança e o CDI que abre o olho de qualquer poupador.",
    tags: ["#poupança", "#educaçãofinanceira"],
    start: 2455, dur: 31, score: 68, br: [65, 63, 72, 74], mode: "quotes",
    sound: "Cinematic Tension Rise", soundReason: "tensão crescente combina com revelação de números", trendIdx: 1,
    postTime: "ter 20h", sentences: [
      "A poupança é o maior imposto sobre a paciência do brasileiro.",
      "Dez anos de poupança contra CDI: a diferença compra um carro.",
      "E o banco agradece a sua fidelidade.",
    ],
  },
];

export const mockCuts: Cut[] = CUT_SEEDS.map((c, i) => ({
  id: `cut-${String(i + 1).padStart(4, "0")}-aaaa-bbbb-cccc-000000000000`,
  projectId: c.projectId,
  title: c.title,
  titleOptions: [c.title, c.alt[0], c.alt[1]],
  description: c.desc,
  hashtags: c.tags,
  startSeconds: c.start,
  endSeconds: c.start + c.dur,
  viralScore: c.score,
  scoreBreakdown: { hook: c.br[0], retention: c.br[1], emotion: c.br[2], nicheFit: c.br[3] },
  transcript: buildTranscript(c.sentences, c.start),
  mode: c.mode,
  suggestedSound: { track: c.sound, reason: c.soundReason, trendVideoId: mockTrendVideos[c.trendIdx].id },
  bestPostTime: c.postTime,
  status: i === 0 ? "edited" : "suggested",
  editState: null,
  createdAt: iso(28 - i),
}));

// ---------------------------------------------------------------- jobs

export const mockJobs: Job[] = [
  {
    id: "job-0001-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: mockProjects[2].id,
    cutId: null,
    type: "analyze",
    status: "running",
    progress: 64,
    etaSeconds: 210,
    errorMessage: null,
    payload: { step: "análise multimodal", model: "clip-vit" },
    createdAt: iso(1.4),
    finishedAt: null,
  },
  {
    id: "job-0002-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: mockProjects[2].id,
    cutId: null,
    type: "transcribe",
    status: "done",
    progress: 100,
    etaSeconds: null,
    errorMessage: null,
    payload: { engine: "whisper-large-v3", language: "pt-BR" },
    createdAt: iso(1.9),
    finishedAt: iso(1.5),
  },
  {
    id: "job-0003-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: mockProjects[0].id,
    cutId: mockCuts[0].id,
    type: "render",
    status: "done",
    progress: 100,
    etaSeconds: null,
    errorMessage: null,
    payload: { resolution: "2160p", fps: 60, codec: "h265" },
    createdAt: iso(26),
    finishedAt: iso(25.8),
  },
  {
    id: "job-0004-aaaa-bbbb-cccc-000000000000",
    userId: "other-user",
    projectId: null,
    cutId: null,
    type: "radar_scan",
    status: "running",
    progress: 31,
    etaSeconds: 540,
    errorMessage: null,
    payload: { niches: NICHES_ALL, period: "24h" },
    createdAt: iso(0.4),
    finishedAt: null,
  },
  {
    id: "job-0005-aaaa-bbbb-cccc-000000000000",
    userId: "other-user",
    projectId: "proj-ext-01",
    cutId: null,
    type: "import",
    status: "error",
    progress: 12,
    etaSeconds: null,
    errorMessage: "Vídeo indisponível na origem (removido pelo autor)",
    payload: { url: "https://youtube.com/watch?v=removed" },
    createdAt: iso(5),
    finishedAt: iso(4.9),
  },
];

// ---------------------------------------------------------------- dashboard

const usageRnd = seededRandom(4242);
export const mockDashboardStats: DashboardStats = {
  minutesProcessed: 412,
  cutsGenerated: 87,
  recentProjects: mockProjects,
  usageSeries: Array.from({ length: 14 }, (_, i) => ({
    date: new Date(MOCK_NOW - (13 - i) * 24 * 3600_000).toISOString().slice(0, 10),
    minutes: Math.round(8 + usageRnd() * 55),
    cuts: Math.round(1 + usageRnd() * 9),
  })),
  nicheHighlights: mockTrendVideos.filter((t) => t.niche === "finanças" || t.niche === "podcast").slice(0, 4),
};

// ---------------------------------------------------------------- admin

export const mockAdminMetrics: AdminMetrics = {
  totalUsers: 12840,
  activeUsers: 3117,
  minutesProcessedToday: 41260,
  rendersQueued: 37,
  errorRatePct: 0.8,
};

export const mockAdminUsers: AdminUserRow[] = [
  { id: "u-001", name: "Marina Duarte", email: "criador@cortaai.com.br", projectsCount: 24, createdAt: iso(24 * 90) },
  { id: "u-002", name: "Caio Mendes", email: "caio@agenciaclipe.com", projectsCount: 58, createdAt: iso(24 * 220) },
  { id: "u-003", name: "Júlia Sato", email: "julia.sato@gmail.com", projectsCount: 3, createdAt: iso(24 * 12) },
  { id: "u-004", name: "Pedro Antunes", email: "pedro@podcastbr.com", projectsCount: 31, createdAt: iso(24 * 61) },
  { id: "u-005", name: "Lívia Rocha", email: "livia.rocha@outlook.com", projectsCount: 5, createdAt: iso(24 * 5) },
  { id: "u-006", name: "Estúdio Vira Clip", email: "contato@viraclip.tv", projectsCount: 142, createdAt: iso(24 * 300) },
  { id: "u-007", name: "Renan Farias", email: "renan.f@gmail.com", projectsCount: 12, createdAt: iso(24 * 33) },
];

// ---------------------------------------------------------------- music library (editor)

export const mockMusicLibrary: { track: string; mood: string; bpm: number; duration: number }[] = [
  { track: "Aesthetic Hustle — trap lo-fi", mood: "confiante", bpm: 140, duration: 152 },
  { track: "Emotional Piano Ambient", mood: "emocional", bpm: 72, duration: 198 },
  { track: "Gym Phonk Brasileiro", mood: "agressivo", bpm: 150, duration: 121 },
  { track: "Focus Flow — estudo lo-fi", mood: "calmo", bpm: 80, duration: 240 },
  { track: "AI Future Bass", mood: "empolgado", bpm: 124, duration: 164 },
  { track: "Epic Orchestral Gamer", mood: "épico", bpm: 145, duration: 175 },
  { track: "Cinematic Tension Rise", mood: "tenso", bpm: 96, duration: 143 },
  { track: "Glam Transformation Pop", mood: "leve", bpm: 108, duration: 156 },
];

// ---------------------------------------------------------------- Estúdio IA

/** Templates de efeito (galeria). Thumbnails/preview 100% locais (SVG data-URI). */
export const mockEffectTemplates: EffectTemplate[] = [
  { id: "explodir", label: "Explodir", thumbnailUrl: svgThumb("Explodir 💥", "games"), previewUrl: svgThumb("Explodir 💥", "games") },
  { id: "abraco", label: "Abraço", thumbnailUrl: svgThumb("Abraço 🤗", "beleza"), previewUrl: svgThumb("Abraço 🤗", "beleza") },
  { id: "envelhecer", label: "Envelhecer", thumbnailUrl: svgThumb("Envelhecer ⏳", "educação"), previewUrl: svgThumb("Envelhecer ⏳", "educação") },
  { id: "transformar", label: "Transformar", thumbnailUrl: svgThumb("Transformar ✨", "tecnologia"), previewUrl: svgThumb("Transformar ✨", "tecnologia") },
  { id: "derreter", label: "Derreter", thumbnailUrl: svgThumb("Derreter 🫠", "fitness"), previewUrl: svgThumb("Derreter 🫠", "fitness") },
  { id: "inflar", label: "Inflar", thumbnailUrl: svgThumb("Inflar 🎈", "humor"), previewUrl: svgThumb("Inflar 🎈", "humor") },
];

/** Gerações de exemplo (todas concluídas) para popular a galeria "Gerações recentes". */
export const mockGenerations: Generation[] = [
  {
    id: "gen-0001-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: null,
    cutId: null,
    function: "text_to_video",
    prompt: "Um foguete artesanal decolando de uma favela colorida ao amanhecer, câmera cinematográfica subindo junto",
    params: { aspectRatio: "9:16", duration: 5, style: "cinematográfico", cameraMovement: "zoom_in", negativePrompt: "borrado, distorcido" },
    inputAssetUrl: null,
    inputAssetUrl2: null,
    status: "done",
    progress: 100,
    errorMessage: null,
    resultUrl: "mock://studio/gen-0001.mp4",
    thumbnailUrl: svgThumb("Foguete ao amanhecer", "tecnologia"),
    durationSeconds: 5,
    resolution: "1080x1920",
    fps: 24,
    model: "mock",
    createdAt: iso(6),
    finishedAt: iso(5.9),
  },
  {
    id: "gen-0002-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: null,
    cutId: null,
    function: "image_to_video",
    prompt: "Retrato ganha vida, cabelo balançando ao vento",
    params: { motion: "moderado", duration: 5, cameraMovement: "orbit" },
    inputAssetUrl: svgThumb("Retrato de estúdio", "beleza"),
    inputAssetUrl2: null,
    status: "done",
    progress: 100,
    errorMessage: null,
    resultUrl: "mock://studio/gen-0002.mp4",
    thumbnailUrl: svgThumb("Retrato animado", "beleza"),
    durationSeconds: 5,
    resolution: "1080x1080",
    fps: 24,
    model: "mock",
    createdAt: iso(12),
    finishedAt: iso(11.9),
  },
  {
    id: "gen-0003-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: mockProjects[1].id,
    cutId: mockCuts[0].id,
    function: "extend",
    prompt: null,
    params: { seconds: 4, direction: "loop" },
    inputAssetUrl: svgThumb("Corte original", "finanças"),
    inputAssetUrl2: null,
    status: "done",
    progress: 100,
    errorMessage: null,
    resultUrl: "mock://studio/gen-0003.mp4",
    thumbnailUrl: svgThumb("Loop perfeito", "finanças"),
    durationSeconds: 4,
    resolution: "1080x1920",
    fps: 30,
    model: "mock",
    createdAt: iso(20),
    finishedAt: iso(19.9),
  },
  {
    id: "gen-0004-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: null,
    cutId: null,
    function: "frames",
    prompt: null,
    params: { duration: 5 },
    inputAssetUrl: svgThumb("Quadro inicial", "humor"),
    inputAssetUrl2: svgThumb("Quadro final", "tecnologia"),
    status: "done",
    progress: 100,
    errorMessage: null,
    resultUrl: "mock://studio/gen-0004.mp4",
    thumbnailUrl: svgThumb("Transição início→fim", "tecnologia"),
    durationSeconds: 5,
    resolution: "1080x1920",
    fps: 24,
    model: "mock",
    createdAt: iso(28),
    finishedAt: iso(27.9),
  },
  {
    id: "gen-0005-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: null,
    cutId: null,
    function: "lip_sync",
    prompt: "Comenta EU QUERO aqui embaixo que eu te mando o material completo!",
    params: { source: "ttsText", ttsText: "Comenta EU QUERO aqui embaixo que eu te mando o material completo!", voice: "pt-BR-Francisca", language: "pt-BR" },
    inputAssetUrl: svgThumb("Apresentador", "podcast"),
    inputAssetUrl2: null,
    status: "done",
    progress: 100,
    errorMessage: null,
    resultUrl: "mock://studio/gen-0005.mp4",
    thumbnailUrl: svgThumb("Lip sync pt-BR", "podcast"),
    durationSeconds: 6,
    resolution: "1080x1920",
    fps: 30,
    model: "mock",
    createdAt: iso(40),
    finishedAt: iso(39.9),
  },
  {
    id: "gen-0006-aaaa-bbbb-cccc-000000000000",
    userId: mockUser.id,
    projectId: null,
    cutId: null,
    function: "effect_template",
    prompt: null,
    params: { template: "transformar" },
    inputAssetUrl: svgThumb("Foto de origem", "beleza"),
    inputAssetUrl2: null,
    status: "done",
    progress: 100,
    errorMessage: null,
    resultUrl: "mock://studio/gen-0006.mp4",
    thumbnailUrl: svgThumb("Efeito Transformar ✨", "tecnologia"),
    durationSeconds: 5,
    resolution: "1080x1920",
    fps: 24,
    model: "mock",
    createdAt: iso(52),
    finishedAt: iso(51.9),
  },
];
