"use client";

// Painel do ADM · Fila de jobs — tabela de jobs da plataforma com status,
// progresso e usuário. Ações (tentar novamente / cancelar) são mock:
// atualização otimista + toast.

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, XCircle } from "lucide-react";
import { adminJobs, type AdminJob, type AdminJobStatus, type AdminJobType } from "@/lib/admin-data";
import { MOCK_NOW } from "@/lib/mock-data";
import { timeAgo } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";

const TYPE_LABELS: Record<AdminJobType, string> = {
  import: "Importação",
  transcribe: "Transcrição",
  analyze: "Análise",
  render: "Render",
};

const STATUS_BADGE: Record<AdminJobStatus, { label: string; variant: "default" | "info" | "success" | "danger" }> = {
  queued: { label: "Na fila", variant: "default" },
  running: { label: "Rodando", variant: "info" },
  done: { label: "Concluído", variant: "success" },
  error: { label: "Erro", variant: "danger" },
};

type StatusTab = "all" | AdminJobStatus;

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<AdminJob[] | null>(null);
  const [tab, setTab] = useState<StatusTab>("all");
  const [type, setType] = useState<"all" | AdminJobType>("all");

  useEffect(() => {
    const t = setTimeout(() => setJobs(adminJobs.map((j) => ({ ...j }))), 360);
    return () => clearTimeout(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = { all: 0, queued: 0, running: 0, done: 0, error: 0 };
    (jobs ?? []).forEach((j) => {
      c.all++;
      c[j.status]++;
    });
    return c;
  }, [jobs]);

  const filtered = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((j) => (tab === "all" || j.status === tab) && (type === "all" || j.type === type));
  }, [jobs, tab, type]);

  function retry(job: AdminJob) {
    setJobs((prev) =>
      prev ? prev.map((j) => (j.id === job.id ? { ...j, status: "queued", progress: 0, errorMessage: null, etaSeconds: 60 } : j)) : prev,
    );
    toast("Job reenfileirado", { description: `${TYPE_LABELS[job.type]} de ${job.userName} vai tentar novamente.`, variant: "success" });
  }

  function cancel(job: AdminJob) {
    setJobs((prev) =>
      prev ? prev.map((j) => (j.id === job.id ? { ...j, status: "error", errorMessage: "Cancelado pelo administrador", etaSeconds: null } : j)) : prev,
    );
    toast("Job cancelado", { description: `${TYPE_LABELS[job.type]} de ${job.userName} foi interrompido.`, variant: "info" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: `Todos (${counts.all})` },
            { id: "running", label: `Rodando (${counts.running})` },
            { id: "queued", label: `Fila (${counts.queued})` },
            { id: "error", label: `Erros (${counts.error})` },
            { id: "done", label: `Concluídos (${counts.done})` },
          ]}
        />
        <Select value={type} onChange={(e) => setType(e.target.value as "all" | AdminJobType)} aria-label="Filtrar por tipo" className="sm:w-44">
          <option value="all">Todos os tipos</option>
          {(Object.keys(TYPE_LABELS) as AdminJobType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="pt-5">
          {jobs === null ? (
            <Skeleton className="h-64 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState variant="queue" title="Nenhum job nesta visão" description="Não há jobs para o filtro selecionado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-2.5 pr-4 font-medium">Job</th>
                    <th className="py-2.5 pr-4 font-medium">Usuário</th>
                    <th className="py-2.5 pr-4 font-medium">Status</th>
                    <th className="py-2.5 pr-4 font-medium">Progresso</th>
                    <th className="py-2.5 pr-4 font-medium">Criado</th>
                    <th className="py-2.5 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((j) => {
                    const st = STATUS_BADGE[j.status];
                    const done = j.status === "done";
                    return (
                      <tr key={j.id} className="border-b border-line/50 align-top hover:bg-white/[0.02]">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-zinc-100">{TYPE_LABELS[j.type]}</p>
                          <p className="max-w-[220px] truncate text-xs text-zinc-500" title={j.target}>{j.target}</p>
                          <p className="font-mono text-[11px] text-zinc-600">{j.id}</p>
                          {j.errorMessage && <p className="mt-0.5 text-xs text-rose-400">{j.errorMessage}</p>}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="text-zinc-200">{j.userName}</p>
                          <p className="text-xs text-zinc-500">{j.userEmail}</p>
                        </td>
                        <td className="py-3 pr-4"><Badge variant={st.variant}>{st.label}</Badge></td>
                        <td className="w-48 py-3 pr-4">
                          <Progress
                            value={j.progress}
                            label={`Progresso do job ${TYPE_LABELS[j.type]}`}
                            colorClass={j.status === "error" ? "bg-none bg-rose-500" : done ? "bg-none bg-emerald-500" : undefined}
                          />
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {j.progress}%
                            {j.etaSeconds != null && j.status === "running" ? ` · ETA ${Math.max(1, Math.round(j.etaSeconds / 60))} min` : ""}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-zinc-500">{timeAgo(j.createdAt, MOCK_NOW)}</td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => retry(j)}
                              disabled={j.status === "running" || j.status === "queued"}
                            >
                              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancel(j)}
                              disabled={j.status === "done" || j.status === "error"}
                              aria-label={`Cancelar job ${TYPE_LABELS[j.type]}`}
                            >
                              <XCircle className="h-3.5 w-3.5 text-rose-400" aria-hidden /> Cancelar
                            </Button>
                          </div>
                        </td>
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
