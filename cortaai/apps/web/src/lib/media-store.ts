// Client-side media persistence (IndexedDB), export-safe.
//
// Uploaded video files are 100% local — there is no backend at runtime on the
// static GitHub Pages build. We store the raw Blob in IndexedDB under a
// generated `mediaId` so the editor can replay the REAL video across
// tab-switches and full page reloads. Every function is promisified and
// degrades gracefully when IndexedDB is unavailable (SSR/build, private mode,
// quota errors) — callers always get a resolved promise (null / no-op) instead
// of throwing.

const DB_NAME = "cortaai-media";
const STORE = "media";
const DB_VERSION = 1;

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

// In-memory session cache: with App Router SPA navigation this module survives
// from /novo to the editor, so the video stays editable in the CURRENT session
// even when the browser denies IndexedDB (iOS Safari quota/private mode). Tiny
// LRU so a multi-upload session doesn't hold every blob in RAM.
const MEM_CACHE_MAX = 3;
const memCache = new Map<string, Blob>();

function memRemember(id: string, blob: Blob): void {
  memCache.delete(id);
  memCache.set(id, blob);
  while (memCache.size > MEM_CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest === undefined) break;
    memCache.delete(oldest);
  }
}

// Ask the browser (once, best-effort) not to evict our storage — reduces the
// chance of iOS/Android silently dropping the IndexedDB data later.
let persistRequested = false;
function requestPersistence(): void {
  if (persistRequested || typeof navigator === "undefined") return;
  persistRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* older browsers */
  }
}

/** Stored record shape: ArrayBuffer + mime type (Safari is unreliable with raw
 * Blobs in IndexedDB). Older records were stored as Blob — still readable. */
interface StoredMedia {
  buf: ArrayBuffer;
  type: string;
}

/**
 * Persist a media Blob under `id`. Returns TRUE only when the IndexedDB
 * transaction really completed — quota/private-mode failures return false
 * (the blob still stays available in the session memory cache).
 */
export async function saveMedia(id: string, blob: Blob): Promise<boolean> {
  memRemember(id, blob);
  requestPersistence();
  const db = await openDb();
  if (!db) return false;

  let value: StoredMedia;
  try {
    value = { buf: await blob.arrayBuffer(), type: blob.type };
  } catch {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Read a media Blob by `id`, or null if missing/unavailable. */
export async function getMedia(id: string): Promise<Blob | null> {
  const cached = memCache.get(id);
  if (cached) return cached;
  const db = await openDb();
  if (!db) return null;
  return new Promise<Blob | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const val = req.result as Blob | StoredMedia | undefined;
        let blob: Blob | null = null;
        if (val instanceof Blob) {
          blob = val; // legacy record
        } else if (val && val.buf instanceof ArrayBuffer) {
          try {
            blob = new Blob([val.buf], { type: val.type || "video/mp4" });
          } catch {
            blob = null;
          }
        }
        // Re-arm the session cache so the media survives even if the browser
        // evicts the IndexedDB data later in this session.
        if (blob) memRemember(id, blob);
        resolve(blob);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Resolve a media id to a temporary object URL (for a <video src>). Returns
 * null when there is no stored blob. The CALLER owns the URL and must
 * URL.revokeObjectURL() it when done to avoid leaks.
 */
export async function getMediaObjectUrl(id: string): Promise<string | null> {
  const blob = await getMedia(id);
  if (!blob || typeof URL === "undefined" || !URL.createObjectURL) return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** Delete a stored media Blob by `id`. No-op when unavailable. */
export async function deleteMedia(id: string): Promise<void> {
  if (!id) return;
  memCache.delete(id);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------- video probing

export interface VideoProbe {
  durationSeconds: number;
  posterDataUrl: string | null;
}

/**
 * Load a video from a source URL to read its real duration and capture a poster
 * frame (~25% in) as a JPEG data URL. Poster capture needs a readable (same
 * origin / CORS) source — a tainted cross-origin frame is caught and returns
 * null poster while still yielding the duration. Always resolves (never throws);
 * on total failure returns { durationSeconds: 0, posterDataUrl: null }.
 */
export function probeVideoSrc(src: string): Promise<VideoProbe> {
  return new Promise<VideoProbe>((resolve) => {
    if (typeof document === "undefined") {
      resolve({ durationSeconds: 0, posterDataUrl: null });
      return;
    }
    const video = document.createElement("video");
    let settled = false;
    const done = (probe: VideoProbe) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(probe);
    };
    const cleanup = () => {
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };

    // Safety timeout so a stalled network never hangs the upload flow.
    const timer = setTimeout(() => done({ durationSeconds: 0, posterDataUrl: null }), 12000);

    video.preload = "metadata";
    video.muted = true;
    video.setAttribute("playsinline", "");
    // NOTE: no crossOrigin — setting it would break loading on hosts without
    // CORS. Local blob: URLs stay same-origin (poster capture works); a
    // cross-origin remote video still yields its duration, and a tainted canvas
    // simply falls back to a null poster (handled in capture()).

    const capture = (): string | null => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return null;
        const canvas = document.createElement("canvas");
        const maxW = 640;
        const scale = Math.min(1, maxW / w);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.72);
      } catch {
        // Tainted (cross-origin) canvas — poster not available.
        return null;
      }
    };

    const finalize = () => {
      clearTimeout(timer);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const poster = capture();
      done({ durationSeconds: duration > 0 ? duration : 0, posterDataUrl: poster });
    };

    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      const seekTo = d > 0 ? Math.min(d * 0.25, d, 1.5) : 0;
      const afterSeek = () => finalize();
      video.onseeked = afterSeek;
      try {
        video.currentTime = seekTo;
        // If seeking doesn't fire (some codecs), fall back shortly after.
        setTimeout(() => {
          if (!settled) finalize();
        }, 1200);
      } catch {
        finalize();
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      done({ durationSeconds: 0, posterDataUrl: null });
    };

    try {
      video.src = src;
    } catch {
      clearTimeout(timer);
      done({ durationSeconds: 0, posterDataUrl: null });
    }
  });
}

/** Probe a local File (creates + revokes a temporary object URL). */
export async function probeVideoFile(file: File): Promise<VideoProbe> {
  if (typeof URL === "undefined" || !URL.createObjectURL) {
    return { durationSeconds: 0, posterDataUrl: null };
  }
  const url = URL.createObjectURL(file);
  try {
    return await probeVideoSrc(url);
  } finally {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}
