// Dados mock do Painel do ADM (plataforma inteira). Mantido fora de
// mock-data.ts de propósito: são agregados administrativos, não a semente do
// criador. 100% client-side / export-safe. Timestamps derivam de MOCK_NOW para
// render idêntico no servidor e no cliente (sem Date.now() em módulo).

import { MOCK_NOW } from "./mock-data";
import { NICHES } from "./presets";
import type { Niche } from "./types";

/** ISO a partir de horas atrás de MOCK_NOW (determinístico). */
function iso(hoursAgo: number): string {
  return new Date(MOCK_NOW - hoursAgo * 3_600_000).toISOString();
}

// ---------------------------------------------------------------- KPIs

export interface PlatformMetric {
  key: string;
  label: string;
  value: number;
  /** variação percentual vs. período anterior (pode ser negativa). */
  deltaPct: number;
  hint: string;
}

export const platformMetrics: PlatformMetric[] = [
  { key: "totalUsers", label: "Usuários totais", value: 12840, deltaPct: 6.4, hint: "contas cadastradas" },
  { key: "activeToday", label: "Ativos hoje", value: 3117, deltaPct: 4.1, hint: "sessões nas últimas 24h" },
  { key: "active7d", label: "Ativos em 7 dias", value: 6982, deltaPct: 2.8, hint: "usuários únicos na semana" },
  { key: "cutsGenerated", label: "Cortes gerados", value: 184920, deltaPct: 9.2, hint: "acumulado na plataforma" },
  { key: "minutesProcessed", label: "Minutos processados", value: 1284600, deltaPct: 7.5, hint: "vídeo analisado pela IA" },
  { key: "jobsQueued", label: "Jobs na fila", value: 37, deltaPct: -12.0, hint: "aguardando worker" },
  { key: "generations", label: "Gerações (Estúdio IA)", value: 42310, deltaPct: 14.6, hint: "text/image → vídeo" },
  { key: "errorRate", label: "Taxa de erro", value: 0.8, deltaPct: -0.3, hint: "% de jobs com falha" },
];

// ---------------------------------------------------------------- séries

export interface AdminUsagePoint {
  date: string;
  minutes: number;
  cuts: number;
  generations: number;
}

// Padrão determinístico de 14 dias (crescimento leve + oscilação de fim de semana).
const USAGE_PATTERN: [number, number, number][] = [
  [7200, 980, 210],
  [7650, 1040, 235],
  [8100, 1120, 248],
  [6900, 890, 198],
  [6400, 820, 176],
  [8300, 1180, 262],
  [8900, 1260, 289],
  [9200, 1310, 301],
  [8700, 1220, 277],
  [7600, 990, 214],
  [7100, 940, 205],
  [9600, 1380, 318],
  [10200, 1470, 342],
  [10850, 1560, 366],
];

export const adminUsageSeries: AdminUsagePoint[] = USAGE_PATTERN.map(([minutes, cuts, generations], i) => ({
  date: new Date(MOCK_NOW - (13 - i) * 24 * 3_600_000).toISOString().slice(0, 10),
  minutes,
  cuts,
  generations,
}));

export interface BreakdownSlice {
  label: string;
  value: number;
}

// Cortes por nicho (proporção realista dos 8 nichos).
const NICHE_WEIGHTS: Record<Niche, number> = {
  finanças: 28400,
  fitness: 22100,
  podcast: 31200,
  humor: 26800,
  educação: 19400,
  tecnologia: 24700,
  beleza: 15900,
  games: 16420,
};

export const cutsByNiche: BreakdownSlice[] = NICHES.map((n) => ({
  label: n,
  value: NICHE_WEIGHTS[n],
})).sort((a, b) => b.value - a.value);

export const cutsByPlatform: BreakdownSlice[] = [
  { label: "TikTok", value: 78400 },
  { label: "Reels", value: 61200 },
  { label: "Shorts", value: 45320 },
];

// ---------------------------------------------------------------- usuários

export type AdminRole = "admin" | "common";
export type AdminUserStatus = "active" | "suspended";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminUserStatus;
  projects: number;
  cuts: number;
  plan: "Free" | "Pro" | "Studio";
  lastAccess: string;
  createdAt: string;
}

export const adminUsers: AdminUser[] = [
  { id: "u-001", name: "Genis Frazão", email: "frazaogenis@gmail.com", role: "admin", status: "active", projects: 61, cuts: 842, plan: "Studio", lastAccess: iso(0.3), createdAt: iso(24 * 410) },
  { id: "u-002", name: "Marina Duarte", email: "criador@cortaai.com.br", role: "common", status: "active", projects: 24, cuts: 318, plan: "Pro", lastAccess: iso(2.1), createdAt: iso(24 * 90) },
  { id: "u-003", name: "Caio Mendes", email: "caio@agenciaclipe.com", role: "common", status: "active", projects: 58, cuts: 1204, plan: "Studio", lastAccess: iso(5.4), createdAt: iso(24 * 220) },
  { id: "u-004", name: "Júlia Sato", email: "julia.sato@gmail.com", role: "common", status: "active", projects: 3, cuts: 41, plan: "Free", lastAccess: iso(19), createdAt: iso(24 * 12) },
  { id: "u-005", name: "Pedro Antunes", email: "pedro@podcastbr.com", role: "common", status: "active", projects: 31, cuts: 592, plan: "Pro", lastAccess: iso(31), createdAt: iso(24 * 61) },
  { id: "u-006", name: "Lívia Rocha", email: "livia.rocha@outlook.com", role: "common", status: "suspended", projects: 5, cuts: 63, plan: "Free", lastAccess: iso(96), createdAt: iso(24 * 5) },
  { id: "u-007", name: "Estúdio Vira Clip", email: "contato@viraclip.tv", role: "admin", status: "active", projects: 142, cuts: 3180, plan: "Studio", lastAccess: iso(1.2), createdAt: iso(24 * 300) },
  { id: "u-008", name: "Renan Farias", email: "renan.f@gmail.com", role: "common", status: "active", projects: 12, cuts: 187, plan: "Pro", lastAccess: iso(8.7), createdAt: iso(24 * 33) },
  { id: "u-009", name: "Bianca Nunes", email: "bianca@fitcortes.com", role: "common", status: "active", projects: 19, cuts: 274, plan: "Pro", lastAccess: iso(46), createdAt: iso(24 * 74) },
  { id: "u-010", name: "Diego Prado", email: "diego.prado@gmail.com", role: "common", status: "suspended", projects: 2, cuts: 9, plan: "Free", lastAccess: iso(212), createdAt: iso(24 * 3) },
  { id: "u-011", name: "Tatiana Alves", email: "tati@belezaviral.com", role: "common", status: "active", projects: 27, cuts: 415, plan: "Studio", lastAccess: iso(14), createdAt: iso(24 * 128) },
  { id: "u-012", name: "Gustavo Lima", email: "gustavo.games@gmail.com", role: "common", status: "active", projects: 41, cuts: 736, plan: "Pro", lastAccess: iso(3.9), createdAt: iso(24 * 156) },
];

// ---------------------------------------------------------------- fila de jobs

export type AdminJobType = "import" | "transcribe" | "analyze" | "render" | "generation";
export type AdminJobStatus = "queued" | "running" | "done" | "error";

export interface AdminJob {
  id: string;
  type: AdminJobType;
  status: AdminJobStatus;
  progress: number;
  userName: string;
  userEmail: string;
  target: string;
  etaSeconds: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export const adminJobs: AdminJob[] = [
  { id: "job-9a01", type: "analyze", status: "running", progress: 64, userName: "Caio Mendes", userEmail: "caio@agenciaclipe.com", target: "Masterclass de tráfego pago", etaSeconds: 210, errorMessage: null, createdAt: iso(0.4) },
  { id: "job-9a02", type: "render", status: "running", progress: 38, userName: "Estúdio Vira Clip", userEmail: "contato@viraclip.tv", target: "Corte — Hook do episódio 42", etaSeconds: 95, errorMessage: null, createdAt: iso(0.2) },
  { id: "job-9a03", type: "generation", status: "queued", progress: 0, userName: "Tatiana Alves", userEmail: "tati@belezaviral.com", target: "Texto → Vídeo: rotina de skincare", etaSeconds: 40, errorMessage: null, createdAt: iso(0.1) },
  { id: "job-9a04", type: "transcribe", status: "done", progress: 100, userName: "Pedro Antunes", userEmail: "pedro@podcastbr.com", target: "Podcast #118 — convidada especial", etaSeconds: null, errorMessage: null, createdAt: iso(1.6) },
  { id: "job-9a05", type: "import", status: "error", progress: 12, userName: "Diego Prado", userEmail: "diego.prado@gmail.com", target: "youtube.com/watch?v=removed", etaSeconds: null, errorMessage: "Vídeo indisponível na origem (removido pelo autor)", createdAt: iso(3.2) },
  { id: "job-9a06", type: "render", status: "queued", progress: 0, userName: "Gustavo Lima", userEmail: "gustavo.games@gmail.com", target: "Corte — Clutch 1v4 ranqueada", etaSeconds: 120, errorMessage: null, createdAt: iso(0.5) },
  { id: "job-9a07", type: "analyze", status: "done", progress: 100, userName: "Bianca Nunes", userEmail: "bianca@fitcortes.com", target: "Treino de mobilidade completo", etaSeconds: null, errorMessage: null, createdAt: iso(4.1) },
  { id: "job-9a08", type: "generation", status: "error", progress: 51, userName: "Renan Farias", userEmail: "renan.f@gmail.com", target: "Motion Brush — abertura animada", etaSeconds: null, errorMessage: "Falha no worker de vídeo (timeout de 180s)", createdAt: iso(2.7) },
  { id: "job-9a09", type: "transcribe", status: "running", progress: 82, userName: "Júlia Sato", userEmail: "julia.sato@gmail.com", target: "Aula 03 — funções em Python", etaSeconds: 30, errorMessage: null, createdAt: iso(0.3) },
  { id: "job-9a10", type: "import", status: "done", progress: 100, userName: "Marina Duarte", userEmail: "criador@cortaai.com.br", target: "Live de finanças pessoais (4h)", etaSeconds: null, errorMessage: null, createdAt: iso(6.5) },
];

// ---------------------------------------------------------------- conteúdo / moderação

export type ContentKind = "project" | "cut";

export interface AdminContentItem {
  id: string;
  kind: ContentKind;
  title: string;
  userName: string;
  niche: Niche;
  viralScore: number | null;
  flagged: boolean;
  createdAt: string;
}

export const adminContent: AdminContentItem[] = [
  { id: "c-01", kind: "cut", title: "Como sair das dívidas em 90 dias", userName: "Marina Duarte", niche: "finanças", viralScore: 92, flagged: false, createdAt: iso(1.1) },
  { id: "c-02", kind: "cut", title: "O erro que TODO iniciante comete na academia", userName: "Bianca Nunes", niche: "fitness", viralScore: 88, flagged: false, createdAt: iso(2.4) },
  { id: "c-03", kind: "project", title: "Podcast #118 — convidada especial", userName: "Pedro Antunes", niche: "podcast", viralScore: null, flagged: false, createdAt: iso(3.0) },
  { id: "c-04", kind: "cut", title: "Reação polêmica ao vivo (conteúdo sensível)", userName: "Gustavo Lima", niche: "games", viralScore: 71, flagged: true, createdAt: iso(4.6) },
  { id: "c-05", kind: "cut", title: "3 apps de IA que ninguém te contou", userName: "Renan Farias", niche: "tecnologia", viralScore: 84, flagged: false, createdAt: iso(5.2) },
  { id: "c-06", kind: "cut", title: "Maquiagem em 60 segundos", userName: "Tatiana Alves", niche: "beleza", viralScore: 79, flagged: false, createdAt: iso(6.8) },
  { id: "c-07", kind: "project", title: "Aula 03 — funções em Python", userName: "Júlia Sato", niche: "educação", viralScore: null, flagged: false, createdAt: iso(7.3) },
  { id: "c-08", kind: "cut", title: "Piada interna que viralizou (checar direitos)", userName: "Caio Mendes", niche: "humor", viralScore: 66, flagged: true, createdAt: iso(9.1) },
  { id: "c-09", kind: "cut", title: "Clutch 1v4 na ranqueada", userName: "Gustavo Lima", niche: "games", viralScore: 90, flagged: false, createdAt: iso(11.5) },
  { id: "c-10", kind: "cut", title: "Renda passiva: mito ou verdade?", userName: "Marina Duarte", niche: "finanças", viralScore: 81, flagged: false, createdAt: iso(13.2) },
];

// ---------------------------------------------------------------- nichos / radar

export interface AdminNiche {
  niche: Niche;
  enabled: boolean;
  videosTracked: number;
  trendingIndex: number; // 0-100
  lastScan: string;
}

export const adminNiches: AdminNiche[] = [
  { niche: "finanças", enabled: true, videosTracked: 1840, trendingIndex: 88, lastScan: iso(0.6) },
  { niche: "fitness", enabled: true, videosTracked: 1520, trendingIndex: 74, lastScan: iso(0.9) },
  { niche: "podcast", enabled: true, videosTracked: 2110, trendingIndex: 91, lastScan: iso(0.5) },
  { niche: "humor", enabled: true, videosTracked: 1980, trendingIndex: 83, lastScan: iso(1.2) },
  { niche: "educação", enabled: true, videosTracked: 1360, trendingIndex: 69, lastScan: iso(1.6) },
  { niche: "tecnologia", enabled: true, videosTracked: 1670, trendingIndex: 77, lastScan: iso(0.8) },
  { niche: "beleza", enabled: false, videosTracked: 1140, trendingIndex: 61, lastScan: iso(28) },
  { niche: "games", enabled: true, videosTracked: 1290, trendingIndex: 72, lastScan: iso(1.1) },
];

// ---------------------------------------------------------------- saúde do sistema

export type HealthStatus = "operacional" | "degradado" | "fora";

export interface HealthComponent {
  key: string;
  label: string;
  status: HealthStatus;
  latencyMs: number;
  detail: string;
}

export const systemHealth: HealthComponent[] = [
  { key: "web", label: "Web (Next.js)", status: "operacional", latencyMs: 42, detail: "GitHub Pages / CDN" },
  { key: "api", label: "API (FastAPI)", status: "operacional", latencyMs: 118, detail: "modo demo — mocks locais" },
  { key: "worker", label: "Worker de vídeo", status: "operacional", latencyMs: 260, detail: "FFmpeg · fila saudável" },
  { key: "radar", label: "Radar Viral", status: "degradado", latencyMs: 640, detail: "coleta beleza atrasada" },
  { key: "db", label: "Banco de dados", status: "operacional", latencyMs: 24, detail: "Postgres · réplicas ok" },
  { key: "storage", label: "Armazenamento", status: "operacional", latencyMs: 71, detail: "MinIO / S3" },
];
