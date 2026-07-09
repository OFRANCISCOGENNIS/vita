/** Cálculo das métricas derivadas a partir dos agregados brutos normalizados. */

export interface RawTotals {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface DerivedTotals extends RawTotals {
  roas: number;
  roi: number;
  cpa: number;
  cpc: number;
  cpm: number;
  ctr: number; // %
  convRate: number; // %
}

export function derive(t: RawTotals): DerivedTotals {
  const safe = (num: number, den: number) => (den > 0 ? num / den : 0);
  return {
    ...t,
    roas: round(safe(t.revenue, t.spend), 2),
    roi: round(safe(t.revenue - t.spend, t.spend) * 100, 1),
    cpa: round(safe(t.spend, t.conversions), 2),
    cpc: round(safe(t.spend, t.clicks), 2),
    cpm: round(safe(t.spend, t.impressions) * 1000, 2),
    ctr: round(safe(t.clicks, t.impressions) * 100, 2),
    convRate: round(safe(t.conversions, t.clicks) * 100, 2),
  };
}

export function emptyTotals(): RawTotals {
  return { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
}

export function addInto(acc: RawTotals, row: { spend: any; revenue: any; impressions: number; clicks: number; conversions: number }) {
  acc.spend += Number(row.spend);
  acc.revenue += Number(row.revenue);
  acc.impressions += row.impressions;
  acc.clicks += row.clicks;
  acc.conversions += row.conversions;
}

export function round(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** Variação percentual vs. período anterior (null quando não há base). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}

/** Resolve período {from,to} + período anterior equivalente. */
export function resolvePeriod(preset?: string, fromStr?: string, toStr?: string) {
  const to = toStr ? new Date(`${toStr}T00:00:00Z`) : startOfTodayUtc();
  let from: Date;
  if (fromStr) {
    from = new Date(`${fromStr}T00:00:00Z`);
  } else {
    const days = preset === 'today' ? 0 : preset === '7d' ? 6 : 29; // default 30d
    from = new Date(to.getTime() - days * 86_400_000);
  }
  const spanMs = to.getTime() - from.getTime() + 86_400_000;
  return {
    from, to,
    prevFrom: new Date(from.getTime() - spanMs),
    prevTo: new Date(from.getTime() - 86_400_000),
  };
}

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
