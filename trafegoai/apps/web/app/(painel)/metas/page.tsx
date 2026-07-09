'use client';

import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { brl, num, ratio } from '@/lib/format';

interface GoalRow {
  id: string; client: string; month: string;
  targets: { roas: number | null; cpa: number | null; budget: number | null };
  current: { spend: number; revenue: number; roas: number; cpa: number; conversions: number };
  progress: { budgetUsedPct: number | null; roasVsTargetPct: number | null };
  forecast: { spend: number; revenue: number; conversions: number; willExceedBudget: boolean | null; willHitRoas: boolean | null };
}

function ProgressBar({ value, danger }: { value: number; danger?: boolean }) {
  const clamped = Math.min(value, 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border/60" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${danger ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export default function MetasPage() {
  const goals = useApi<GoalRow[]>(() => api.get('/goals'), []);
  const month = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div>
      <PageHeader title="Metas & Previsões" subtitle={`Progresso de ${month} e projeção de fim de mês mantendo o ritmo atual.`} />
      {goals.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : goals.error ? (
        <ErrorState message={goals.error} onRetry={goals.retry} />
      ) : (goals.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma meta definida" hint="Defina metas de ROAS, CPA e orçamento mensal por cliente para acompanhar a projeção." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.data!.map((g) => (
            <article key={g.id} className="card">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">{g.client}</h2>
                {g.forecast.willHitRoas !== null && (
                  <Badge tone={g.forecast.willHitRoas ? 'good' : 'bad'}>
                    {g.forecast.willHitRoas ? 'Meta de ROAS no alvo ✓' : 'ROAS abaixo da meta'}
                  </Badge>
                )}
              </div>

              {g.targets.budget !== null && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-ink-2">Orçamento do mês</span>
                    <span className="tnum">{brl(g.current.spend)} / {brl(g.targets.budget)}</span>
                  </div>
                  <ProgressBar value={g.progress.budgetUsedPct ?? 0} danger={Boolean(g.forecast.willExceedBudget)} />
                  {g.forecast.willExceedBudget && (
                    <p className="mt-1 text-xs text-red-400">Projeção: {brl(g.forecast.spend)} — vai estourar o orçamento se mantiver o ritmo.</p>
                  )}
                </div>
              )}

              {g.targets.roas !== null && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-ink-2">ROAS (meta {ratio(g.targets.roas)})</span>
                    <span className="tnum">{ratio(g.current.roas)}</span>
                  </div>
                  <ProgressBar value={g.progress.roasVsTargetPct ?? 0} />
                </div>
              )}

              <dl className="tnum mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center text-sm">
                <div><dt className="text-xs text-muted">Receita projetada</dt><dd className="font-semibold">{brl(g.forecast.revenue)}</dd></div>
                <div><dt className="text-xs text-muted">Gasto projetado</dt><dd className="font-semibold">{brl(g.forecast.spend)}</dd></div>
                <div><dt className="text-xs text-muted">Conversões proj.</dt><dd className="font-semibold">{num(g.forecast.conversions)}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted">CPA atual: {brl(g.current.cpa)}{g.targets.cpa ? ` · meta ${brl(g.targets.cpa)}` : ''}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
