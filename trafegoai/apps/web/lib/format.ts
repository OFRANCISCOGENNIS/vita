export const brl = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v >= 1000 ? 0 : 2 });

export const num = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR');

export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;

export const ratio = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export const PLATFORM_LABEL: Record<string, string> = {
  GOOGLE: 'Google Ads',
  META: 'Meta Ads',
  TIKTOK: 'TikTok Ads',
};

export const PLATFORM_VAR: Record<string, string> = {
  GOOGLE: 'var(--series-google)',
  META: 'var(--series-meta)',
  TIKTOK: 'var(--series-tiktok)',
};

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)} dia(s)`;
}
