"use client";

// Painel do ADM · Visão geral — KPIs da plataforma + gráficos (Recharts).

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Clock,
  ListChecks,
  Scissors,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import {
  adminUsageSeries,
  cutsByNiche,
  cutsByPlatform,
  platformMetrics,
  type AdminUsagePoint,
  type BreakdownSlice,
  type PlatformMetric,
} from "@/lib/admin-data";
import { cn, formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const AdminUsageChart = dynamic(() => import("@/components/admin-charts").then((m) => m.AdminUsageChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full" />,
});
const AdminBreakdownChart = dynamic(() => import("@/components/admin-charts").then((m) => m.AdminBreakdownChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full" />,
});
const AdminPlatformChart = dynamic(() => import("@/components/admin-charts").then((m) => m.AdminPlatformChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[220px] w-full" />,
});

const METRIC_ICONS: Record<string, typeof Users> = {
  totalUsers: Users,
  activeToday: UserCheck,
  active7d: CalendarClock,
  cutsGenerated: Scissors,
  minutesProcessed: Clock,
  jobsQueued: ListChecks,
  errorRate: AlertTriangle,
};

function metricValue(m: PlatformMetric): string {
  if (m.key === "errorRate") return `${m.value.toFixed(1).replace(".", ",")}%`;
  return formatCompact(m.value);
}

interface Data {
  metrics: PlatformMetric[];
  usage: AdminUsagePoint[];
  niche: BreakdownSlice[];
  platform: BreakdownSlice[];
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setData(null);
    const t = setTimeout(() => {
      try {
        setData({
          metrics: platformMetrics,
          usage: adminUsageSeries,
          niche: cutsByNiche,
          platform: cutsByPlatform,
        });
      } catch {
        setError(true);
      }
    }, 380);
    return () => clearTimeout(t);
  }
  useEffect(load, []);

  if (error) {
    return (
      <EmptyState
        variant="queue"
        title="Falha ao carregar a visão geral"
        description="Não foi possível montar os indicadores da plataforma."
        action={<Button onClick={load}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <section aria-label="Indicadores da plataforma" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data === null
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />)
          : data.metrics.map((m) => {
              const Icon = METRIC_ICONS[m.key] ?? TrendingUp;
              const positive = m.deltaPct >= 0;
              // Para taxa de erro, cair é bom → inverte a cor.
              const good = m.key === "errorRate" ? !positive : positive;
              return (
                <Card key={m.key} className="transition-colors hover:border-amber-500/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        <Icon className="h-4 w-4 text-amber-400" aria-hidden /> {m.label}
                      </p>
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          good ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300",
                        )}
                      >
                        {positive ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
                        {Math.abs(m.deltaPct).toFixed(1).replace(".", ",")}%
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-extrabold text-white">{metricValue(m)}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{m.hint}</p>
                  </CardContent>
                </Card>
              );
            })}
      </section>

      {/* Uso ao longo do tempo */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            <TrendingUp className="mr-2 inline h-4 w-4 text-amber-400" aria-hidden />
            Uso da plataforma — últimos 14 dias
          </CardTitle>
          <div className="hidden items-center gap-4 text-xs text-zinc-500 sm:flex">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden /> Minutos</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fuchsia-500" aria-hidden /> Cortes</span>
          </div>
        </CardHeader>
        <CardContent>
          {data === null ? <Skeleton className="h-[280px] w-full" /> : <AdminUsageChart data={data.usage} />}
        </CardContent>
      </Card>

      {/* Quebra por nicho + plataforma */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cortes por nicho</CardTitle>
          </CardHeader>
          <CardContent>
            {data === null ? <Skeleton className="h-[280px] w-full" /> : <AdminBreakdownChart data={data.niche} kind="niche" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cortes por plataforma de destino</CardTitle>
          </CardHeader>
          <CardContent>
            {data === null ? <Skeleton className="h-[220px] w-full" /> : <AdminPlatformChart data={data.platform} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
