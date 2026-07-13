// BIBLIOTECA DE PROJETOS do Estúdio — CRUD em localStorage. Cada entrada
// guarda o projeto serializado + metadados das fontes (os blobs ficam no
// IndexedDB via media-store, referenciados por mediaId).

import type { Project } from "./model";
import type { MediaSource } from "./media-registry";

const INDEX_KEY = "cortaai-studio-projects";
const CURRENT_KEY = "cortaai-studio-current";

export interface StudioProjectEntry {
  id: string;
  name: string;
  updatedAt: number;
  durationMs: number;
  project: unknown; // Project serializado (validado no load)
  sources: MediaSource[];
}

function readIndex(): StudioProjectEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as StudioProjectEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(list: StudioProjectEntry[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    // quota: remove o mais antigo e tenta de novo (best-effort)
    try {
      const trimmed = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.max(1, list.length - 1));
      localStorage.setItem(INDEX_KEY, JSON.stringify(trimmed));
    } catch {
      /* desiste silenciosamente */
    }
  }
}

/** Lista os projetos, mais recentes primeiro. */
export function listProjects(): StudioProjectEntry[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProjectEntry(id: string): StudioProjectEntry | null {
  return readIndex().find((e) => e.id === id) ?? null;
}

/** Salva (upsert) o estado atual de um projeto. */
export function saveProjectEntry(project: Project, sources: MediaSource[], durationMs: number): void {
  const list = readIndex();
  const entry: StudioProjectEntry = {
    id: project.id,
    name: project.name,
    updatedAt: Date.now(),
    durationMs,
    project,
    sources,
  };
  const i = list.findIndex((e) => e.id === project.id);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  writeIndex(list);
}

export function deleteProjectEntry(id: string): void {
  writeIndex(readIndex().filter((e) => e.id !== id));
  if (getCurrentProjectId() === id) setCurrentProjectId(null);
}

export function duplicateProjectEntry(id: string, newId: string, newName: string): StudioProjectEntry | null {
  const src = getProjectEntry(id);
  if (!src) return null;
  const project = JSON.parse(JSON.stringify(src.project)) as { id?: string; name?: string };
  project.id = newId;
  project.name = newName;
  const entry: StudioProjectEntry = { ...src, id: newId, name: newName, updatedAt: Date.now(), project };
  writeIndex([...readIndex(), entry]);
  return entry;
}

export function getCurrentProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_KEY);
}

export function setCurrentProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* ignore */
  }
}
