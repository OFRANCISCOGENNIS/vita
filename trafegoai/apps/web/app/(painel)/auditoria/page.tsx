'use client';

import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { relativeTime } from '@/lib/format';

interface Log {
  id: string; action: string; targetType: string; targetId: string;
  before: unknown; after: unknown; createdAt: string;
  user: { name: string; email: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  CAMPAIGN_PAUSED: '⏸️ Campanha pausada',
  CAMPAIGN_ACTIVATED: '▶️ Campanha ativada',
  CAMPAIGN_DUPLICATED: '📋 Campanha duplicada',
  BUDGET_CHANGED: '💰 Orçamento alterado',
  RECOMMENDATION_APPLIED: '🤖 Recomendação aplicada',
  RECOMMENDATION_UNDONE: '↩️ Recomendação desfeita',
  RULE_FIRED: '⚡ Regra de automação disparada',
};

export default function AuditoriaPage() {
  const logs = useApi<Log[]>(() => api.get('/audit', true), []);
  return (
    <div>
      <PageHeader title="Log de auditoria" subtitle="Toda ação que altera campanhas ou verba fica registrada aqui — quem, o quê e quando." />
      {logs.loading ? (
        <Skeleton className="h-64" />
      ) : logs.error ? (
        <ErrorState message={logs.error} onRetry={logs.retry} />
      ) : (logs.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma ação registrada ainda" hint="Aplique uma recomendação ou pause uma campanha para ver o registro." />
      ) : (
        <div className="card !p-0">
          <ul className="divide-y divide-border/60">
            {logs.data!.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <Badge>{ACTION_LABEL[l.action] ?? l.action}</Badge>
                  <span className="text-ink-2">
                    {l.user ? l.user.name : 'Automação'} · alvo {l.targetType.toLowerCase()} <code className="text-xs text-muted">{l.targetId.slice(0, 10)}…</code>
                    {l.before || l.after ? (
                      <span className="ml-2 text-xs text-muted">
                        {l.before ? `antes: ${JSON.stringify(l.before)}` : ''} {l.after ? `depois: ${JSON.stringify(l.after)}` : ''}
                      </span>
                    ) : null}
                  </span>
                </div>
                <time className="text-xs text-muted">{relativeTime(l.createdAt)}</time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
