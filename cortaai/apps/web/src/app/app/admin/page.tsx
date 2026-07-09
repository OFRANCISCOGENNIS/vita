"use client";

// Admin area: metric cards, users table and jobs queue table.

import { useEffect, useState } from "react";
import {
  Activity,
  AlertOctagon,
  Clock,
  UserCheck,
  Users,
} from "lucide-react";
import * as api from "@/lib/api";
import { MOCK_NOW } from "@/lib/mock-data";
import type { AdminMetrics, AdminUserRow, Job } from "@/lib/types";
import { formatCompact, timeAgo } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

const jobTypeLabels: Record<Job["type"], string> = {
  import: "Importação",
  transcribe: "Transcrição",
  analyze: "Análise",
  render: "Render",
  radar_scan: "Varredura do Radar",
};

const jobStatusBadge: Record<Job["status"], { label: string; variant: "default" | "info" | "success" | "danger" }> = {
  queued: { label: "Na fila", variant: "default" },
  running: { label: "Rodando", variant: "info" },
  done: { label: "Concluído", variant: "success" },
  error: { label: "Erro", variant: "danger" },
};

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setMetrics(null);
    setUsers(null);
    setJobs(null);
    Promise.all([api.adminMetrics(), api.adminUsers(), api.adminJobs()])
      .then(([m, u, j]) => {
        setMetrics(m);
        setUsers(u);
        setJobs(j);
      })
      .catch(() => setError(true));
  }
  useEffect(load, []);

  if (user && !user.isAdmin) {
    return (
      <EmptyState
        variant="queue"
        title="Acesso restrito"
        description="Esta área é exclusiva para administradores da plataforma."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        variant="queue"
        title="Falha ao carregar os dados de admin"
        action={<Button onClick={load}>Tentar novamente</Button>}
      />
    );
  }

  const statCards = metrics
    ? [
        { label: "Usuários", value: formatCompact(metrics.totalUsers), icon: <Users className="h-4 w-4 text-violet-400" /> },
        { label: "Usuários ativos", value: formatCompact(metrics.activeUsers), icon: <UserCheck className="h-4 w-4 text-fuchsia-400" /> },
        { label: "Minutos hoje", value: formatCompact(metrics.minutesProcessedToday), icon: <Clock className="h-4 w-4 text-sky-400" /> },
        { label: "Renders na fila", value: String(metrics.rendersQueued), icon: <Activity className="h-4 w-4 text-amber-400" /> },
        { label: "Taxa de erro", value: `${metrics.errorRatePct.toFixed(1).replace(".", ",")}%`, icon: <AlertOctagon className="h-4 w-4 text-rose-400" /> },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="mt-1 text-sm text-zinc-500">Métricas da plataforma, usuários e fila de jobs.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics === null
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          : statCards.map((s) => (
              <Card key={s.label}>
                <CardContent className="pt-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    {s.icon} {s.label}
                  </p>
                  <p className="mt-2 text-xl font-extrabold text-white">{s.value}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
        </CardHeader>
        <CardContent>
          {users === null ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-2.5 pr-4 font-medium">Usuário</th>
                    <th className="py-2.5 pr-4 font-medium">Projetos</th>
                    <th className="py-2.5 font-medium">Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-line/50 hover:bg-white/[0.02]">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-zinc-100">{u.name}</p>
                        <p className="text-xs text-zinc-500">{u.email}</p>
                      </td>
                      <td className="py-3 pr-4 font-mono text-zinc-300">{u.projectsCount.toLocaleString("pt-BR")}</td>
                      <td className="py-3 text-xs text-zinc-500">{timeAgo(u.createdAt, MOCK_NOW)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila de jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs === null ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-2.5 pr-4 font-medium">Job</th>
                    <th className="py-2.5 pr-4 font-medium">Status</th>
                    <th className="py-2.5 pr-4 font-medium">Progresso</th>
                    <th className="py-2.5 font-medium">Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const st = jobStatusBadge[j.status];
                    return (
                      <tr key={j.id} className="border-b border-line/50 hover:bg-white/[0.02]">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-zinc-100">{jobTypeLabels[j.type]}</p>
                          <p className="font-mono text-[11px] text-zinc-600">{j.id.slice(0, 12)}…</p>
                          {j.errorMessage && <p className="mt-0.5 text-xs text-rose-400">{j.errorMessage}</p>}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </td>
                        <td className="w-48 py-3 pr-4">
                          <Progress value={j.progress} label={`Progresso do job ${jobTypeLabels[j.type]}`} />
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {j.progress}%{j.etaSeconds != null && j.status === "running" ? ` · ETA ${Math.round(j.etaSeconds / 60)} min` : ""}
                          </p>
                        </td>
                        <td className="py-3 text-xs text-zinc-500">{timeAgo(j.createdAt, MOCK_NOW)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
