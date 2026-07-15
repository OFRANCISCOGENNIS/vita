"use client";

// Project detail: infos do projeto + grade dos clipes existentes. Daqui o
// usuário abre o clipe no editor ou cria um novo clipe do vídeo inteiro.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Clapperboard, Loader2, Pencil, Plus } from "lucide-react";
import * as api from "@/lib/api";
import { openInStudio } from "@/lib/open-in-studio";
import type { Cut, Project } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { CutCard } from "@/components/cut-card";

const PIPELINE_STEPS: { id: Project["status"] | "done"; label: string }[] = [
  { id: "importing", label: "Importando o vídeo" },
  { id: "transcribing", label: "Preparando o arquivo" },
  { id: "analyzing", label: "Finalizando o processamento" },
  { id: "ready", label: "Pronto para editar" },
];

function Pipeline({ status }: { status: Project["status"] }) {
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.id === status);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Processando seu vídeo</CardTitle>
        <p className="mt-1 text-xs text-zinc-500">
          Você pode fechar esta página — avisamos quando o vídeo estiver pronto.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {PIPELINE_STEPS.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <li key={step.id} className="flex items-center gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                ) : active ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-400" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-zinc-700" aria-hidden />
                )}
                <span className={cn("text-sm", done ? "text-zinc-500 line-through" : active ? "font-medium text-white" : "text-zinc-600")}>
                  {step.label}
                </span>
                {active && <Badge variant="accent">em andamento</Badge>}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function ProjectDetailPage({ id: propId }: { id?: string } = {}) {
  // Demo/mock projects arrive via the dynamic [id] route (useParams). User
  // projects (not pre-rendered) arrive via /app/projeto?id=<id> as a prop.
  const params = useParams<{ id: string }>();
  const id = propId ?? params?.id ?? "";

  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [cuts, setCuts] = useState<Cut[] | null>(null);
  const [error, setError] = useState(false);
  const [studioBusy, setStudioBusy] = useState(false);

  async function toStudio() {
    if (!project || studioBusy) return;
    setStudioBusy(true);
    try {
      const result = await openInStudio({ mediaId: project.mediaId, mediaUrl: project.mediaUrl, name: project.title });
      if (result.ok) {
        toast("Vídeo aberto no Estúdio", { description: "O vídeo inteiro entrou na timeline — edite à vontade." });
        router.push("/app/estudio");
      } else {
        toast("Não deu para abrir no Estúdio", { description: result.reason, variant: "error" });
      }
    } finally {
      setStudioBusy(false);
    }
  }

  function load() {
    setError(false);
    setProject(null);
    setCuts(null);
    api
      .getProject(id)
      .then((p) => {
        setProject(p);
        if (p.status === "ready") return api.getProjectCuts(id).then(setCuts);
        setCuts([]);
        return undefined;
      })
      .catch(() => setError(true));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);

  function newClip() {
    if (!project) return;
    const n = (cuts?.length ?? 0) + 1;
    const cut = api.createProjectClip(project, `Clipe ${n}`);
    setCuts((prev) => [...(prev ?? []), cut]);
    toast("Clipe criado", { description: `"${cut.title}" cobre o vídeo inteiro — abra no editor para recortar.` });
  }

  // Clipe padrão do projeto (o mais antigo) para o botão "Abrir no editor".
  const defaultCut = cuts && cuts.length > 0 ? cuts[0] : null;

  if (error) {
    return (
      <EmptyState
        variant="clapper"
        title="Projeto não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <div className="flex gap-2">
            <Button onClick={load}>Tentar novamente</Button>
            <Link href="/app/projetos" className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm text-zinc-300 hover:text-white">
              Ver projetos
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/app/projetos" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todos os projetos
      </Link>

      {project === null ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonCard /><SkeletonCard />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <img src={project.thumbnailUrl} alt="" className="hidden h-20 w-36 rounded-xl border border-line object-cover sm:block" />
              <div>
                <h1 className="text-2xl font-bold leading-tight text-white">{project.title}</h1>
                <p className="mt-1.5 text-sm text-zinc-500">
                  {formatDuration(project.durationSeconds)} · {project.resolution} · {project.fps}fps · idioma {project.language}
                </p>
              </div>
            </div>
            {project.status === "ready" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void toStudio()}
                  disabled={studioBusy}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {studioBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Clapperboard className="h-4 w-4" aria-hidden />}
                  Abrir no Estúdio
                </button>
                {defaultCut && (
                  <Link
                    href={`/app/editor?cut=${defaultCut.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-1 px-4 text-sm font-semibold text-zinc-200 transition-colors hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <Pencil className="h-4 w-4" aria-hidden /> Editor de cortes
                  </Link>
                )}
                <Button variant="secondary" onClick={newClip} disabled={cuts === null}>
                  <Plus className="h-4 w-4" aria-hidden /> Novo clipe
                </Button>
              </div>
            )}
          </div>

          {project.processingNote && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <p className="font-semibold text-amber-100">Aviso do projeto</p>
              <p className="mt-1 text-amber-200/90">{project.processingNote}</p>
            </div>
          )}

          {project.status !== "ready" ? (
            <Pipeline status={project.status} />
          ) : (
            <section aria-labelledby="clipes">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="clipes" className="text-lg font-bold text-white">
                  Clipes do projeto{" "}
                  {cuts && <span className="text-sm font-normal text-zinc-500">({cuts.length})</span>}
                </h2>
              </div>
              {cuts === null ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <SkeletonCard /><SkeletonCard /><SkeletonCard />
                </div>
              ) : cuts.length === 0 ? (
                <EmptyState
                  variant="clapper"
                  title="Nenhum clipe ainda"
                  description='Clique em "Novo clipe" para criar um clipe do vídeo inteiro e recortar no editor.'
                  action={
                    <Button onClick={newClip}>
                      <Plus className="h-4 w-4" aria-hidden /> Novo clipe
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {cuts.map((c) => (
                    <CutCard key={c.id} cut={c} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
