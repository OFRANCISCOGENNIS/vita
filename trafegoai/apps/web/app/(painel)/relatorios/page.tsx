'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api, API_URL } from '@/lib/api';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { relativeTime } from '@/lib/format';

interface Report {
  id: string; name: string; schedule: string; shareToken: string;
  recipients: string[]; lastSentAt: string | null;
  client: { name: string } | null;
}

const SCHEDULE_LABEL: Record<string, string> = { NONE: 'Manual', WEEKLY: 'Semanal', MONTHLY: 'Mensal' };

export default function RelatoriosPage() {
  const reports = useApi<Report[]>(() => api.get('/reports', true), []);
  const [toast, setToast] = useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function send(r: Report) {
    await api.post(`/reports/${r.id}/send`);
    reports.setData((prev) => prev?.map((x) => (x.id === r.id ? { ...x, lastSentAt: new Date().toISOString() } : x)) ?? null);
    notify(`Relatório enviado para ${r.recipients.join(', ') || 'os destinatários'} ✓`);
  }

  async function copyLink(r: Report) {
    const url = `${window.location.origin}/r/${r.shareToken}`;
    await navigator.clipboard.writeText(url);
    notify('Link copiado! O cliente acessa em tempo real, somente leitura.');
  }

  return (
    <div>
      <PageHeader
        title="Relatórios white-label"
        subtitle="Relatórios com a marca da agência, agendamento por e-mail e dashboard compartilhável por link."
      />
      {reports.loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : reports.error ? (
        <ErrorState message={reports.error} onRetry={reports.retry} />
      ) : (reports.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum relatório configurado" hint="Crie relatórios por cliente com a marca da sua agência." />
      ) : (
        <div className="space-y-3">
          {reports.data!.map((r) => (
            <article key={r.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">{r.name}</h2>
                  <Badge tone="accent">{SCHEDULE_LABEL[r.schedule]}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {r.client?.name ?? 'Todos os clientes'} · destinatários: {r.recipients.join(', ') || '—'} · último envio: {relativeTime(r.lastSentAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn-ghost" href={`/r/${r.shareToken}`} target="_blank" rel="noreferrer">Ver dashboard</a>
                <button className="btn-ghost" onClick={() => copyLink(r)}>Copiar link do cliente</button>
                <a className="btn-ghost" href={`${API_URL}/reports/shared/${r.shareToken}`} target="_blank" rel="noreferrer" title="Dados do relatório (para exportar PDF via imprimir)">Exportar</a>
                <button className="btn-primary" onClick={() => send(r)}>Enviar agora</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-xl" role="status">{toast}</div>
      )}
    </div>
  );
}
