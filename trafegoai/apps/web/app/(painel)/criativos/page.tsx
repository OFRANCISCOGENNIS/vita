'use client';

import { FormEvent, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { brl, pct, ratio, PLATFORM_LABEL } from '@/lib/format';

interface RankedAd {
  id: string; name: string; campaign: string; platform: string;
  ctr: number; cpa: number; roas: number; spend: number;
  creative: { headline: string; primaryText: string | null; imageUrl: string | null } | null;
  fatigue: { fatigued: boolean; ctrDrop: number; freq: number };
}
interface Generated { angles: string[]; creatives: Array<{ id: string; headline: string; primaryText: string; description: string; cta: string; angle: string | null }> }

export default function CriativosPage() {
  const ranking = useApi<RankedAd[]>(() => api.get('/insights/creatives/ranking'), []);
  const [form, setForm] = useState({ platform: 'META', product: '', audience: '', tone: 'confiante e direto' });
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setGenBusy(true);
    setGenError(null);
    try {
      setGenerated(await api.post<Generated>('/creatives/generate', form));
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Falha ao gerar criativos');
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Criativos" subtitle="Ranking por desempenho, detecção de fadiga e gerador de criativos com IA." />

      {/* Gerador com IA */}
      <section className="card mb-6" aria-label="Gerador de criativos com IA">
        <h2 className="mb-3 font-display text-lg font-semibold">✨ Gerar criativos com IA</h2>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={generate}>
          <div>
            <label htmlFor="g-plat" className="mb-1 block text-sm text-ink-2">Plataforma</label>
            <select id="g-plat" className="input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {Object.entries(PLATFORM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="g-prod" className="mb-1 block text-sm text-ink-2">Produto/oferta</label>
            <input id="g-prod" className="input" required value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="Ex.: curso de inglês online" />
          </div>
          <div>
            <label htmlFor="g-pub" className="mb-1 block text-sm text-ink-2">Público-alvo</label>
            <input id="g-pub" className="input" required value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="Ex.: profissionais 25-40 anos" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={genBusy}>{genBusy ? 'Gerando…' : 'Gerar 3 criativos'}</button>
          </div>
        </form>
        {genError && <p role="alert" className="mt-3 text-sm text-red-400">{genError}</p>}
        {generated && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {generated.creatives.map((c, i) => (
              <div key={c.id ?? i} className="rounded-lg border border-border bg-bg p-3">
                <Badge tone="accent">{generated.angles[i] ?? 'Ângulo'}</Badge>
                <p className="mt-2 font-medium">{c.headline}</p>
                <p className="mt-1 text-sm text-ink-2">{c.primaryText}</p>
                <p className="mt-1 text-xs text-muted">{c.description}</p>
                <p className="mt-2"><Badge>CTA: {c.cta.replace(/_/g, ' ')}</Badge></p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ranking */}
      <h2 className="mb-3 font-display text-lg font-semibold">🏁 Ranking de anúncios (últimos 90 dias)</h2>
      {ranking.loading ? (
        <Skeleton className="h-64" />
      ) : ranking.error ? (
        <ErrorState message={ranking.error} onRetry={ranking.retry} />
      ) : (ranking.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum anúncio encontrado" hint="Conecte uma conta com campanhas ativas para ver o ranking." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ranking.data!.map((ad, idx) => (
            <article key={ad.id} className={`card ${ad.fatigue.fatigued ? 'border-yellow-500/40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">#{idx + 1} · {PLATFORM_LABEL[ad.platform]}</p>
                  <h3 className="mt-0.5 truncate font-medium" title={ad.name}>{ad.name}</h3>
                  <p className="truncate text-xs text-muted" title={ad.campaign}>{ad.campaign}</p>
                </div>
                {ad.fatigue.fatigued && <Badge tone="warn">😴 Fadiga</Badge>}
              </div>
              {/* Preview do criativo */}
              <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                <p className="text-sm font-medium">{ad.creative?.headline ?? 'Sem criativo vinculado'}</p>
                {ad.creative?.primaryText && <p className="mt-1 line-clamp-2 text-xs text-ink-2">{ad.creative.primaryText}</p>}
              </div>
              <dl className="tnum mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div><dt className="text-xs text-muted">ROAS</dt><dd className="font-semibold">{ratio(ad.roas)}</dd></div>
                <div><dt className="text-xs text-muted">CTR</dt><dd className="font-semibold">{pct(ad.ctr)}</dd></div>
                <div><dt className="text-xs text-muted">CPA</dt><dd className="font-semibold">{brl(ad.cpa)}</dd></div>
              </dl>
              {ad.fatigue.fatigued && (
                <p className="mt-2 text-xs text-yellow-500">CTR caiu {pct(ad.fatigue.ctrDrop)} e frequência chegou a {ad.fatigue.freq.toFixed(1)} — troque o criativo.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
