// Per-user data isolation (client-side, export-safe).
//
// The rich seed/mock data must ONLY be shown to the demo account
// (criador@cortaai.com.br). Every other real user — Google or otherwise,
// including admins on their personal panel — starts EMPTY and only ever sees
// what they create in-session, persisted per-user in localStorage.
//
// api.ts consults these helpers in its data getters so all consuming pages are
// corrected at once.

import type { Cut, Generation, Project } from "./types";

export const DEMO_EMAIL = "criador@cortaai.com.br";

interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** Reads the logged-in user from the persisted auth session (zustand persist). */
export function currentUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("cortaai-session");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { user?: SessionUser | null } };
    const u = parsed?.state?.user;
    return u && u.email ? { id: u.id, email: u.email, name: u.name } : null;
  } catch {
    return null;
  }
}

/**
 * Whether the current session should see the seed/demo data. Only the demo
 * account does. A missing session (SSR/build, or the marketing site) also
 * counts as demo so the product stays explorable; /app is auth-guarded anyway.
 */
export function isDemoSession(): boolean {
  const u = currentUser();
  if (!u) return true;
  return u.email.trim().toLowerCase() === DEMO_EMAIL;
}

// ---------------------------------------------------------------- per-user store

interface UserData {
  projects: Project[];
  cuts: Cut[];
  generations: Generation[];
}

const EMPTY_USER_DATA: UserData = { projects: [], cuts: [], generations: [] };

function storageKey(email: string): string {
  return `cortaai-userdata:${email.trim().toLowerCase()}`;
}

export function readUserData(): UserData {
  const u = currentUser();
  if (!u || typeof window === "undefined") return { ...EMPTY_USER_DATA };
  try {
    const raw = window.localStorage.getItem(storageKey(u.email));
    if (!raw) return { ...EMPTY_USER_DATA };
    const parsed = JSON.parse(raw) as Partial<UserData>;
    return {
      projects: parsed.projects ?? [],
      cuts: parsed.cuts ?? [],
      generations: parsed.generations ?? [],
    };
  } catch {
    return { ...EMPTY_USER_DATA };
  }
}

function writeUserData(data: UserData): void {
  const u = currentUser();
  if (!u || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(u.email), JSON.stringify(data));
  } catch {
    /* quota / private mode — ignore, session stays in-memory */
  }
}

/** Persist a newly-created project for the current (non-demo) user. */
export function addUserProject(project: Project): void {
  if (isDemoSession()) return;
  const data = readUserData();
  writeUserData({ ...data, projects: [project, ...data.projects.filter((p) => p.id !== project.id)] });
}

/** Persist a newly-created cut for the current (non-demo) user. */
export function addUserCut(cut: Cut): void {
  if (isDemoSession()) return;
  const data = readUserData();
  writeUserData({ ...data, cuts: [cut, ...data.cuts.filter((c) => c.id !== cut.id)] });
}

/**
 * Merge a patch into a stored user cut (autosave do editor). Returns the
 * updated cut, or null when the cut isn't in the user's storage (demo/mock).
 */
export function updateUserCut(cutId: string, patch: Partial<Cut>): Cut | null {
  if (isDemoSession()) return null;
  const data = readUserData();
  const existing = data.cuts.find((c) => c.id === cutId);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  writeUserData({ ...data, cuts: data.cuts.map((c) => (c.id === cutId ? updated : c)) });
  return updated;
}

/** Persist a newly-created studio generation for the current (non-demo) user. */
export function addUserGeneration(generation: Generation): void {
  if (isDemoSession()) return;
  const data = readUserData();
  writeUserData({ ...data, generations: [generation, ...data.generations.filter((g) => g.id !== generation.id)] });
}

/**
 * Remove a user project and its cuts from storage. Returns the media ids that
 * were referenced (project + cuts) so the caller can free the IndexedDB blobs.
 * No-op for the demo session (its data is seed-only).
 */
export function deleteUserProject(projectId: string): string[] {
  if (isDemoSession()) return [];
  const data = readUserData();
  const mediaIds = new Set<string>();
  data.projects.forEach((p) => {
    if (p.id === projectId && p.mediaId) mediaIds.add(p.mediaId);
  });
  data.cuts.forEach((c) => {
    if (c.projectId === projectId && c.mediaId) mediaIds.add(c.mediaId);
  });
  writeUserData({
    ...data,
    projects: data.projects.filter((p) => p.id !== projectId),
    cuts: data.cuts.filter((c) => c.projectId !== projectId),
  });
  return Array.from(mediaIds);
}
