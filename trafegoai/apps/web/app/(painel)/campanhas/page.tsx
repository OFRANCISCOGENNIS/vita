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

const FMT: Record<string, (v: number) => string> = {
  spend: brl, revenue: brl, roas: ratio, cpa: brl, cpc: brl, cpm: brl,
  ctr: (v) => pct(v), convRate: (v) => pct(v), impressions: num, clicks: num, conversions: num,
};

// Métricas do comparativo (dir=1 maior é melhor; dir=-1 menor é melhor)
const CMP: Array<{ key: keyof CampaignRow; label: string; dir: 1 | -1 }> = [
  { key: 'roas', label: 'ROAS', dir: 1 }, { key: 'revenue', label: 'Receita', dir: 1 },
  { key: 'cpa', label: 'CPA', dir: -1 }, { key: 'ctr', label: 'CTR', dir: 1 },
  { key: 'convRate', label: 'Tx. conversão', dir: 1 }, { key: 'spend', label: 'Investimento', dir: -1 },
  { key: 'conversions', label: 'Conversões', dir: 1 },
];

export default function CampanhasPage() {
  const f = useFilterStore();
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'spend', desc: true }]);
  const [visible, setVisible] = useState<Set<string>>(new Set(['spend', 'revenue', 'roas', 'cpa', 'ctr', 'conversions']));
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [drill, setDrill] = useState<CampaignRow | null>(null);

  const query = qs({ ...f.toQuery(), search: search || undefined });
  const { data, loading, error, retry, setData } = useApi<CampaignRow[]>(() => api.get(`/campaigns${query}`), [query]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));
  const selectedRows = useMemo(() => (data ?? []).filter((c) => selected.includes(c.id)), [data, selected]);

  const columns = useMemo<ColumnDef<CampaignRow>[]>(() => [
    {
      id: 'select', header: '', enableSorting: false,
      cell: ({ row }) => (
        <input type="checkbox" checked={selected.includes(row.original.id)} onChange={() => toggleSelect(row.original.id)}
          disabled={!selected.includes(row.original.id) && selected.length >= 4} aria-label={`Comparar ${row.original.name}`} />
      ),
    },
    {
      accessorKey: 'name', header: 'Campanha',
      cell: ({ row }) => (
        <button className="min-w-0 text-left hover:underline" onClick={() => setDrill(row.original)} title="Ver conjuntos e anúncios">
          <p className="truncate font-medium">▸ {row.original.name}</p>
          <p className="text-xs text-muted">{PLATFORM_LABEL[row.original.platform]} · {row.original.client ?? row.original.account}</p>
        </button>
      ),
    },
    {
      accessorKey: 'status', header: 'Status',
      cell: ({ getValue }) => {
        const v = getValue<string>();
        return <Badge tone={v === 'ACTIVE' ? 'good' : 'neutral'}>{v === 'ACTIVE' ? 'Ativa' : 'Pausada'}</Badge>;
      },
    },
    ...ALL_COLUMNS.filter((c) => visible.has(c.id)).map<ColumnDef<CampaignRow>>((c) => ({
      accessorKey: c.id, header: c.label,
      cell: ({ getValue }) => <span className="tnum">{FMT[c.id]!(getValue<number>())}</span>,
    })),
    {
      id: 'acoes', header: 'Ações', enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex gap-1">
            {r.status === 'ACTIVE'
              ? <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPending({ kind: 'pause', row: r })}>Pausar</button>
              : <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPending({ kind: 'activate', row: r })}>Ativar</button>}
            <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => {
              const v = prompt(`Novo orçamento diário para "${r.name}" (atual: ${brl(r.budgetDaily)})`, String(r.budgetDaily ?? ''));
              const parsed = Number(v?.replace(',', '.'));
              if (v && Number.isFinite(parsed) && parsed > 0) setPending({ kind: 'budget', row: r, value: parsed });
            }}>Verba</button>
            <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPending({ kind: 'duplicate', row: r })}>Duplicar</button>
          </div>
        );
      },
    },
  ], [visible, selected]);

  const table = useReactTable({
    data: data ?? [], columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 56, overscan: 12 });

  function exportCsv() {
    const cols = ALL_COLUMNS.filter((c) => visible.has(c.id));
    const header = ['Campanha', 'Plataforma', 'Conta', 'Status', ...cols.map((c) => c.label)];
    const lines = (data ?? []).map((r) => [
      `"${r.name.replace(/"/g, '""')}"`, PLATFORM_LABEL[r.platform], `"${(r.client ?? r.account).replace(/"/g, '""')}"`,
      r.status, ...cols.map((c) => String(r[c.id])),
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `campanhas-trafegoai.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function runPending() {
    if (!pending) return;
    setBusy(true);
    try {
      const { row } = pending;
      if (pending.kind === 'pause') await api.post(`/campaigns/${row.id}/pause`);
      if (pending.kind === 'activate') await api.post(`/campaigns/${row.id}/activate`);
      if (pending.kind === 'duplicate') await api.post(`/campaigns/${row.id}/duplicate`);
      if (pending.kind === 'budget') await api.patch(`/campaigns/${row.id}/budget`, { budgetDaily: pending.value });
      setData((prev) => prev?.map((r) => r.id === row.id
        ? { ...r, status: pending.kind === 'pause' ? 'PAUSED' : pending.kind === 'activate' ? 'ACTIVE' : r.status, budgetDaily: pending.kind === 'budget' ? pending.value : r.budgetDaily }
        : r) ?? null);
      setToast('Ação aplicada com sucesso ✓');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Falha ao aplicar ação');
    } finally {
      setBusy(false); setPending(null); setTimeout(() => setToast(null), 4000);
    }
  }

  const confirmCopy: Record<string, (r: CampaignRow) => { t: string; d: string }> = {
    pause: (r) => ({ t: 'Pausar campanha?', d: `"${r.name}" deixará de veicular e de gastar verba em ${PLATFORM_LABEL[r.platform]}. Você pode reativar quando quiser.` }),
    activate: (r) => ({ t: 'Ativar campanha?', d: `"${r.name}" voltará a veicular e a consumir o orçamento diário de ${brl(r.budgetDaily)}.` }),
    duplicate: (r) => ({ t: 'Duplicar campanha?', d: `Uma cópia de "${r.name}" será criada PAUSADA — ela não gasta nada até você revisar e ativar.` }),
    budget: (r) => ({ t: 'Alterar orçamento?', d: `O orçamento diário de "${r.name}" será alterado de ${brl(r.budgetDaily)} para ${brl((pending as any)?.value)}. A mudança vale imediatamente na plataforma.` }),
  };

  // Vencedor por métrica no comparativo
  const winners = useMemo(() => {
    const w: Record<string, string> = {};
    for (const m of CMP) {
      let best: CampaignRow | null = null;
      for (const r of selectedRows) {
        const v = r[m.key] as number;
        if (!best || (m.dir === 1 ? v > (best[m.key] as number) : v < (best[m.key] as number))) best = r;
      }
      if (best) w[m.key as string] = best.id;
    }
    return w;
  }, [selectedRows]);

  return (
    <div>
      <PageHeader title="Campanhas" subtitle="Tabela unificada das 3 plataformas — ordene, filtre, compare e aja direto do painel." />
      <FilterBar />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="busca">Buscar campanha</label>
        <input id="busca" className="input !w-64" placeholder="Buscar campanha…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <details className="relative">
          <summary className="btn-ghost cursor-pointer list-none">Colunas ({visible.size})</summary>
          <div className="absolute z-10 mt-1 w-48 rounded-lg border border-border bg-surface p-2 shadow-xl">
            {ALL_COLUMNS.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-border/40">
                <input type="checkbox" checked={visible.has(c.id)} onChange={(e) => {
                  const next = new Set(visible);
                  e.target.checked ? next.add(c.id) : next.delete(c.id);
                  setVisible(next);
                }} />
                {c.label}
              </label>
            ))}
          </div>
        </details>
        <button className="btn-ghost" onClick={exportCsv} disabled={!data?.length}>⬇ Exportar CSV</button>
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
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody style={{ height: virtualizer.getTotalSize() }} className="relative">
              {virtualizer.getVirtualItems().map((vi) => {
                const row = rows[vi.index];
                return (
                  <tr key={row.id} className="absolute left-0 top-0 flex w-full items-center border-b border-border/50 hover:bg-border/20" style={{ transform: `translateY(${vi.start}px)`, height: 56 }}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={`truncate px-3 ${cell.column.id === 'select' ? 'w-10 shrink-0' : 'flex-1'}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra de comparação */}
      {selected.length >= 2 && !comparing && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-surface px-5 py-3 shadow-2xl">
          <span className="text-sm">{selected.length} campanhas selecionadas</span>
          <button className="btn-primary !py-1.5" onClick={() => setComparing(true)}>Comparar lado a lado</button>
          <button className="btn-ghost !py-1.5" onClick={() => setSelected([])}>Limpar</button>
        </div>
      )}

      {comparing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Comparativo de campanhas">
          <div className="card max-h-[90vh] w-full max-w-5xl overflow-auto shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Comparativo de campanhas</h3>
              <button className="btn-ghost !px-2 !py-1" onClick={() => setComparing(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-32 py-2 text-left font-medium text-muted">Métrica</th>
                    {selectedRows.map((r) => (
                      <th key={r.id} className="min-w-44 border-l border-border px-3 py-2 text-left align-top">
                        <p className="truncate font-medium" title={r.name}>{r.name}</p>
                        <p className="text-xs font-normal text-muted">{PLATFORM_LABEL[r.platform]}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tnum">
                  {CMP.map((m) => (
                    <tr key={m.key as string} className="border-t border-border/60">
                      <td className="py-2.5 text-muted">{m.label}</td>
                      {selectedRows.map((r) => {
                        const win = winners[m.key as string] === r.id;
                        return (
                          <td key={r.id} className={`border-l border-border px-3 py-2.5 ${win ? 'font-semibold text-green-400' : ''}`}>
                            {FMT[m.key as string]!(r[m.key] as number)} {win && <span aria-label="melhor">🏆</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {drill && <DrilldownModal campaign={drill} onClose={() => setDrill(null)} query={query} />}

      {pending && (
        <ConfirmDialog open busy={busy}
          title={confirmCopy[pending.kind](pending.row).t}
          description={confirmCopy[pending.kind](pending.row).d}
          confirmLabel="Confirmar" danger={pending.kind === 'pause'}
          onConfirm={runPending} onCancel={() => setPending(null)} />
      )}
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-xl" role="status">{toast}</div>}
    </div>
  );
}

// ---------- Drill-down: conjuntos e anúncios de uma campanha ----------
interface AdSetNode {
  id: string; name: string; status: string; roas: number; cpa: number; ctr: number; spend: number; conversions: number;
  ads: Array<{ id: string; name: string; status: string; roas: number; cpa: number; ctr: number; spend: number; conversions: number; creative: { headline: string } | null }>;
}

function DrilldownModal({ campaign, onClose, query }: { campaign: CampaignRow; onClose: () => void; query: string }) {
  const { data, loading, error, retry } = useApi<AdSetNode[]>(() => api.get(`/campaigns/${campaign.id}/children${query}`), [campaign.id, query]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Detalhes de ${campaign.name}`}>
      <div className="card max-h-[90vh] w-full max-w-4xl overflow-auto shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{campaign.name}</h3>
          <button className="btn-ghost !px-2 !py-1" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <p className="mb-4 text-sm text-muted">{PLATFORM_LABEL[campaign.platform]} · conjuntos de anúncios e anúncios</p>
        {loading ? <Skeleton className="h-48" /> : error ? <ErrorState message={error} onRetry={retry} /> : (
          <div className="space-y-4">
            {(data ?? []).map((s) => (
              <div key={s.id} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-border/20 px-3 py-2">
                  <span className="font-medium">📁 {s.name} <Badge tone={s.status === 'ACTIVE' ? 'good' : 'neutral'}>{s.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}</Badge></span>
                  <span className="tnum text-xs text-muted">ROAS {ratio(s.roas)} · CPA {brl(s.cpa)} · CTR {pct(s.ctr)} · {brl(s.spend)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {s.ads.map((a) => (
                      <tr key={a.id} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium">{a.name}</p>
                          {a.creative && <p className="text-xs text-muted">“{a.creative.headline}”</p>}
                        </td>
                        <td className="tnum px-3 py-2 text-right text-xs text-ink-2">ROAS {ratio(a.roas)}</td>
                        <td className="tnum px-3 py-2 text-right text-xs text-ink-2">CTR {pct(a.ctr)}</td>
                        <td className="tnum px-3 py-2 text-right text-xs text-ink-2">CPA {brl(a.cpa)}</td>
                        <td className="tnum px-3 py-2 text-right text-xs text-ink-2">{brl(a.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
