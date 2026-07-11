"use client";

// "Análise do vídeo" chart — energy curve (WebAudio RMS) with peak markers,
// proof that the cut selection is grounded in real signal. Rendered with
// Recharts (already a dependency), imported via next/dynamic by callers.

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisProfile } from "@/lib/video-analysis";
import { formatDuration } from "@/lib/utils";

export function AnalysisChart({ profile }: { profile: AnalysisProfile }) {
  const w = profile.windowSeconds;
  const step = Math.max(1, Math.ceil(profile.energy.length / 180));
  const data: Array<{ t: number; e: number }> = [];
  for (let i = 0; i < profile.energy.length; i += step) {
    // Keep the max of the bucket so peaks stay visible after downsampling.
    let max = 0;
    for (let j = i; j < Math.min(profile.energy.length, i + step); j++) {
      if (profile.energy[j] > max) max = profile.energy[j];
    }
    data.push({ t: Math.round(i * w * 10) / 10, e: Math.round(max * 100) });
  }
  const energyAt = (t: number): number => {
    const i = Math.min(profile.energy.length - 1, Math.max(0, Math.floor(t / w)));
    return Math.round((profile.energy[i] ?? 0) * 100);
  };
  const peakDots = profile.peaks.slice(0, 14);

  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -22 }}>
        <defs>
          <linearGradient id="energy-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[0, Math.max(1, Math.round(profile.duration))]}
          stroke="#3f3f50"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(t: number) => formatDuration(t)}
        />
        <YAxis domain={[0, 100]} stroke="#3f3f50" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#16161f",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            fontSize: 12,
            color: "#e4e4e7",
          }}
          labelFormatter={(t) => `Momento ${formatDuration(Number(t))}`}
          formatter={(value: number) => [`${value}%`, "Energia do áudio"]}
        />
        <Area type="monotone" dataKey="e" stroke="#8b5cf6" strokeWidth={2} fill="url(#energy-grad)" />
        {peakDots.map((p) => (
          <ReferenceDot
            key={p}
            x={Math.round(p * 10) / 10}
            y={energyAt(p)}
            r={3.5}
            fill="#f0abfc"
            stroke="#0a0a0f"
            strokeWidth={1}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
