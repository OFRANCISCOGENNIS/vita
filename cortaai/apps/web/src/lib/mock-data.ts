// Rich deterministic seed mocks. The app must be fully navigable offline:
// every api.ts call falls back to this data when the API is unreachable.

import type {
  AdminMetrics,
  AdminUserRow,
  Cut,
  DashboardStats,
  Job,
  Project,
  TranscriptWord,
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
  suggestedSound: { track: c.sound, reason: c.soundReason, trendVideoId: "" },
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
  nicheHighlights: [],
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
