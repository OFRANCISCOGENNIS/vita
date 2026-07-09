'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { relativeTime, PLATFORM_LABEL, PLATFORM_VAR } from '@/lib/format';

interface Connection {
  id: string; platform: 'GOOGLE' | 'META' | 'TIKTOK'; externalId: string; name: string;
  client: string | null; status: 'ACTIVE' | 'EXPIRED' | 'ERROR'; statusDetail: string | null;
  lastSyncAt: string | null; currency: string;
}

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  ACTIVE: { label: 'Ativa', tone: 'good' },
  EXPIRED: { label: 'Expirada', tone: 'warn' },
  ERROR: { label: 'Com erro', tone: 'bad' },
};

export default function ConexoesPage() {
  const conns = useApi<Connection[]>(() => api.get('/connections', true), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function connect(platform: string) {
    const { authUrl } = await api.post<{ authUrl: string }>(`/connections/${platform.toLowerCase()}/connect`);
    if (authUrl.startsWith('/conexoes/mock-oauth')) {
      notify('Modo demo: configure as credenciais de API no .env para o OAuth real (ver README).');
    } else {
      window.location.href = authUrl; // fluxo OAuth oficial da plataforma
    }
  }

  async function syncNow(c: Connection) {
    setBusyId(c.id);
    try {
      await api.post(`/connections/${c.id}/sync`);
      notify(`Sincronização de "${c.name}" enfileirada ✓`);
    } finally {
      setBusyId(null);
    }
  }

  async function reauth(c: Connection) {
    setBusyId(c.id);
    try {
      await api.post(`/connections/${c.id}/reauth`);
      conns.setData((prev) => prev?.map((x) => (x.id === c.id ? { ...x, status: 'ACTIVE', statusDetail: null } : x)) ?? null);
      notify('Conexão reautenticada ✓');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Conexões"
        subtitle="Contas de anúncio conectadas via OAuth oficial. Tokens criptografados em repouso (LGPD)."
        actions={
          <div className="flex gap-2">
            {(['GOOGLE', 'META', 'TIKTOK'] as const).map((p) => (
              <button key={p} className="btn-ghost" onClick={() => connect(p)}>
                <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_VAR[p] }} aria-hidden />
                + {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        }
      />
      {conns.loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : conns.error ? (
        <ErrorState message={conns.error} onRetry={conns.retry} />
      ) : (conns.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma conta conectada" hint="Conecte sua primeira conta do Google Ads, Meta Ads ou TikTok Ads para começar." />
      ) : (
        <div className="space-y-3">
          {conns.data!.map((c) => (
            <article key={c.id} className={`card flex flex-wrap items-center justify-between gap-3 ${c.status !== 'ACTIVE' ? 'border-yellow-500/40' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: PLATFORM_VAR[c.platform] }} aria-hidden>
                  {c.platform === 'GOOGLE' ? 'G' : c.platform === 'META' ? 'M' : 'T'}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{c.name}</h2>
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {PLATFORM_LABEL[c.platform]} · {c.externalId} {c.client ? `· cliente: ${c.client}` : ''} · última atualização: {relativeTime(c.lastSyncAt)}
                  </p>
                  {c.statusDetail && <p className="mt-0.5 text-xs text-yellow-500">{c.statusDetail}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                {c.status !== 'ACTIVE' && (
                  <button className="btn-primary" onClick={() => reauth(c)} disabled={busyId === c.id}>
                    {busyId === c.id ? 'Aguarde…' : 'Reautenticar'}
                  </button>
                )}
                <button className="btn-ghost" onClick={() => syncNow(c)} disabled={busyId === c.id}>
                  {busyId === c.id ? 'Enviando…' : '↻ Sincronizar agora'}
                </button>
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
