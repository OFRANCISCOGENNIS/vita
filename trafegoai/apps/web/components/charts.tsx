'use client';

/**
 * Gráficos do dashboard.
 * Convenções (ver skill de dataviz): um único eixo Y por gráfico; séries de
 * plataforma em slots de cor FIXOS (Google/Meta/TikTok — nunca reordenados);
 * sequencial = um matiz claro→escuro (heatmap); tooltip em todo mark;
 * texto sempre em tinta de texto, nunca na cor da série.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { brl, num, PLATFORM_LABEL, PLATFORM_VAR } from '@/lib/format';

const GRID = 'var(--grid)';
const MUTED = 'rgb(var(--muted))';

const tooltipStyle = {
  backgroundColor: 'rgb(var(--surface))',
  border: '1px solid rgb(var(--border))',
  borderRadius: 8,
  color: 'rgb(var(--ink))',
  fontSize: 12,
};

/** Evolução diária: gasto × receita — mesma unidade (R$), um eixo. */
export function SpendRevenueChart({ data }: { data: Array<{ date: string; spend: number; revenue: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} stroke={GRID} tickLine={false} minTickGap={32} />
        <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} stroke="transparent" width={52} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [brl(v), name]}
          labelFormatter={(d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')}
        />
        <Legend formatter={(v) => <span style={{ color: 'rgb(var(--ink-2))', fontSize: 12 }}>{v}</span>} />
        {/* Slots categóricos próprios deste gráfico (não são as cores de plataforma) */}
        <Line type="monotone" dataKey="revenue" name="Receita" stroke="#3987e5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="spend" name="Investimento" stroke="#d95926" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Funil impressão → clique → conversão (rampa ordinal de um matiz). */
export function FunnelChart({ data }: { data: Array<{ stage: string; value: number }> }) {
  const ramp = ['#86b6ef', '#3987e5', '#1c5cab']; // azul ordinal, claro→escuro
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="stage" tick={{ fill: 'rgb(var(--ink-2))', fontSize: 12 }} width={92} stroke="transparent" tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [num(v), '']} separator="" cursor={{ fill: 'rgba(128,128,128,0.08)' }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28} label={{ position: 'right', fill: 'rgb(var(--ink-2))', fontSize: 12, formatter: (v: number) => num(v) }}>
          {data.map((_, i) => <Cell key={i} fill={ramp[i] ?? ramp[2]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Distribuição de verba por plataforma — cor segue a entidade (slot fixo). */
export function PlatformDonut({ data }: { data: Array<{ platform: string; spend: number }> }) {
  const total = data.reduce((a, b) => a + b.spend, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="55%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="spend" nameKey="platform" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="rgb(var(--surface))" strokeWidth={2}>
            {data.map((d) => <Cell key={d.platform} fill={PLATFORM_VAR[d.platform]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [brl(v), PLATFORM_LABEL[name] ?? name]} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-2 text-sm" aria-label="Legenda de plataformas">
        {data.map((d) => (
          <li key={d.platform} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PLATFORM_VAR[d.platform] }} aria-hidden />
              {PLATFORM_LABEL[d.platform]}
            </span>
            <span className="tnum font-medium">{total > 0 ? `${((d.spend / total) * 100).toFixed(0)}%` : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// Rampa sequencial azul (claro→escuro) — magnitude de conversões
const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

/** Mapa de calor dia-da-semana × hora (conversões). */
export function Heatmap({ data }: { data: Array<{ dayOfWeek: number; hour: number; conversions: number; cpa: number | null }> }) {
  const max = Math.max(...data.map((d) => d.conversions), 1);
  const byKey = new Map(data.map((d) => [`${d.dayOfWeek}-${d.hour}`, d]));
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }} aria-label="Conversões por dia da semana e hora">
        <thead>
          <tr>
            <th className="pr-1 text-left text-[10px] font-normal text-muted" scope="col">&nbsp;</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="w-5 text-center text-[10px] font-normal text-muted" scope="col">{h % 4 === 0 ? `${h}h` : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DOW.map((label, dow) => (
            <tr key={dow}>
              <th className="pr-1 text-right text-[10px] font-normal text-muted" scope="row">{label}</th>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = byKey.get(`${dow}-${h}`);
                const v = cell?.conversions ?? 0;
                const step = SEQ[Math.min(Math.floor((v / max) * (SEQ.length - 1) + 0.001), SEQ.length - 1)];
                return (
                  <td
                    key={h}
                    className="h-5 w-5 rounded-[3px]"
                    style={{ background: v === 0 ? 'rgb(var(--border) / 0.4)' : step }}
                    title={`${label} ${h}h — ${v} conversões${cell?.cpa ? ` · CPA ${brl(cell.cpa)}` : ''}`}
                    aria-label={`${label} ${h} horas: ${v} conversões`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        Menos
        {SEQ.map((c) => <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} aria-hidden />)}
        Mais conversões
      </p>
    </div>
  );
}
