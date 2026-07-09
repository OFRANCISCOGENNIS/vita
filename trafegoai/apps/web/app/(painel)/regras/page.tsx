'use client';

import { FormEvent, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { relativeTime } from '@/lib/format';

interface Rule {
  id: string; name: string; enabled: boolean; metric: string; operator: string;
  threshold: string; windowDays: number; action: string; actionValue: string | null;
  lastRunAt: string | null;
  executions: Array<{ id: string; firedAt: string; targetName: string; detail: string }>;
}

const METRIC_LABEL: Record<string, string> = { CPA: 'CPA', ROAS: 'ROAS', SPEND: 'Gasto diário', CTR: 'CTR', CPC: 'CPC' };
const ACTION_LABEL: Record<string, string> = {
  PAUSE: 'pausar a campanha',
  INCREASE_BUDGET: 'aumentar a verba',
  DECREASE_BUDGET: 'reduzir a verba',
  NOTIFY: 'me notificar',
};

export default function RegrasPage() {
  const rules = useApi<Rule[]>(() => api.get('/rules', true), []);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', metric: 'CPA', operator: 'GT', threshold: 50, windowDays: 3, action: 'PAUSE', actionValue: 20 });

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/rules', { ...form, threshold: Number(form.threshold), actionValue: form.action.includes('BUDGET') ? Number(form.actionValue) : undefined, scope: { level: 'CAMPAIGN' } });
      setShowForm(false);
      rules.retry();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(rule: Rule) {
    await api.patch(`/rules/${rule.id}`, { enabled: !rule.enabled });
    rules.setData((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)) ?? null);
  }

  async function remove(rule: Rule) {
    if (!confirm(`Excluir a regra "${rule.name}"? O histórico de execuções também será removido.`)) return;
    await api.del(`/rules/${rule.id}`);
    rules.setData((prev) => prev?.filter((r) => r.id !== rule.id) ?? null);
  }

  return (
    <div>
      <PageHeader
        title="Regras de automação"
        subtitle='Regras "se → então" que rodam em background a cada 15 minutos — só o que VOCÊ criou e ativou.'
        actions={<button className="btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Fechar' : '+ Nova regra'}</button>}
      />

      {showForm && (
        <form className="card mb-6 grid gap-3 md:grid-cols-2" onSubmit={create}>
          <div className="md:col-span-2">
            <label htmlFor="r-nome" className="mb-1 block text-sm text-ink-2">Nome da regra</label>
            <input id="r-nome" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='Ex.: "Pausar CPA alto"' />
          </div>
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-ink-2">Se…</legend>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input !w-auto" aria-label="Métrica" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                {Object.entries(METRIC_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select className="input !w-auto" aria-label="Operador" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                <option value="GT">maior que</option>
                <option value="LT">menor que</option>
              </select>
              <input type="number" step="0.01" className="input !w-28" aria-label="Limiar" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} />
              <span className="text-sm text-ink-2">por</span>
              <input type="number" min={1} max={30} className="input !w-20" aria-label="Dias" value={form.windowDays} onChange={(e) => setForm({ ...form, windowDays: Number(e.target.value) })} />
              <span className="text-sm text-ink-2">dias</span>
            </div>
          </fieldset>
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-ink-2">Então…</legend>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input !w-auto" aria-label="Ação" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                {Object.entries(ACTION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {form.action.includes('BUDGET') && (
                <>
                  <span className="text-sm text-ink-2">em</span>
                  <input type="number" min={1} max={100} className="input !w-20" aria-label="Percentual" value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: Number(e.target.value) })} />
                  <span className="text-sm text-ink-2">%</span>
                </>
              )}
            </div>
          </fieldset>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar regra'}</button>
          </div>
        </form>
      )}

      {rules.loading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : rules.error ? (
        <ErrorState message={rules.error} onRetry={rules.retry} />
      ) : (rules.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma regra criada" hint='Crie sua primeira automação, ex.: "se CPA > R$ 50 por 3 dias, pausar a campanha".' action={<button className="btn-primary" onClick={() => setShowForm(true)}>+ Nova regra</button>} />
      ) : (
        <div className="space-y-3">
          {rules.data!.map((rule) => (
            <article key={rule.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{rule.name}</h3>
                    <Badge tone={rule.enabled ? 'good' : 'neutral'}>{rule.enabled ? 'Ativa' : 'Pausada'}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">
                    Se <strong>{METRIC_LABEL[rule.metric]}</strong> {rule.operator === 'GT' ? '>' : '<'} <strong>{rule.threshold}</strong> por {rule.windowDays} dia(s) → {ACTION_LABEL[rule.action]}
                    {rule.actionValue && rule.action.includes('BUDGET') ? ` em ${Number(rule.actionValue)}%` : ''}
                  </p>
                  <p className="mt-1 text-xs text-muted">Última verificação: {relativeTime(rule.lastRunAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={() => toggle(rule)}>{rule.enabled ? 'Desativar' : 'Ativar'}</button>
                  <button className="btn-ghost !text-red-400" onClick={() => remove(rule)}>Excluir</button>
                </div>
              </div>
              {rule.executions.length > 0 && (
                <details className="mt-3 border-t border-border pt-2">
                  <summary className="cursor-pointer text-sm text-ink-2">Últimas execuções ({rule.executions.length})</summary>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {rule.executions.map((ex) => (
                      <li key={ex.id}>⚡ <strong className="text-ink-2">{ex.targetName}</strong> — {ex.detail} <span className="text-xs">({relativeTime(ex.firedAt)})</span></li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
