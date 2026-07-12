'use client';

import { useApi } from '@/lib/useApi';
import { api, qs } from '@/lib/api';
import { useFilterStore } from '@/lib/store';
import { FilterBar } from '@/components/FilterBar';
import { Onboarding } from '@/components/Onboarding';
import { Badge, ErrorState, PageHeader, Skeleton, Trend } from '@/components/ui';
import { FunnelChart, Heatmap, PlatformDonut, SpendRevenueChart } from '@/components/charts';
import { brl, num, pct, ratio, PLATFORM_LABEL } from '@/lib/format';

interface Summary {
  totals: Record<string, number>;
  change: Record<string, number | null>;
}
interface Highlight { id: string; name: string; platform: string; roas: number; spend: number; wasted?: number; hint?: string }

const KPIS: Array<{ key: string; label: string; fmt: (v: number) => string; invert?: boolean }> = [
  { key: 'spend', label: 'Investimento', fmt: brl, invert: true },
  { key: 'revenue', label: 'Receita', fmt: brl },
  { key: 'roas', label: 'ROAS', fmt: ratio },
  { key: 'roi', label: 'ROI', fmt: (v) => pct(v) },
  { key: 'cpa', label: 'CPA', fmt: brl, invert: true },
  { key: 'cpc', label: 'CPC', fmt: brl, invert: true },
  { key: 'cpm', label: 'CPM', fmt: brl, invert: true },
  { key: 'ctr', label: 'CTR', fmt: (v) => pct(v) },
  { key: 'convRate', label: 'Tx. conversão', fmt: (v) => pct(v) },
  { key: 'impressions', label: 'Impressões', fmt: num },
  { key: 'clicks', label: 'Cliques', fmt: num },
  { key: 'conversions', label: 'Conversões', fmt: num },
];

export default function DashboardPage() {
  const f = useFilterStore();
  const query = qs(f.toQuery());
  const deps = [query];

  const summary = useApi<Summary>(() => api.get(`/dashboard/summary${query}`), deps);
  const series = useApi<Array<{ date: string; spend: number; revenue: number }>>(() => api.get(`/dashboard/timeseries${query}`), deps);
  const funnel = useApi<Array<{ stage: string; value: number }>>(() => api.get(`/dashboard/funnel${query}`), deps);
  const split = useApi<Array<{ platform: string; spend: number }>>(() => api.get(`/dashboard/platform-split${query}`), deps);
  const heat = useApi<Array<{ dayOfWeek: number; hour: number; conversions: number; cpa: number | null }>>(() => api.get(`/dashboard/heatmap${query}`), deps);
  const highlights = useApi<{ best: Highlight | null; worst: Highlight | null; waste: (Highlight & { wasted: number }) | null; opportunity: Highlight | null }>(
    () => api.get(`/dashboard/highlights${query}`), deps,
  );
  const anomalies = useApi<Array<{ id: string; severity: string; message: string }>>(() => api.get('/insights/anomalies'), []);

  return (
    <div>
      <PageHeader title="Dashboard unificado" subtitle="Google + Meta + TikTok consolidados, com comparação vs. período anterior." />
      <Onboarding />
      <FilterBar />

      {/* Alertas de anomalias */}
      {(anomalies.data ?? []).length > 0 && (
        <div className="mb-6 space-y-2" aria-label="Alertas">
          {anomalies.data!.slice(0, 3).map((a) => (
            <div key={a.id} className={`card flex items-center gap-3 !py-2.5 text-sm ${a.severity === 'CRITICAL' ? 'border-red-500/40' : 'border-yellow-500/30'}`} role="alert">
              <Badge tone={a.severity === 'CRITICAL' ? 'bad' : 'warn'}>{a.severity === 'CRITICAL' ? '🔴 Crítico' : '🟡 Atenção'}</Badge>
              <span className="text-ink-2">{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.retry} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {KPIS.map((k) =>
            summary.loading ? (
              <Skeleton key={k.key} className="h-[86px]" />
            ) : (
              <div key={k.key} className="card !p-3">
                <p className="text-xs text-muted">{k.label}</p>
                <p className="tnum mt-1 font-display text-xl font-bold">{k.fmt(summary.data!.totals[k.key] ?? 0)}</p>
                <Trend value={summary.data!.change[k.key] ?? null} invert={k.invert} />
              </div>
            ),
          )}
        </div>
      )}

      {/* Cards de destaque */}
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {highlights.loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : highlights.error ? (
          <div className="md:col-span-2 xl:col-span-4"><ErrorState message={highlights.error} onRetry={highlights.retry} /></div>
        ) : (
          [
            { label: '🏆 Melhor campanha', h: highlights.data!.best, detail: (h: Highlight) => `ROAS ${ratio(h.roas)}` },
            { label: '📉 Pior campanha', h: highlights.data!.worst, detail: (h: Highlight) => `ROAS ${ratio(h.roas)}` },
            { label: '🔥 Maior desperdício', h: highlights.data!.waste, detail: (h: any) => `${brl(h.wasted)} sem retorno` },
            { label: '💡 Oportunidade do dia', h: highlights.data!.opportunity, detail: (h: Highlight) => h.hint ?? '' },
          ].map(({ label, h, detail }) => (
            <div key={label} className="card">
              <p className="text-xs text-muted">{label}</p>
              {h ? (
                <>
                  <p className="mt-1 truncate font-medium" title={h.name}>{h.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{PLATFORM_LABEL[h.platform]}</p>
                  <p className="mt-1 text-sm text-ink-2">{detail(h)}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Sem dados no período</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Gráficos */}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink-2">Evolução: investimento × receita</h2>
          {series.loading ? <Skeleton className="h-[280px]" /> : series.error ? <ErrorState message={series.error} onRetry={series.retry} /> : <SpendRevenueChart data={series.data!} />}
        </div>
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-ink-2">Verba por plataforma</h2>
          {split.loading ? <Skeleton className="h-[220px]" /> : split.error ? <ErrorState message={split.error} onRetry={split.retry} /> : <PlatformDonut data={split.data!} />}
        </div>
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-ink-2">Funil do período</h2>
          {funnel.loading ? <Skeleton className="h-[280px]" /> : funnel.error ? <ErrorState message={funnel.error} onRetry={funnel.retry} /> : <FunnelChart data={funnel.data!} />}
        </div>
        <div className="card xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink-2">Melhores horários (conversões por dia × hora)</h2>
          {heat.loading ? <Skeleton className="h-[200px]" /> : heat.error ? <ErrorState message={heat.error} onRetry={heat.retry} /> : <Heatmap data={heat.data!} />}
        </div>
      </div>
    </div>
  );
}
