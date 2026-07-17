'use client';

import { FormEvent, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Badge, ErrorState, PageHeader, Skeleton } from '@/components/ui';

interface Window { platform: string; days: string; windows: string[]; notes: string }
interface PlatformPlan { platform: string; title: string; hashtags: string[]; bestTime: string; formatTip: string; paidTip: string | null }
interface Plan { verdict: string; hookSuggestions: string[]; perPlatform: PlatformPlan[] }

const SOCIAL_LABEL: Record<string, string> = { TIKTOK: 'TikTok', REELS: 'Instagram Reels', SHORTS: 'YouTube Shorts', YOUTUBE: 'YouTube' };
const SOCIAL_ICON: Record<string, string> = { TIKTOK: '🎵', REELS: '📸', SHORTS: '▶️', YOUTUBE: '🎥' };

export default function PlannerPage() {
  const windows = useApi<Window[]>(() => api.get('/radar/posting-windows'), []);
  const [form, setForm] = useState({ title: '', description: '', niche: '', goal: 'VIEWS' });
  const [plan, setPlan] = useState<{ source: string; plan: Plan } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setPlan(await api.post('/radar/analyze-post', form));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao analisar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Planejador de Postagem"
        subtitle="Como postar seus vídeos em cada rede: melhores horários, formato certo e análise do post pela IA antes de subir."
      />

      {/* Analisador com IA */}
      <section className="card mb-6" aria-label="Analisar meu vídeo">
        <h2 className="mb-3 font-display text-lg font-semibold">🧠 Analisar meu vídeo antes de postar</h2>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={analyze}>
          <div className="md:col-span-2">
            <label htmlFor="pl-titulo" className="mb-1 block text-sm text-ink-2">Título/ideia do vídeo</label>
            <input id="pl-titulo" className="input" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder='Ex.: "Testei a rotina de treino do Cbum por 30 dias"' />
          </div>
          <div>
            <label htmlFor="pl-nicho" className="mb-1 block text-sm text-ink-2">Nicho</label>
            <input id="pl-nicho" className="input" required value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="fitness, beleza, finanças…" />
          </div>
          <div>
            <label htmlFor="pl-obj" className="mb-1 block text-sm text-ink-2">Objetivo</label>
            <select id="pl-obj" className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
              <option value="VIEWS">Views / alcance</option>
              <option value="SEGUIDORES">Seguidores</option>
              <option value="VENDAS">Vendas</option>
              <option value="LEADS">Leads</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label htmlFor="pl-desc" className="mb-1 block text-sm text-ink-2">Descrição/roteiro (opcional)</label>
            <input id="pl-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Resumo do que acontece no vídeo" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Analisando…' : 'Analisar com IA'}</button>
          </div>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}

        {plan && (
          <div className="mt-5 space-y-4 border-t border-border pt-4">
            <div className="flex items-start gap-2">
              <Badge tone="accent">{plan.source === 'llm' ? 'IA generativa' : 'modo demonstração'}</Badge>
              <p className="text-sm text-ink-2"><strong className="text-ink">Veredito:</strong> {plan.plan.verdict}</p>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink-2">Ganchos sugeridos (3 primeiros segundos)</h3>
              <ul className="space-y-1 text-sm text-ink-2">
                {plan.plan.hookSuggestions.map((h, i) => <li key={i}>🪝 {h}</li>)}
              </ul>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {plan.plan.perPlatform.map((p) => (
                <div key={p.platform} className="rounded-lg border border-border bg-bg p-3">
                  <p className="font-medium">{SOCIAL_ICON[p.platform]} {SOCIAL_LABEL[p.platform] ?? p.platform}</p>
                  <p className="mt-2 text-sm text-ink-2"><strong className="text-ink">Título:</strong> {p.title}</p>
                  <p className="mt-1 text-xs text-muted">{p.hashtags.join(' ')}</p>
                  <p className="mt-2 text-xs text-ink-2">🕑 {p.bestTime}</p>
                  <p className="mt-1 text-xs text-ink-2">🎬 {p.formatTip}</p>
                  {p.paidTip && <p className="mt-2 rounded bg-accent/10 px-2 py-1 text-xs text-ink-2">💸 Tráfego pago: {p.paidTip}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Janelas de postagem por rede */}
      <h2 className="mb-3 font-display text-lg font-semibold">🕑 Melhores janelas de postagem por rede</h2>
      {windows.loading ? (
        <Skeleton className="h-40" />
      ) : windows.error ? (
        <ErrorState message={windows.error} onRetry={windows.retry} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {windows.data!.map((w) => (
            <article key={w.platform} className="card">
              <p className="font-medium">{SOCIAL_ICON[w.platform]} {SOCIAL_LABEL[w.platform] ?? w.platform}</p>
              <p className="mt-2 text-sm text-ink-2"><strong className="text-ink">{w.days}</strong></p>
              <p className="mt-1 flex flex-wrap gap-1">
                {w.windows.map((win) => <Badge key={win} tone="accent">{win}</Badge>)}
              </p>
              <p className="mt-3 border-t border-border pt-2 text-xs text-ink-2">{w.notes}</p>
            </article>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Dica: o mapa de calor do Dashboard mostra os horários que mais convertem nas SUAS contas de anúncio — combine as duas visões: poste orgânico nas janelas acima e concentre lances pagos nos horários do seu heatmap.
      </p>
    </div>
  );
}
