"use client";

// Dashboard: minutes processed, cuts generated, usage chart, recent projects,
// Radar highlights for the user's niche.

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Clock, FolderOpen, Radar, Scissors, ShieldAlert, TrendingUp } from "lucide-react";
import * as api from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import { formatDuration, timeAgo } from "@/lib/utils";
import { MOCK_NOW } from "@/lib/mock-data";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendCard } from "@/components/trend-card";

const UsageChart = dynamic(() => import("@/components/charts").then((m) => m.UsageChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[220px] w-full" />,
});

const statusLabels: Record<string, { label: string; variant: "success" | "info" | "warning" | "danger" }> = {
  ready: { label: "Pronto", variant: "success" },
  importing: { label: "Importando", variant: "info" },
  transcribing: { label: "Transcrevendo", variant: "info" },
  analyzing: { label: "Analisando", variant: "warning" },
  error: { label: "Erro", variant: "danger" },
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setStats(null);
    api.dashboardStats().then(setStats).catch(() => setError(true));
  }
  useEffect(load, []);

  const used = stats?.minutesProcessed ?? 0;

  if (error) {
    return (
      <EmptyState
        variant="queue"
        title="Não foi possível carregar o painel"
        description="Verifique sua conexão e tente novamente."
        action={<Button onClick={load}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Olá, {user?.name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Aqui está o resumo da sua fábrica de cortes.
        </p>
      </div>

      {/* Atalho para administradores (não força redirecionamento — é uma escolha). */}
      {user?.isAdmin && (
        <Link
          href="/app/admin"
          className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-3 transition-colors hover:border-amber-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white" aria-hidden>
            <ShieldAlert className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              Painel do ADM
              <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-black">ADM</span>
            </span>
            <span className="block text-xs text-zinc-400">Você tem acesso administrativo — veja as métricas da plataforma inteira.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        </Link>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-zinc-400">Minutos processados no mês</CardTitle>
            <Clock className="h-4 w-4 text-violet-400" aria-hidden />
          </CardHeader>
          <CardContent>
            {stats === null ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <>
                <p className="text-3xl font-extrabold text-white">
                  {used}
                  <span className="ml-1 text-sm font-normal text-zinc-500">min</span>
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">nos últimos 30 dias · sem limite</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-zinc-400">Cortes gerados</CardTitle>
            <Scissors className="h-4 w-4 text-fuchsia-400" aria-hidden />
          </CardHeader>
          <CardContent>
            {stats === null ? (
              <Skeleton className="h-9 w-20" />
            ) : (
              <>
                <p className="text-3xl font-extrabold text-white">{stats.cutsGenerated}</p>
                <p className="mt-1.5 text-xs text-zinc-500">nos últimos 30 dias</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-zinc-400">Projetos ativos</CardTitle>
            <FolderOpen className="h-4 w-4 text-emerald-400" aria-hidden />
          </CardHeader>
          <CardContent>
            {stats === null ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <>
                <p className="text-3xl font-extrabold text-white">{stats.recentProjects.length}</p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  {stats.recentProjects.filter((p) => p.status !== "ready").length} em processamento
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage chart */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            <TrendingUp className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden />
            Uso nos últimos 14 dias
          </CardTitle>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden /> Minutos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-fuchsia-500" aria-hidden /> Cortes
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {stats === null ? <Skeleton className="h-[220px] w-full" /> : <UsageChart data={stats.usageSeries} />}
        </CardContent>
      </Card>

      {/* Recent projects */}
      <section aria-labelledby="recentes">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recentes" className="text-lg font-bold text-white">Projetos recentes</h2>
          <Link href="/app/projetos" className="inline-flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300">
            Ver todos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {stats === null ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : stats.recentProjects.length === 0 ? (
          <EmptyState
            variant="clapper"
            title="Nenhum projeto ainda"
            description="Importe seu primeiro vídeo longo e deixe a IA encontrar os melhores momentos."
            action={
              <Link href="/app/novo" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white">
                Criar primeiro projeto
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.recentProjects.map((p) => {
              const st = statusLabels[p.status] ?? statusLabels.ready;
              return (
                <Link
                  key={p.id}
                  href={`/app/projeto?id=${p.id}`}
                  className="group overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-card transition-all hover:-translate-y-0.5 hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                      {formatDuration(p.durationSeconds)}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="text-[11px] text-zinc-500">{timeAgo(p.createdAt, MOCK_NOW)}</span>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-100">{p.title}</h3>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Radar highlights */}
      <section aria-labelledby="destaques">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="destaques" className="text-lg font-bold text-white">
            <Radar className="mr-2 inline h-5 w-5 text-fuchsia-400" aria-hidden />
            Destaques do Radar no seu nicho
          </h2>
          <Link href="/app/radar" className="inline-flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300">
            Abrir Radar Viral <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {stats === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : stats.nicheHighlights.length === 0 ? (
          <EmptyState
            variant="search"
            title="Sem destaques ainda"
            description="Explore o Radar Viral para descobrir vídeos em alta no seu nicho."
            action={
              <Link href="/app/radar" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-zinc-200 hover:border-violet-500/50 hover:text-white">
                Abrir Radar Viral
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.nicheHighlights.map((t) => (
              <TrendCard key={t.id} video={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
