'use client';

/**
 * Cliente HTTP da API. Token JWT vem do store (persistido em localStorage);
 * dados sensíveis nunca trafegam em URL (LGPD) — filtros são apenas ids/datas.
 * Cache leve em memória (TTL 60s) para leituras repetidas do dashboard.
 */
import { useAuthStore } from './store';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 60_000;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { noCache?: boolean }): Promise<T> {
  const method = init?.method ?? 'GET';
  const key = `${method}:${path}`;
  if (method === 'GET' && !init?.noCache) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  }
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new ApiError(401, 'Sessão expirada — faça login novamente');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as any).message?.toString?.() ?? 'Erro inesperado na API');
  }
  const data = (await res.json()) as T;
  if (method === 'GET') cache.set(key, { at: Date.now(), data });
  else cache.clear(); // mutações invalidam o cache de leitura
  return data;
}

export const api = {
  get: <T>(path: string, noCache = false) => request<T>(path, { noCache }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v);
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries as [string, string][]).toString();
}
