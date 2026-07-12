// Client-side transcript cache (IndexedDB), export-safe — same resilient
// pattern as media-store.ts: every function is promisified and degrades
// gracefully (null / no-op) when IndexedDB is unavailable.
//
// A project's speech transcript is expensive to compute (in-browser Whisper),
// so it is cached per projectId and invalidated when the media changes
// (mediaKey = mediaId|mediaUrl) or the schema version bumps.

import type { TranscriptWord } from "./types";

const DB_NAME = "cortaai-transcripts";
const STORE = "transcripts";
const DB_VERSION = 1;
const SCHEMA_VERSION = 1;

export interface StoredTranscript {
  words: TranscriptWord[];
  coverageSeconds: number;
  model: string;
  mediaKey: string;
  createdAt: string;
  version: number;
}

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Media identity used to invalidate a cached transcript when the media changes. */
export function mediaKeyOf(project: { mediaId?: string; mediaUrl?: string }): string {
  return `${project.mediaId ?? ""}|${project.mediaUrl ?? ""}`;
}

/** Read the cached transcript for a project; null when absent/stale. */
export async function getTranscript(projectId: string, mediaKey: string): Promise<StoredTranscript | null> {
  const db = await openDb();
  if (!db) return null;
  const stored = await new Promise<StoredTranscript | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(projectId);
      req.onsuccess = () => {
        const val = req.result as StoredTranscript | undefined;
        resolve(val && Array.isArray(val.words) ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  if (!stored) return null;
  if (stored.version !== SCHEMA_VERSION || stored.mediaKey !== mediaKey) {
    void deleteTranscript(projectId);
    return null;
  }
  return stored;
}

/** Persist a transcript for a project. Resolves even when storage fails. */
export async function saveTranscript(
  projectId: string,
  data: Omit<StoredTranscript, "createdAt" | "version">,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const value: StoredTranscript = { ...data, createdAt: new Date().toISOString(), version: SCHEMA_VERSION };
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Delete a project's cached transcript. No-op when unavailable. */
export async function deleteTranscript(projectId: string): Promise<void> {
  if (!projectId) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
