"use client";

// Project detail: processing pipeline status, then the grid of suggested cuts.
// Generation is grounded in REAL in-browser analysis (lib/video-analysis +
// lib/smart-cuts): the first "Gerar cortes" opens the "Assistente de cortes"
// questionnaire; answers persist per project and show as a compact chip row on
// subsequent runs. After generating, an "Análise do vídeo" card shows the
// energy curve with the detected peaks/scenes/silences.

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from "lucide-react";
import * as api from "@/lib/api";
import { CUT_MODES } from "@/lib/presets";
import { readWizardAnswers, saveWizardAnswers, summaryChips, type WizardAnswers } from "@/lib/cut-wizard";
import { getCachedProfile } from "@/lib/smart-cuts";
import type { AnalysisProfile, AnalysisProgress } from "@/lib/video-analysis";
import type { Cut, CutMode, Project } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { CutCard } from "@/components/cut-card";
import { CutWizardModal } from "@/components/cut-wizard-modal";

const AnalysisChart = dynamic(
  () => import("@/components/analysis-chart").then((m) => m.AnalysisChart),
  { ssr: false, loading: () => <Skeleton className="h-[170px] w-full" /> },
);

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

/** Post-generation proof card: real energy curve + detected features. */
function AnalysisCard({ profile }: { profile: AnalysisProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Activity className="mr-2 inline h-4 w-4 text-fuchsia-400" aria-hidden />
          Análise do vídeo
        </CardTitle>
        <p className="mt-1 text-xs text-zinc-500">
          {profile.synthetic
            ? "Mídia indisponível no navegador — curva simulada (determinística) usada na seleção dos trechos."
            : "Curva de energia do áudio calculada no seu navegador. Os pontos são os picos usados para escolher os cortes."}
        </p>
      </CardHeader>
      <CardContent>
        <AnalysisChart profile={profile} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="accent">{profile.peaks.length} picos de energia</Badge>
          <Badge variant="info">{profile.scenes.length} mudanças de cena</Badge>
          <Badge variant="outline">{profile.silences.length} silêncios (pontos de corte)</Badge>
          {!profile.synthetic && (
            <Badge variant={profile.hasAudio ? "success" : "warning"}>
              {profile.hasAudio ? "áudio analisado" : "vídeo sem áudio"}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-[11px] text-zinc-600">
          Títulos gerados por heurística — refine com IA real quando o backend estiver conectado.
        </p>
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
  const [genProgress, setGenProgress] = useState<AnalysisProgress | null>(null);
  const [genError, setGenError] = useState(false);

  const [answers, setAnswers] = useState<WizardAnswers | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [profile, setProfile] = useState<AnalysisProfile | null>(null);

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

  // Saved wizard answers + cached analysis are restored per project.
  useEffect(() => {
    setAnswers(readWizardAnswers(id));
    setProfile(getCachedProfile(id));
  }, [id]);

  async function runGenerate(a: WizardAnswers) {
    setGenerating(true);
    setGenError(false);
    setGenProgress({ pct: 3, message: "Preparando análise…" });
    try {
      await api.generateCuts(id, mode, aggressiveness, count, {
        answers: a,
        onProgress: (p) => setGenProgress(p),
      });
      // Refresh the grid so the freshly generated cuts appear right away.
      const fresh = await api.getProjectCuts(id);
      setCuts(fresh);
      setProfile(getCachedProfile(id));
      toast("Cortes gerados a partir da análise", {
        description: `Modo "${CUT_MODES.find((m) => m.id === mode)?.name}" · trechos escolhidos por picos de energia e mudanças de cena. Títulos por heurística — refine com IA real quando o backend estiver conectado.`,
      });
    } catch {
      setGenError(true);
      toast("Falha ao gerar os cortes", { description: "Tente novamente.", variant: "error" });
    } finally {
      setGenerating(false);
      setGenProgress(null);
    }
  }

  function handleGenerateClick() {
    // First run: open the questionnaire. Re-runs reuse the saved answers.
    if (!answers) {
      setWizardOpen(true);
      return;
    }
    void runGenerate(answers);
  }

  function handleWizardSubmit(a: WizardAnswers) {
    saveWizardAnswers(id, a);
    setAnswers(a);
    setWizardOpen(false);
    void runGenerate(a);
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
                  <p className="mt-1 text-xs text-zinc-500">
                    A seleção analisa o vídeo no seu navegador: energia do áudio, silêncios e mudanças de cena.
                  </p>
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

                      {/* Wizard answers: compact summary chips after the 1st run */}
                      {answers && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Briefing dos cortes
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {summaryChips(answers).map((chip) => (
                              <Badge key={chip} variant="outline">{chip}</Badge>
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setWizardOpen(true)}
                              className="h-6 px-2 text-[11px]"
                            >
                              <SlidersHorizontal className="h-3 w-3" aria-hidden /> Editar respostas
                            </Button>
                          </div>
                        </div>
                      )}
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
                      <Button onClick={handleGenerateClick} loading={generating}>
                        <Sparkles className="h-4 w-4" aria-hidden /> Gerar cortes
                      </Button>
                      {genError && !generating && (
                        <p className="text-xs text-rose-300">
                          A geração falhou.{" "}
                          <button
                            onClick={handleGenerateClick}
                            className="underline underline-offset-2 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                          >
                            Tentar novamente
                          </button>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Real analysis progress */}
                  {generating && genProgress && (
                    <div className="mt-5 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4" role="status" aria-live="polite">
                      <p className="mb-2 flex items-center gap-2 text-sm text-violet-200">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        {genProgress.message}
                      </p>
                      <Progress value={genProgress.pct} label="Progresso da análise do vídeo" />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Analysis proof card */}
              {profile && !generating && <AnalysisCard profile={profile} />}

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

      <CutWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initial={answers}
        onSubmit={handleWizardSubmit}
      />
    </div>
  );
}
