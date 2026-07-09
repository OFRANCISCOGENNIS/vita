'use client';

/**
 * Dashboard compartilhável do cliente — somente leitura, sem login.
 * Acessado pelo shareToken do relatório; renderiza com a marca da agência
 * (white-label). Nenhum dado sensível/token é exposto aqui.
 */
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import { PlatformDonut, SpendRevenueChart } from '@/components/charts';
import { brl, num, pct, ratio, PLATFORM_LABEL } from '@/lib/format';

interface SharedData {
  name: string;
  client?: string;
  brand: { logoUrl?: string | null; color?: string | null; agency?: string };
  summary: { totals: Record<string, number>; change: Record<string, number | null> };
  timeseries: Array<{ date: string; spend: number; revenue: number }>;
  platformSplit: Array<{ platform: string; spend: number }>;
  error?: string;
}

export default function SharedReportPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/reports/shared/${params.token}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('Não foi possível carregar o relatório.'));
  }, [params.token]);

  if (error) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-ink-2">{error}</main>;
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-72" />
      </main>
    );
  }

  const t = data.summary.totals;
  const kpis: Array<[string, string]> = [
    ['Investimento', brl(t.spend)], ['Receita', brl(t.revenue)], ['ROAS', ratio(t.roas)],
    ['CPA', brl(t.cpa)], ['CTR', pct(t.ctr)], ['Conversões', num(t.conversions)],
  ];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-8 flex items-center justify-between border-b border-border pb-5" style={{ borderColor: data.brand.color ?? undefined }}>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{data.brand.agency ?? 'Relatório de mídia'}</p>
          <h1 className="font-display text-2xl font-bold">{data.name}</h1>
          {data.client && <p className="text-sm text-muted">Cliente: {data.client} · últimos 30 dias · atualizado em tempo real</p>}
        </div>
        <span className="rounded-full px-3 py-1 text-xs text-white" style={{ background: data.brand.color ?? '#6366f1' }}>somente leitura</span>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(([label, value]) => (
          <div key={label} className="card !p-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="tnum mt-1 font-display text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink-2">Evolução: investimento × receita</h2>
          <SpendRevenueChart data={data.timeseries} />
        </div>
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-ink-2">Verba por plataforma</h2>
          <PlatformDonut data={data.platformSplit} />
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold text-ink-2">Resumo por plataforma</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-3 font-medium">Plataforma</th>
              <th className="py-2 pr-3 font-medium">Investimento</th>
              <th className="py-2 pr-3 font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {data.platformSplit.map((p: any) => (
              <tr key={p.platform} className="border-b border-border/50">
                <td className="py-2 pr-3">{PLATFORM_LABEL[p.platform]}</td>
                <td className="tnum py-2 pr-3">{brl(p.spend)}</td>
                <td className="tnum py-2 pr-3">{ratio(p.roas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-8 text-center text-xs text-muted">
        Gerado por {data.brand.agency ?? 'TrafegoAI'} · use Ctrl/Cmd+P para exportar em PDF
      </footer>
    </main>
  );
}
