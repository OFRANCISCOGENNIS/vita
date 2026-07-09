"use client";

// Recharts wrappers (client-only; pages import these via next/dynamic).

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RetentionPoint, UsagePoint } from "@/lib/types";
import { formatDuration, scoreHex } from "@/lib/utils";

const AXIS = { stroke: "#3f3f50", fontSize: 11, tickLine: false, axisLine: false } as const;
const TOOLTIP_STYLE = {
  backgroundColor: "#16161f",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 12,
  color: "#e4e4e7",
} as const;

export function UsageChart({ data }: { data: UsagePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="usage-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} />
        <YAxis {...AXIS} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d) => `Dia ${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`}
          formatter={(value: number, name: string) => [
            name === "minutes" ? `${value} min` : `${value} cortes`,
            name === "minutes" ? "Minutos processados" : "Cortes gerados",
          ]}
        />
        <Area type="monotone" dataKey="minutes" stroke="#8b5cf6" strokeWidth={2} fill="url(#usage-grad)" />
        <Area type="monotone" dataKey="cuts" stroke="#d946ef" strokeWidth={2} fill="transparent" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface RetentionChartProps {
  data: RetentionPoint[];
}

/** Second-by-second retention curve with reference dots on creative markers. */
export function RetentionChart({ data }: RetentionChartProps) {
  const markers = data.filter((p) => p.marker);
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="retention-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d946ef" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="second"
          {...AXIS}
          tickFormatter={(s: number) => formatDuration(s)}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis {...AXIS} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(s) => `Segundo ${s}`}
          formatter={(value: number, _name, entry) => {
            const marker = (entry?.payload as RetentionPoint | undefined)?.marker;
            return [`${value}% de retenção${marker ? ` — ${marker}` : ""}`, ""];
          }}
          separator=""
        />
        <Area
          type="monotone"
          dataKey="retentionPct"
          stroke="#d946ef"
          strokeWidth={2.5}
          fill="url(#retention-grad)"
        />
        {markers.map((m) => (
          <ReferenceDot
            key={m.second}
            x={m.second}
            y={m.retentionPct}
            r={5}
            fill="#fbbf24"
            stroke="#0a0a0f"
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PostTimesChart({ data }: { data: { day: string; hour: number; score: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="day" {...AXIS} />
        <YAxis {...AXIS} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          formatter={(value: number, _n, entry) => {
            const hour = (entry?.payload as { hour?: number } | undefined)?.hour;
            return [`Score ${value} — melhor horário: ${hour}h`, ""];
          }}
          separator=""
        />
        <Bar dataKey="score" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.score >= 80 ? "#d946ef" : "#8b5cf6"} opacity={0.4 + (d.score / 100) * 0.6} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Score-breakdown bars moved to components/breakdown-bars.tsx so pages that
// only need them don't pull the Recharts bundle.
