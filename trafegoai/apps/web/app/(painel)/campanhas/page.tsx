'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, SortingState, useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useApi } from '@/lib/useApi';
import { api, qs } from '@/lib/api';
import { useFilterStore } from '@/lib/store';
import { FilterBar } from '@/components/FilterBar';
import { Badge, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { brl, num, pct, ratio, PLATFORM_LABEL } from '@/lib/format';

interface CampaignRow {
  id: string; name: string; status: string; platform: string; account: string; client: string | null;
  budgetDaily: number | null;
  spend: number; revenue: number; roas: number; cpa: number; cpc: number; cpm: number;
  ctr: number; convRate: number; impressions: number; clicks: number; conversions: number;
}

type PendingAction =
  | { kind: 'pause' | 'activate' | 'duplicate'; row: CampaignRow }
  | { kind: 'budget'; row: CampaignRow; value: number };

const ALL_COLUMNS: Array<{ id: keyof CampaignRow; label: string }> = [
  { id: 'spend', label: 'Investimento' }, { id: 'revenue', label: 'Receita' }, { id: 'roas', label: 'ROAS' },
  { id: 'cpa', label: 'CPA' }, { id: 'cpc', label: 'CPC' }, { id: 'cpm', label: 'CPM' },
  { id: 'ctr', label: 'CTR' }, { id: 'convRate', label: 'Tx. conv.' },
  { id: 'impressions', label: 'Impressões' }, { id: 'clicks', label: 'Cliques' }, { id: 'conversions', label: 'Conversões' },
];

export default function CampanhasPage() {
  const f = useFilterStore();
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'spend', desc: true }]);
  const [visible, setVisible] = useState<Set<string>>(new Set(['spend', 'revenue', 'roas', 'cpa', 'ctr', 'conversions']));
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const query = qs({ ...f.toQuery(), search: search || undefined });
  const { data, loading, error, retry, setData } = useApi<CampaignRow[]>(() => api.get(`/campaigns${query}`), [query]);

  const columns = useMemo<ColumnDef<CampaignRow>[]>(() => {
    const fmt: Record<string, (v: number) => string> = {
      spend: brl, revenue: brl, roas: ratio, cpa: brl, cpc: brl, cpm: brl,
      ctr: (v) => pct(v), convRate: (v) => pct(v), impressions: num, clicks: num, conversions: num,
    };
    return [
      {
        accessorKey: 'name',
        header: 'Campanha',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium" title={row.original.name}>{row.original.name}</p>
            <p className="text-xs text-muted">{PLATFORM_LABEL[row.original.platform]} · {row.original.client ?? row.original.account}</p>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const v = getValue<string>();
          return <Badge tone={v === 'ACTIVE' ? 'good' : 'neutral'}>{v === 'ACTIVE' ? 'Ativa' : 'Pausada'}</Badge>;
        },
      },
      ...ALL_COLUMNS.filter((c) => visible.has(c.id)).map<ColumnDef<CampaignRow>>((c) => ({
        accessorKey: c.id,
        header: c.label,
        cell: ({ getValue }) => <span className="tnum">{fmt[c.id]!(getValue<number>())}</span>,
      })),
      {
        id: 'acoes',
        header: 'Ações',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex gap-1">
              {r.status === 'ACTIVE' ? (
                <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPending({ kind: 'pause', row: r })}>Pausar</button>
              ) : (
                <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPending({ kind: 'activate', row: r })}>Ativar</button>
              )}
              <button
                className="btn-ghost !px-2 !py-1 !text-xs"
                onClick={() => {
                  const v = prompt(`Novo orçamento diário para "${r.name}" (atual: ${brl(r.budgetDaily)})`, String(r.budgetDaily ?? ''));
                  const parsed = Number(v?.replace(',', '.'));
                  if (v && Number.isFinite(parsed) && parsed > 0) setPending({ kind: 'budget', row: r, value: parsed });
                }}
              >
                Verba
              </button>
              <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPending({ kind: 'duplicate', row: r })}>Duplicar</button>
            </div>
          );
        },
      },
    ];
  }, [visible]);

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Virtualização para bases grandes
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  async function runPending() {
    if (!pending) return;
    setBusy(true);
    try {
      const { row } = pending;
      if (pending.kind === 'pause') await api.post(`/campaigns/${row.id}/pause`);
      if (pending.kind === 'activate') await api.post(`/campaigns/${row.id}/activate`);
      if (pending.kind === 'duplicate') await api.post(`/campaigns/${row.id}/duplicate`);
      if (pending.kind === 'budget') await api.patch(`/campaigns/${row.id}/budget`, { budgetDaily: pending.value });
      setData((prev) =>
        prev?.map((r) =>
          r.id === row.id
            ? { ...r, status: pending.kind === 'pause' ? 'PAUSED' : pending.kind === 'activate' ? 'ACTIVE' : r.status, budgetDaily: pending.kind === 'budget' ? pending.value : r.budgetDaily }
            : r,
        ) ?? null,
      );
      setToast('Ação aplicada com sucesso ✓');
      setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Falha ao aplicar ação');
      setTimeout(() => setToast(null), 5000);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const confirmCopy: Record<string, (r: CampaignRow) => { t: string; d: string }> = {
    pause: (r) => ({ t: 'Pausar campanha?', d: `"${r.name}" deixará de veicular e de gastar verba em ${PLATFORM_LABEL[r.platform]}. Você pode reativar quando quiser.` }),
    activate: (r) => ({ t: 'Ativar campanha?', d: `"${r.name}" voltará a veicular e a consumir o orçamento diário de ${brl(r.budgetDaily)}.` }),
    duplicate: (r) => ({ t: 'Duplicar campanha?', d: `Uma cópia de "${r.name}" será criada PAUSADA — ela não gasta nada até você revisar e ativar.` }),
    budget: (r) => ({ t: 'Alterar orçamento?', d: `O orçamento diário de "${r.name}" será alterado de ${brl(r.budgetDaily)} para ${brl((pending as any)?.value)}. A mudança vale imediatamente na plataforma.` }),
  };

  return (
    <div>
      <PageHeader title="Campanhas" subtitle="Tabela unificada das 3 plataformas — ordene, filtre e aja direto do painel." />
      <FilterBar />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="busca">Buscar campanha</label>
        <input id="busca" className="input !w-64" placeholder="Buscar campanha…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <details className="relative">
          <summary className="btn-ghost cursor-pointer list-none">Colunas ({visible.size})</summary>
          <div className="absolute z-10 mt-1 w-48 rounded-lg border border-border bg-surface p-2 shadow-xl">
            {ALL_COLUMNS.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-border/40">
                <input
                  type="checkbox"
                  checked={visible.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(visible);
                    e.target.checked ? next.add(c.id) : next.delete(c.id);
                    setVisible(next);
                  }}
                />
                {c.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      {loading ? (
        <Skeleton className="h-96" />
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhuma campanha encontrada" hint="Ajuste os filtros ou conecte uma conta de anúncios na aba Conexões." />
      ) : (
        <div ref={parentRef} className="card max-h-[70vh] overflow-auto !p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-surface">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border text-left">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="whitespace-nowrap px-3 py-2.5 font-medium text-muted">
                      {h.column.getCanSort() ? (
                        <button className="inline-flex items-center gap-1 hover:text-ink" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span aria-hidden>{{ asc: '↑', desc: '↓' }[h.column.getIsSorted() as string] ?? ''}</span>
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody style={{ height: virtualizer.getTotalSize() }} className="relative">
              {virtualizer.getVirtualItems().map((vi) => {
                const row = rows[vi.index];
                return (
                  <tr
                    key={row.id}
                    className="absolute left-0 top-0 flex w-full items-center border-b border-border/50 hover:bg-border/20"
                    style={{ transform: `translateY(${vi.start}px)`, height: 56 }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="flex-1 truncate px-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          open
          busy={busy}
          title={confirmCopy[pending.kind](pending.row).t}
          description={confirmCopy[pending.kind](pending.row).d}
          confirmLabel="Confirmar"
          danger={pending.kind === 'pause'}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-xl" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
