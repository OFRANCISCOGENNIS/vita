'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Badge, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';

interface Rec {
  id: string; type: string; title: string; why: string; impactEstimate: string;
  priority: number; status: 'OPEN' | 'APPLIED' | 'DISMISSED' | 'UNDONE';
}

const TYPE_LABEL: Record<string, string> = {
  REALLOCATE_BUDGET: '💸 Realocar verba',
  PAUSE_ADSET: '⏸️ Pausar',
  SCALE_CAMPAIGN: '📈 Escalar',
  SWAP_CREATIVE: '🎨 Trocar criativo',
  ADJUST_SCHEDULE: '🕑 Ajustar horários',
};

export default function RecomendacoesPage() {
  const diag = useApi<{ source: string; markdown: string }>(() => api.get('/insights/diagnostics'), []);
  const recs = useApi<Rec[]>(() => api.get('/insights/recommendations'), []);
  const [confirm, setConfirm] = useState<Rec | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.post(`/insights/recommendations/${confirm.id}/apply`);
      recs.setData((prev) => prev?.map((r) => (r.id === confirm.id ? { ...r, status: 'APPLIED' } : r)) ?? null);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function undo(rec: Rec) {
    await api.post(`/insights/recommendations/${rec.id}/undo`);
    recs.setData((prev) => prev?.map((r) => (r.id === rec.id ? { ...r, status: 'UNDONE' } : r)) ?? null);
  }

  async function dismiss(rec: Rec) {
    await api.post(`/insights/recommendations/${rec.id}/dismiss`);
    recs.setData((prev) => prev?.filter((r) => r.id !== rec.id) ?? null);
  }

  return (
    <div>
      <PageHeader
        title="Recomendações da IA"
        subtitle="Seu gestor de tráfego virtual: diagnóstico automático e ações priorizadas por impacto."
      />

      {/* Diagnóstico */}
      <section className="card mb-6" aria-label="Diagnóstico automático">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold">🩺 Diagnóstico automático</h2>
          {diag.data && <Badge tone="accent">{diag.data.source === 'llm' ? 'IA generativa' : 'modo demonstração'}</Badge>}
        </div>
        {diag.loading ? (
          <Skeleton className="h-40" />
        ) : diag.error ? (
          <ErrorState message={diag.error} onRetry={diag.retry} />
        ) : (
          <div className="space-y-1 text-sm leading-relaxed text-ink-2">
            {diag.data!.markdown.split('\n').map((line, i) =>
              line.startsWith('## ') ? (
                <h3 key={i} className="pt-3 font-display text-base font-semibold text-ink">{line.slice(3)}</h3>
              ) : line.startsWith('- ') ? (
                <p key={i} className="pl-4" dangerouslySetInnerHTML={{ __html: '• ' + line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              ) : line ? (
                <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              ) : null,
            )}
          </div>
        )}
      </section>

      {/* Recomendações */}
      {recs.loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : recs.error ? (
        <ErrorState message={recs.error} onRetry={recs.retry} />
      ) : (recs.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma recomendação pendente" hint="A IA reavalia suas contas a cada sincronização. Volte em breve!" />
      ) : (
        <div className="space-y-3">
          {recs.data!.map((rec) => (
            <article key={rec.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">#{rec.priority}</Badge>
                    <Badge>{TYPE_LABEL[rec.type] ?? rec.type}</Badge>
                    {rec.status === 'APPLIED' && <Badge tone="good">Aplicada ✓</Badge>}
                    {rec.status === 'UNDONE' && <Badge tone="warn">Desfeita</Badge>}
                  </div>
                  <h3 className="mt-2 font-medium">{rec.title}</h3>
                  <p className="mt-1 text-sm text-ink-2"><strong className="text-ink">Por quê:</strong> {rec.why}</p>
                  <p className="mt-1 text-sm text-green-400">Ganho estimado: {rec.impactEstimate}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {rec.status === 'OPEN' && (
                    <>
                      <button className="btn-primary" onClick={() => setConfirm(rec)}>Aplicar</button>
                      <button className="btn-ghost" onClick={() => dismiss(rec)}>Dispensar</button>
                    </>
                  )}
                  {rec.status === 'APPLIED' && (
                    <button className="btn-ghost" onClick={() => undo(rec)}>Desfazer</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open
          busy={busy}
          title="Aplicar recomendação?"
          description={`"${confirm.title}". A ação será executada via API oficial da plataforma e registrada no log de auditoria. Você poderá desfazer em seguida.`}
          confirmLabel="Aplicar agora"
          onConfirm={apply}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
