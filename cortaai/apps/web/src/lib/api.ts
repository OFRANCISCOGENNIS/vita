// API client for the FastAPI backend (SPEC.md contract).
//
// FALLBACK BEHAVIOR: every function tries the real API at NEXT_PUBLIC_API_URL
// (default http://localhost:8000/api/v1) with a short ~1500ms timeout. On any
// network error, timeout or non-2xx response it silently falls back to the
// rich mocks in lib/mock-data.ts, so the whole app is navigable standalone
// (demos, offline development, backend not yet running).

import {
  mockAdminMetrics,
  mockAdminUsers,
  mockCuts,
  mockDashboardStats,
  mockJobs,
  mockNichePatterns,
  mockProjects,
  mockTrendAnalyses,
  mockTrendVideos,
  mockUser,
} from "./mock-data";
import { NICHES } from "./presets";
import type {
  AdminMetrics,
  AdminUserRow,
  Cut,
  CutMode,
  DashboardStats,
  Job,
  Niche,
  NicheAlert,
  NichePattern,
  PlanId,
  PlanInterval,
  Project,
  RenderResult,
  Resolution,
  TrendAnalysis,
  TrendPeriod,
  TrendVideo,
  UrlPreview,
  User,
} from "./types";
import { svgThumb, uid } from "./utils";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const TIMEOUT_MS = 1500;

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Small artificial delay for fallbacks so loading states are visible/realistic. */
function mockDelay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 250 + Math.random() * 350));
}

async function request<T>(
  path: string,
  fallback: () => T | Promise<T>,
  init?: RequestInit,
): Promise<T> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`API ${res.status}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch {
    // API unreachable → mock fallback (documented at top of file).
    await mockDelay();
    return fallback();
  }
}

// ---------------------------------------------------------------- auth

export async function login(email: string, _password: string): Promise<{ token: string; user: User }> {
  return request(`/auth/login`, () => ({ token: `mock-token-${uid()}`, user: { ...mockUser, email } }), {
    method: "POST",
    body: JSON.stringify({ email, password: _password }),
  });
}

export async function register(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
  return request(
    `/auth/register`,
    () => ({ token: `mock-token-${uid()}`, user: { ...mockUser, name, email, plan: "free" as PlanId, minutesUsedMonth: 0 } }),
    { method: "POST", body: JSON.stringify({ name, email, password }) },
  );
}

// INTEGRAÇÃO PAGA/EXTERNA: Google OAuth — o id_token real viria do SDK do Google.
export async function loginGoogle(idToken: string): Promise<{ token: string; user: User }> {
  return request(`/auth/google`, () => ({ token: `mock-google-${uid()}`, user: mockUser }), {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  });
}

export async function passwordReset(email: string): Promise<void> {
  return request(`/auth/password-reset`, () => undefined, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function me(): Promise<User> {
  return request(`/auth/me`, () => mockUser);
}

// ---------------------------------------------------------------- Radar Viral

export interface TrendFilters {
  niche?: Niche | "";
  q?: string;
  period?: TrendPeriod;
  language?: string;
  minDuration?: number;
  maxDuration?: number;
  platform?: string;
}

export async function getTrends(filters: TrendFilters = {}): Promise<{ items: TrendVideo[] }> {
  const params = new URLSearchParams();
  if (filters.niche) params.set("niche", filters.niche);
  if (filters.q) params.set("q", filters.q);
  if (filters.period) params.set("period", filters.period);
  if (filters.language) params.set("language", filters.language);
  if (filters.minDuration != null) params.set("min_duration", String(filters.minDuration));
  if (filters.maxDuration != null) params.set("max_duration", String(filters.maxDuration));
  if (filters.platform) params.set("platform", filters.platform);

  return request(`/radar/trends?${params.toString()}`, () => {
    const periodHours = filters.period === "24h" ? 24 : filters.period === "30d" ? 720 : 168;
    const cutoff = Date.now(); // mocks use fixed publishedAt; filter by hours-ago vs MOCK_NOW handled loosely
    let items = mockTrendVideos.filter((t) => {
      if (filters.niche && t.niche !== filters.niche) return false;
      if (filters.platform && t.platform !== filters.platform) return false;
      if (filters.language && t.language !== filters.language) return false;
      if (filters.minDuration != null && t.durationSeconds < filters.minDuration) return false;
      if (filters.maxDuration != null && t.durationSeconds > filters.maxDuration) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.channel.toLowerCase().includes(q)) return false;
      }
      // period filter against mock timestamps
      const hoursAgo = (new Date("2026-07-08T15:00:00Z").getTime() - new Date(t.publishedAt).getTime()) / 3600_000;
      if (hoursAgo > periodHours) return false;
      void cutoff;
      return true;
    });
    items = [...items].sort((a, b) => b.retentionIndex - a.retentionIndex);
    return { items };
  });
}

export async function getTrendVideo(id: string): Promise<TrendVideo> {
  return request(`/radar/videos/${id}`, () => {
    const found = mockTrendVideos.find((t) => t.id === id);
    if (!found) throw new Error("Vídeo não encontrado");
    return found;
  });
}

export async function getTrendXray(id: string): Promise<TrendAnalysis> {
  return request(`/radar/videos/${id}/xray`, () => {
    const found = mockTrendAnalyses.find((a) => a.trendVideoId === id);
    if (!found) throw new Error("Raio-X não encontrado");
    return found;
  });
}

export async function getNiches(): Promise<{ niches: string[] }> {
  return request(`/radar/niches`, () => ({ niches: NICHES }));
}

export async function getNichePatterns(niche: Niche, period: TrendPeriod = "7d"): Promise<NichePattern> {
  return request(`/radar/niches/${encodeURIComponent(niche)}/patterns?period=${period}`, () => {
    const found = mockNichePatterns.find((p) => p.niche === niche && p.period === period);
    if (!found) throw new Error("Padrões não encontrados");
    return found;
  });
}

// niche alerts (favorite niches) — mock persists in-memory + localStorage
const ALERTS_KEY = "cortaai-niche-alerts";
function readLocalAlerts(): NicheAlert[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(ALERTS_KEY) ?? "[]") as NicheAlert[];
  } catch {
    return [];
  }
}
function writeLocalAlerts(alerts: NicheAlert[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

export async function getNicheAlerts(): Promise<NicheAlert[]> {
  return request(`/radar/alerts`, () => readLocalAlerts());
}

export async function createNicheAlert(niche: Niche): Promise<NicheAlert> {
  return request(
    `/radar/alerts`,
    () => {
      const alert: NicheAlert = { id: uid(), userId: mockUser.id, niche, enabled: true, lastNotifiedAt: null };
      writeLocalAlerts([...readLocalAlerts().filter((a) => a.niche !== niche), alert]);
      return alert;
    },
    { method: "POST", body: JSON.stringify({ niche }) },
  );
}

export async function deleteNicheAlert(id: string): Promise<void> {
  return request(
    `/radar/alerts/${id}`,
    () => {
      writeLocalAlerts(readLocalAlerts().filter((a) => a.id !== id));
      return undefined;
    },
    { method: "DELETE" },
  );
}

// radar → production integration actions
export async function useTrendSound(trendVideoId: string, cutId: string): Promise<{ ok: boolean }> {
  return request(`/radar/videos/${trendVideoId}/use-sound`, () => ({ ok: true }), {
    method: "POST",
    body: JSON.stringify({ cutId }),
  });
}

export async function useTrendCaptionStyle(trendVideoId: string, projectId: string): Promise<{ ok: boolean }> {
  return request(`/radar/videos/${trendVideoId}/use-caption-style`, () => ({ ok: true }), {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export async function inspireCut(trendVideoId: string, projectId: string): Promise<{ jobId: string }> {
  return request(`/radar/videos/${trendVideoId}/inspire-cut`, () => ({ jobId: uid() }), {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

// ---------------------------------------------------------------- projects & cuts

export async function uploadInit(
  filename: string,
  sizeBytes: number,
  contentType: string,
): Promise<{ uploadId: string; chunkSize: number; presignedUrls: string[] }> {
  return request(
    `/projects/upload-init`,
    () => {
      const chunkSize = 16 * 1024 * 1024; // 16 MB chunks to MinIO
      const chunks = Math.max(1, Math.ceil(sizeBytes / chunkSize));
      return {
        uploadId: uid(),
        chunkSize,
        presignedUrls: Array.from({ length: chunks }, (_, i) => `mock://minio/upload/part-${i + 1}`),
      };
    },
    { method: "POST", body: JSON.stringify({ filename, sizeBytes, contentType }) },
  );
}

export async function uploadComplete(uploadId: string, filename: string): Promise<Project> {
  return request(
    `/projects/upload-complete`,
    () => ({
      ...mockProjects[1],
      id: uid(),
      title: filename.replace(/\.[a-z0-9]+$/i, ""),
      originalFilename: filename,
      sourceType: "upload" as const,
      status: "transcribing" as const,
      thumbnailUrl: svgThumb(filename, "tecnologia"),
      createdAt: new Date().toISOString(),
    }),
    { method: "POST", body: JSON.stringify({ uploadId }) },
  );
}

export async function importUrl(url: string, quality: Resolution): Promise<Project> {
  return request(
    `/projects/import-url`,
    () => ({
      ...mockProjects[0],
      id: uid(),
      sourceUrl: url,
      resolution: quality,
      status: "importing" as const,
      createdAt: new Date().toISOString(),
    }),
    { method: "POST", body: JSON.stringify({ url, quality }) },
  );
}

export async function urlPreview(url: string): Promise<UrlPreview> {
  return request(`/projects/url-preview?url=${encodeURIComponent(url)}`, () => {
    const isTwitch = url.includes("twitch");
    const isVimeo = url.includes("vimeo");
    const title = isTwitch
      ? "VOD — Ranqueada até o topo com a tropa (partidas completas)"
      : isVimeo
        ? "Documentário — Bastidores da criação (director's cut)"
        : "Como construir uma audiência do zero em 2026 — masterclass completa";
    return {
      title,
      channel: isTwitch ? "canalstream_br" : isVimeo ? "Estúdio Vira Clip" : "Escola do Criador",
      durationSeconds: isTwitch ? 8442 : isVimeo ? 3120 : 4515,
      thumbnailUrl: svgThumb(title, isTwitch ? "games" : "educação"),
      availableResolutions: (isTwitch ? ["720p", "1080p"] : ["720p", "1080p", "1440p", "2160p"]) as Resolution[],
    };
  });
}

export async function listProjects(): Promise<Project[]> {
  return request(`/projects`, () => mockProjects);
}

export async function getProject(id: string): Promise<Project> {
  return request(`/projects/${id}`, () => {
    const found = mockProjects.find((p) => p.id === id);
    if (!found) throw new Error("Projeto não encontrado");
    return found;
  });
}

export async function deleteProject(id: string): Promise<void> {
  return request(`/projects/${id}`, () => undefined, { method: "DELETE" });
}

export async function generateCuts(
  projectId: string,
  mode: CutMode,
  aggressiveness: number,
  count: number,
): Promise<{ jobId: string }> {
  return request(`/projects/${projectId}/generate-cuts`, () => ({ jobId: uid() }), {
    method: "POST",
    body: JSON.stringify({ mode, aggressiveness, count }),
  });
}

export async function getProjectCuts(projectId: string): Promise<Cut[]> {
  return request(`/projects/${projectId}/cuts`, () =>
    mockCuts.filter((c) => c.projectId === projectId),
  );
}

export async function getCut(cutId: string): Promise<Cut> {
  // Convenience for the editor: SPEC exposes cuts via project listing + PATCH by id.
  return request(`/cuts/${cutId}`, () => {
    const found = mockCuts.find((c) => c.id === cutId);
    if (!found) throw new Error("Corte não encontrado");
    return found;
  });
}

export async function patchCut(cutId: string, patch: Partial<Cut>): Promise<Cut> {
  return request(
    `/cuts/${cutId}`,
    () => {
      const found = mockCuts.find((c) => c.id === cutId) ?? mockCuts[0];
      return { ...found, ...patch };
    },
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export async function regenerateCut(cutId: string): Promise<Cut> {
  return request(
    `/cuts/${cutId}/regenerate`,
    () => {
      const found = mockCuts.find((c) => c.id === cutId) ?? mockCuts[0];
      const bump = (n: number) => Math.min(99, Math.max(40, n + Math.round(Math.random() * 14 - 6)));
      return {
        ...found,
        title: found.titleOptions[(found.titleOptions.indexOf(found.title) + 1) % found.titleOptions.length],
        viralScore: bump(found.viralScore),
        scoreBreakdown: {
          hook: bump(found.scoreBreakdown.hook),
          retention: bump(found.scoreBreakdown.retention),
          emotion: bump(found.scoreBreakdown.emotion),
          nicheFit: bump(found.scoreBreakdown.nicheFit),
        },
      };
    },
    { method: "POST" },
  );
}

// ---------------------------------------------------------------- renders

export async function createRenders(
  cutIds: string[],
  resolution: string,
  fps: number,
  codec: "h264" | "h265",
  preset: string,
): Promise<{ jobs: Job[] }> {
  return request(
    `/renders`,
    () => ({
      jobs: cutIds.map((cutId) => ({
        id: uid(),
        userId: mockUser.id,
        projectId: mockCuts.find((c) => c.id === cutId)?.projectId ?? null,
        cutId,
        type: "render" as const,
        status: "queued" as const,
        progress: 0,
        etaSeconds: 90,
        errorMessage: null,
        payload: { resolution, fps, codec, preset },
        createdAt: new Date().toISOString(),
        finishedAt: null,
      })),
    }),
    { method: "POST", body: JSON.stringify({ cutIds, resolution, fps, codec, preset }) },
  );
}

export async function getRender(jobId: string): Promise<Job & Partial<RenderResult>> {
  return request(`/renders/${jobId}`, () => ({
    ...mockJobs[2],
    id: jobId,
    downloadUrl: `mock://minio/renders/${jobId}.mp4`,
    srtUrl: `mock://minio/renders/${jobId}.srt`,
    thumbUrl: `mock://minio/renders/${jobId}.jpg`,
    metaTxtUrl: `mock://minio/renders/${jobId}.txt`,
  }));
}

export async function batchZip(jobIds: string[]): Promise<{ zipUrl: string }> {
  return request(`/renders/batch-zip`, () => ({ zipUrl: `mock://minio/zips/${uid()}.zip` }), {
    method: "POST",
    body: JSON.stringify({ jobIds }),
  });
}

// ---------------------------------------------------------------- dashboard / billing / admin

export async function dashboardStats(): Promise<DashboardStats> {
  return request(`/dashboard/stats`, () => mockDashboardStats);
}

// INTEGRAÇÃO PAGA: Stripe — em produção retorna a URL real do Checkout.
export async function billingCheckout(plan: PlanId, interval: PlanInterval): Promise<{ checkoutUrl: string }> {
  return request(
    `/billing/checkout`,
    () => ({ checkoutUrl: `https://checkout.stripe.com/mock/${plan}-${interval}` }),
    { method: "POST", body: JSON.stringify({ plan, interval }) },
  );
}

export async function adminMetrics(): Promise<AdminMetrics> {
  return request(`/admin/metrics`, () => mockAdminMetrics);
}

export async function adminUsers(): Promise<AdminUserRow[]> {
  return request(`/admin/users`, () => mockAdminUsers);
}

export async function adminJobs(): Promise<Job[]> {
  return request(`/admin/jobs`, () => mockJobs);
}
