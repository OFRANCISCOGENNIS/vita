"use client";

// Project detail: processing pipeline status, then the grid of suggested cuts
// with cut-mode selector + AI aggressiveness slider + regenerate per cut.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Loader2, Sparkles, Wand2 } from "lucide-react";
import * as api from "@/lib/api";
import { CUT_MODES } from "@/lib/presets";
import type { Cut, CutMode, Project } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { CutCard } from "@/components/cut-card";

const PIPELINE_STEPS: { id: Project["status"] | "done"; label: string }[] = [
  { id: "importing", label: "Importando o vídeo" },
  { id: "transcribing", label: "Transcrevendo com Whisper" },
  { id: "analyzing", label: "Análise multimodal (achando os melhores momentos)" },
  { id: "ready", label: "Cortes prontos" },
];

function Pipeline({ status }: { status: Project["status"] }) {
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.id === status);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Processando seu vídeo</CardTitle>
        <p className="mt-1 text-xs text-zinc-500">
          Você pode fechar esta página — avisamos quando os cortes estiverem prontos.
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

  const [project, setProject] = useState<Project | null>(null);
  const [cuts, setCuts] = useState<Cut[] | null>(null);
  const [error, setError] = useState(false);

  const [mode, setMode] = useState<CutMode>("viral");
  const [aggressiveness, setAggressiveness] = useState(3);
  const [count, setCount] = useState(10);
  const [generating, setGenerating] = useState(false);

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

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { jobId } = await api.generateCuts(id, mode, aggressiveness, count);
      toast("Geração de cortes iniciada", {
        description: `Modo "${CUT_MODES.find((m) => m.id === mode)?.name}", agressividade ${aggressiveness}/5, até ${count} cortes (job ${jobId.slice(0, 8)}).`,
      });
    } catch {
      toast("Falha ao iniciar a geração", { variant: "error" });
    } finally {
      setGenerating(false);
    }
  }

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
          </div>

          {project.processingNote && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <p className="font-semibold text-amber-100">Processamento requer backend conectado</p>
              <p className="mt-1 text-amber-200/90">{project.processingNote}</p>
            </div>
          )}

          {project.status !== "ready" ? (
            <Pipeline status={project.status} />
          ) : (
            <>
              {/* Generation controls */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Wand2 className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden />
                    Gerar novos cortes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Modo de corte</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Selecionar modo de corte">
                        {CUT_MODES.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setMode(m.id as CutMode)}
                            aria-pressed={mode === m.id}
                            title={m.description}
                            className={cn(
                              "rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                              mode === m.id
                                ? "border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow"
                                : "border-line bg-surface-2 text-zinc-400 hover:border-violet-500/50 hover:text-white",
                            )}
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">{CUT_MODES.find((m) => m.id === mode)?.description}</p>
                    </div>
                    <div className="flex w-full flex-col gap-4 lg:w-72">
                      <Slider
                        label="Agressividade da IA (1 = conservadora, 5 = ousada)"
                        min={1}
                        max={5}
                        value={aggressiveness}
                        onChange={setAggressiveness}
                      />
                      <Slider label="Quantidade de cortes" min={5} max={20} value={count} onChange={setCount} />
                      <Button onClick={handleGenerate} loading={generating}>
                        <Sparkles className="h-4 w-4" aria-hidden /> Gerar cortes
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cuts grid */}
              <section aria-labelledby="cortes">
                <div className="mb-4 flex items-center justify-between">
                  <h2 id="cortes" className="text-lg font-bold text-white">
                    Cortes sugeridos{" "}
                    {cuts && <span className="text-sm font-normal text-zinc-500">({cuts.length})</span>}
                  </h2>
                  <p className="text-xs text-zinc-500">Ordenados por score viral</p>
                </div>
                {cuts === null ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <SkeletonCard /><SkeletonCard /><SkeletonCard />
                  </div>
                ) : cuts.length === 0 ? (
                  <EmptyState
                    variant="clapper"
                    title="Nenhum corte gerado ainda"
                    description="Use o painel acima para escolher o modo e gerar os primeiros cortes."
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[...cuts]
                      .sort((a, b) => b.viralScore - a.viralScore)
                      .map((c) => (
                        <CutCard key={c.id} cut={c} />
                      ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
