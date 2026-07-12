// Conexão com um backend REAL hospedado pelo dono (Render/Railway/VPS).
//
// O site estático (GitHub Pages) funciona 100% em modo demonstração; quando o
// usuário hospeda a API (cortaai/apps/api) e cola a URL em Configurações, o
// client passa a falar com ela — sem rebuild. A URL fica em localStorage.

const KEY = "cortaai-backend-url";

/** Normaliza a URL colada: adiciona https://, remove barras e /api/v1 finais. */
export function normalizeBackendUrl(input: string): string | null {
  let url = input.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, "").replace(/\/api\/v1$/i, "").replace(/\/+$/, "");
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

export function getBackendUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setBackendUrl(url: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, url);
  } catch {
    /* private mode */
  }
}

export function clearBackendUrl(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Testa a saúde do backend (GET /healthz) com timeout curto. */
export async function testBackend(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${url}/healthz`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    return body?.status === "ok";
  } catch {
    return false;
  }
}
