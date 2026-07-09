'use client';

import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { useFilterStore, Preset } from '@/lib/store';
import { PLATFORM_LABEL } from '@/lib/format';

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'custom', label: 'Personalizado' },
];

interface Connection { id: string; name: string; platform: string }
interface Client { id: string; name: string }

/** Filtros globais: período, plataforma, conta e cliente — uma linha acima dos gráficos. */
export function FilterBar() {
  const f = useFilterStore();
  const { data: accounts } = useApi<Connection[]>(() => api.get('/connections'), []);
  const { data: clients } = useApi<Client[]>(() => api.get('/clients'), []);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filtros do painel">
      <div className="flex overflow-hidden rounded-lg border border-border" role="radiogroup" aria-label="Período">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            role="radio"
            aria-checked={f.preset === p.value}
            className={`px-3 py-1.5 text-sm transition-colors ${f.preset === p.value ? 'bg-accent text-white' : 'text-ink-2 hover:bg-border/40'}`}
            onClick={() => f.set({ preset: p.value })}
          >
            {p.label}
          </button>
        ))}
      </div>
      {f.preset === 'custom' && (
        <>
          <label className="sr-only" htmlFor="filtro-de">Data inicial</label>
          <input id="filtro-de" type="date" className="input !w-auto" value={f.from ?? ''} onChange={(e) => f.set({ from: e.target.value })} />
          <label className="sr-only" htmlFor="filtro-ate">Data final</label>
          <input id="filtro-ate" type="date" className="input !w-auto" value={f.to ?? ''} onChange={(e) => f.set({ to: e.target.value })} />
        </>
      )}
      <label className="sr-only" htmlFor="filtro-plataforma">Plataforma</label>
      <select
        id="filtro-plataforma"
        className="input !w-auto"
        value={f.platform ?? ''}
        onChange={(e) => f.set({ platform: (e.target.value || undefined) as never })}
      >
        <option value="">Todas as plataformas</option>
        {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filtro-conta">Conta</label>
      <select id="filtro-conta" className="input !w-auto max-w-56" value={f.accountId ?? ''} onChange={(e) => f.set({ accountId: e.target.value || undefined })}>
        <option value="">Todas as contas</option>
        {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <label className="sr-only" htmlFor="filtro-cliente">Cliente</label>
      <select id="filtro-cliente" className="input !w-auto" value={f.clientId ?? ''} onChange={(e) => f.set({ clientId: e.target.value || undefined })}>
        <option value="">Todos os clientes</option>
        {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
