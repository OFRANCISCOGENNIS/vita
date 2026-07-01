import { useState, useMemo } from 'react';
import type { Row } from '../lib/types';

interface Props {
  headers: string[];
  rows: Row[];
  pageSize?: number;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });

function fmt(v: unknown, header: string): string {
  if (v == null || v === '') return '';
  const h = header.toUpperCase();
  if (typeof v === 'number') {
    if (h.includes('VALOR') || h.includes('PRECO')) return BRL.format(v);
    return NUM.format(v);
  }
  if (v instanceof Date) return v.toLocaleDateString('pt-BR');
  return String(v);
}

function badge(v: string) {
  if (v === 'APROVADO' || v === 'ADERENTE') return 'bg-green-100 text-green-800';
  if (v === 'REPROVADO' || v === 'NAO ADERENTE') return 'bg-red-100 text-red-800';
  if (v === 'ODI') return 'bg-blue-100 text-blue-800';
  if (v === 'ODD') return 'bg-orange-100 text-orange-800';
  if (v === 'ODM') return 'bg-purple-100 text-purple-800';
  return null;
}

export function DataTable({ headers, rows, pageSize = 100 }: Props) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ col: number; asc: boolean } | null>(null);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(row => row.some(cell => String(cell ?? '').toLowerCase().includes(q)));
  }, [rows, search]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sort.col] ?? '';
      const bv = b[sort.col] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'pt-BR');
      return sort.asc ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (col: number) => {
    setSort(s => s?.col === col ? { col, asc: !s.asc } : { col, asc: true });
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          placeholder="Filtrar..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span className="text-sm text-gray-500">{filtered.length.toLocaleString('pt-BR')} linhas</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-700 text-white">
              {headers.map((h, j) => (
                <th
                  key={j}
                  onClick={() => toggleSort(j)}
                  className="px-3 py-2.5 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-slate-600"
                >
                  {h} {sort?.col === j ? (sort.asc ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {headers.map((h, j) => {
                  const v = row[j];
                  const str = fmt(v, h);
                  const cls = typeof v === 'string' ? badge(v) : null;
                  return (
                    <td key={j} className="px-3 py-1.5 whitespace-nowrap border-b border-gray-100">
                      {cls
                        ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{str}</span>
                        : str}
                    </td>
                  );
                })}
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={headers.length} className="text-center py-8 text-gray-400">Nenhum resultado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button onClick={() => setPage(0)} disabled={page === 0} className="px-2 py-1 rounded border disabled:opacity-40">«</button>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 rounded border disabled:opacity-40">‹</button>
          <span className="text-gray-600">Pág {page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="px-2 py-1 rounded border disabled:opacity-40">›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page === totalPages - 1} className="px-2 py-1 rounded border disabled:opacity-40">»</button>
        </div>
      )}
    </div>
  );
}
