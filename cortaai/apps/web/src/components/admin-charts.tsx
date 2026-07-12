"use client";

// Gráficos do Painel do ADM (client-only; importados via next/dynamic).
// Mantidos separados de charts.tsx para não inflar o bundle das telas do criador.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminUsagePoint, BreakdownSlice } from "@/lib/admin-data";
import { formatCompact } from "@/lib/utils";

const AXIS = { stroke: "#3f3f50", fontSize: 11, tickLine: false, axisLine: false } as const;
const TOOLTIP_STYLE = {
  backgroundColor: "#16161f",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 12,
  color: "#e4e4e7",
} as const;

// Paleta categórica: âmbar (identidade ADM) + violeta/fúcsia (marca).
const NICHE_COLORS = ["#f59e0b", "#8b5cf6", "#d946ef", "#38bdf8", "#34d399", "#fb7185", "#a78bfa", "#facc15"];
const PLATFORM_COLORS = ["#f59e0b", "#8b5cf6", "#d946ef"];

function label(name: string): string {
  if (name === "minutes") return "Minutos";
  if (name === "cuts") return "Cortes";
  if (name === "generations") return "Gerações";
  return name;
}

export function AdminUsageChart({ data }: { data: AdminUsagePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="adm-minutes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="adm-gen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} />
        <YAxis {...AXIS} width={44} tickFormatter={(v: number) => formatCompact(v)} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d) => `Dia ${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`}
          formatter={(value: number, name: string) => [`${Number(value).toLocaleString("pt-BR")}`, label(name)]}
        />
        <Area type="monotone" dataKey="minutes" stroke="#f59e0b" strokeWidth={2} fill="url(#adm-minutes)" name="minutes" />
        <Area type="monotone" dataKey="generations" stroke="#8b5cf6" strokeWidth={2} fill="url(#adm-gen)" name="generations" />
        <Area type="monotone" dataKey="cuts" stroke="#d946ef" strokeWidth={2} fill="transparent" name="cuts" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AdminBreakdownChart({
  data,
  kind = "niche",
}: {
  data: BreakdownSlice[];
  kind?: "niche" | "platform";
}) {
  const colors = kind === "platform" ? PLATFORM_COLORS : NICHE_COLORS;
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 34 + 16)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
        <XAxis type="number" {...AXIS} tickFormatter={(v: number) => formatCompact(v)} />
        <YAxis
          type="category"
          dataKey="label"
          {...AXIS}
          width={84}
          tickFormatter={(s: string) => s.charAt(0).toUpperCase() + s.slice(1)}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          formatter={(value: number) => [`${Number(value).toLocaleString("pt-BR")} cortes`, ""]}
          separator=""
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AdminPlatformChart({ data }: { data: BreakdownSlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v: number) => formatCompact(v)} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          formatter={(value: number) => [
            `${Number(value).toLocaleString("pt-BR")} cortes · ${((value / total) * 100).toFixed(0)}%`,
            "",
          ]}
          separator=""
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} formatter={() => "Cortes exportados"} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Cortes">
          {data.map((_, i) => (
            <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
