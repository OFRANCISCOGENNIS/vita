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
  mockProjects,
  mockUser,
} from "./mock-data";
import type {
  AdminMetrics,
  AdminUserRow,
  Cut,
  DashboardStats,
  Job,
  Language,
  Project,
  RenderResult,
  User,
} from "./types";
import { decodeGoogleJwt } from "./google";
import { isAdminEmail } from "./admins";
import { friendlyMediaTitle, svgThumb, uid } from "./utils";
import { addUserCut, addUserProject, isDemoSession, readUserData, updateUserCut } from "./session-scope";

/** Dashboard stats for a real (non-demo) user who has no seeded activity. */
function emptyDashboardStats(): DashboardStats {
  const { projects } = readUserData();
  return {
    minutesProcessed: 0,
    cutsGenerated: 0,
    recentProjects: projects.slice(0, 6),
    usageSeries: [],
    nicheHighlights: [],
  };
}

// URL base fixa da env de build; sem ela, localhost (dev).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
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
    const res = await fetch(`${API_BASE}${path}`, {
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

/**
 * Deriva um nome amigável a partir do e-mail — para o login demo não gerar
 * todos os usuários com o mesmo nome. Ex.: "joao.silva@gmail.com" → "Joao Silva".
 */
export function nameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").trim();
  const words = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length ? words.join(" ") : "Usuário";
}

export async function login(email: string, _password: string): Promise<{ token: string; user: User }> {
  return request(
    `/auth/login`,
    () => ({
      token: `mock-token-${uid()}`,
      // Demo: usuário fresco derivado do e-mail — não é a Marina nem admin.
      user: { ...mockUser, id: uid(), email, name: nameFromEmail(email), isAdmin: isAdminEmail(email) },
    }),
    {
      method: "POST",
      body: JSON.stringify({ email, password: _password }),
    },
  );
}

export async function register(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
  return request(
    `/auth/register`,
    () => ({
      token: `mock-token-${uid()}`,
      user: { ...mockUser, id: uid(), name, email, isAdmin: isAdminEmail(email) },
    }),
    { method: "POST", body: JSON.stringify({ name, email, password }) },
  );
}

// INTEGRAÇÃO EXTERNA: Google Sign-In (GIS). O idToken é um JWT real assinado
// pelo Google. Sem backend, decodificamos o payload no cliente para montar o
// usuário com nome/e-mail/foto REAIS. Com backend, o idToken é validado lá.
export async function loginGoogle(idToken: string): Promise<{ token: string; user: User }> {
  return request(
    `/auth/google`,
    () => {
      const { sub, email, name, picture } = decodeGoogleJwt(idToken);
      if (!sub || !email) throw new Error("Perfil do Google incompleto");
      const user: User = {
        id: sub,
        email,
        name: name || nameFromEmail(email),
        avatarUrl: picture || null,
        googleId: sub,
        brandingKit: mockUser.brandingKit,
        isAdmin: isAdminEmail(email),
        createdAt: new Date().toISOString(),
      };
      return { token: `mock-google-${uid()}`, user };
    },
    {
      method: "POST",
      body: JSON.stringify({ id_token: idToken }),
    },
  );
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

/**
 * Builds ONE Cut spanning the whole source (0 → duration) so a freshly
 * created project is immediately editable. Carries the media reference
 * (mediaId/mediaUrl) so the editor can replay the real video.
 */
function makeFullLengthCut(
  projectId: string,
  opts: { title: string; durationSeconds: number; mediaId?: string; mediaUrl?: string },
): Cut {
  const dur = opts.durationSeconds > 0 ? Math.round(opts.durationSeconds * 100) / 100 : 0;
  return {
    id: uid(),
    projectId,
    title: opts.title,
    titleOptions: [opts.title],
    description: "",
    hashtags: [],
    startSeconds: 0,
    endSeconds: dur,
    viralScore: 0,
    scoreBreakdown: { hook: 0, retention: 0, emotion: 0, nicheFit: 0 },
    transcript: [],
    mode: "manual",
    suggestedSound: { track: "Sem trilha", reason: "adicione uma trilha no editor", trendVideoId: "" },
    bestPostTime: "—",
    status: "suggested",
    editState: null,
    createdAt: new Date().toISOString(),
    ...(opts.mediaId ? { mediaId: opts.mediaId } : {}),
    ...(opts.mediaUrl ? { mediaUrl: opts.mediaUrl } : {}),
  };
}

/**
 * Cria um novo clipe do vídeo inteiro dentro de um projeto existente (botão
 * "Novo clipe" na página do projeto). Persiste para usuários reais e devolve
 * o Cut criado para a UI atualizar a grade imediatamente.
 */
export function createProjectClip(project: Project, title: string): Cut {
  const cut = makeFullLengthCut(project.id, {
    title,
    durationSeconds: project.durationSeconds,
    ...(project.mediaId ? { mediaId: project.mediaId } : {}),
    ...(project.mediaUrl ? { mediaUrl: project.mediaUrl } : {}),
  });
  addUserCut(cut);
  return cut;
}

export interface UploadCompleteMeta {
  mediaId?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  language?: Language;
}

export async function uploadComplete(
  uploadId: string,
  filename: string,
  meta: UploadCompleteMeta = {},
): Promise<Project> {
  return request(
    `/projects/upload-complete`,
    () => {
      const title = friendlyMediaTitle(filename);
      const durationSeconds =
        meta.durationSeconds && meta.durationSeconds > 0 ? Math.round(meta.durationSeconds) : 0;
      const project: Project = {
        ...mockProjects[1],
        id: uid(),
        title,
        originalFilename: filename,
        sourceType: "upload" as const,
        sourceUrl: null,
        durationSeconds,
        // Real local upload → media is available now, so it's editable at once.
        status: "ready" as const,
        language: meta.language && meta.language !== "auto" ? meta.language : mockProjects[1].language,
        thumbnailUrl: meta.thumbnailUrl || svgThumb(title, "tecnologia"),
        storageKey: `local/${meta.mediaId ?? uid()}`,
        createdAt: new Date().toISOString(),
        ...(meta.mediaId ? { mediaId: meta.mediaId } : {}),
      };
      addUserProject(project);
      // Default full-length cut so the editor opens on real playable media.
      const cut = makeFullLengthCut(project.id, {
        title,
        durationSeconds,
        mediaId: meta.mediaId,
      });
      addUserCut(cut);
      return project;
    },
    { method: "POST", body: JSON.stringify({ uploadId }) },
  );
}

export async function listProjects(): Promise<Project[]> {
  return request(`/projects`, () => (isDemoSession() ? mockProjects : readUserData().projects));
}

export async function getProject(id: string): Promise<Project> {
  return request(`/projects/${id}`, () => {
    const found = readUserData().projects.find((p) => p.id === id) ?? mockProjects.find((p) => p.id === id);
    if (!found) throw new Error("Projeto não encontrado");
    return found;
  });
}

export async function deleteProject(id: string): Promise<void> {
  return request(`/projects/${id}`, () => undefined, { method: "DELETE" });
}

export async function getProjectCuts(projectId: string): Promise<Cut[]> {
  return request(`/projects/${projectId}/cuts`, () =>
    (isDemoSession() ? mockCuts : readUserData().cuts).filter((c) => c.projectId === projectId),
  );
}

/** All cuts available to the current session (demo → seed; else the user's own). */
export async function listCuts(): Promise<Cut[]> {
  return request(`/cuts`, () => (isDemoSession() ? mockCuts : readUserData().cuts));
}

export async function getCut(cutId: string): Promise<Cut> {
  // Convenience for the editor: SPEC exposes cuts via project listing + PATCH by id.
  // Reads the current user's own cuts first, then falls back to the demo seed.
  return request(`/cuts/${cutId}`, () => {
    const found = readUserData().cuts.find((c) => c.id === cutId) ?? mockCuts.find((c) => c.id === cutId);
    if (!found) throw new Error("Clipe não encontrado");
    return found;
  });
}

export async function patchCut(cutId: string, patch: Partial<Cut>): Promise<Cut> {
  return request(
    `/cuts/${cutId}`,
    () => {
      // Persist the patch for real (autosave depends on this): user cuts are
      // updated in place; demo/mock cuts just return the merged object.
      const persisted = updateUserCut(cutId, patch);
      if (persisted) return persisted;
      const found = mockCuts.find((c) => c.id === cutId) ?? mockCuts[0];
      return { ...found, ...patch };
    },
    { method: "PATCH", body: JSON.stringify(patch) },
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

// ---------------------------------------------------------------- dashboard / admin

export async function dashboardStats(): Promise<DashboardStats> {
  return request(`/dashboard/stats`, () => (isDemoSession() ? mockDashboardStats : emptyDashboardStats()));
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
