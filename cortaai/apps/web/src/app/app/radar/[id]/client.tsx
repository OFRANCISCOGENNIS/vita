"use client";

// RAIO-X — reverse engineering of a trending video: sound / image / structure
// stat cards + second-by-second retention timeline with creative markers.

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Captions,
  Clock,
  ExternalLink,
  Eye,
  Film,
  Heart,
  ImageIcon,
  Music2,
  Printer,
  Repeat,
  Sparkles,
  Timer,
  Volume2,
  Wand2,
  Zap,
  ZoomIn,
} from "lucide-react";
import * as api from "@/lib/api";
import { CAPTION_PRESETS } from "@/lib/presets";
import { MOCK_NOW } from "@/lib/mock-data";
import type { TrendAnalysis, TrendVideo } from "@/lib/types";
import { formatCompact, formatDuration, timeAgo } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PickerModal } from "@/components/picker-modal";
import { ScoreBadge } from "@/components/score-badge";

const RetentionChart = dynamic(() => import("@/components/charts").then((m) => m.RetentionChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[320px] w-full" />,
});

type ActionKind = "sound" | "caption" | "inspire";

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {icon} {label}
      </p>
      <div className="mt-1.5 text-sm font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

export default function XrayPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [video, setVideo] = useState<TrendVideo | null>(null);
  const [xray, setXray] = useState<TrendAnalysis | null>(null);
  const [error, setError] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  function load() {
    setError(false);
    setVideo(null);
    setXray(null);
    Promise.all([api.getTrendVideo(id), api.getTrendXray(id)])
      .then(([v, x]) => {
        setVideo(v);
        setXray(x);
      })
      .catch(() => setError(true));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);

  async function handlePick(target: { projectId: string; cutId?: string; label: string }) {
    if (!action || !video) return;
    setActionLoading(true);
    try {
      if (action === "sound" && target.cutId) {
        await api.useTrendSound(video.id, target.cutId);
        toast("Som aplicado à trilha!", {
          description: `"${xray?.sound.track}" foi adicionado ao corte "${target.label}".`,
        });
      } else if (action === "caption") {
        await api.useTrendCaptionStyle(video.id, target.projectId);
        const style = CAPTION_PRESETS.find((p) => p.id === xray?.image.captions.style);
        toast("Estilo de legenda aplicado!", {
          description: `Preset "${style?.name ?? xray?.image.captions.style}" definido para os cortes de "${target.label}".`,
        });
      } else if (action === "inspire") {
        const { jobId } = await api.inspireCut(video.id, target.projectId);
        toast("Corte inspirado em produção!", {
          description: `A IA está gerando um corte no formato deste viral em "${target.label}" (job ${jobId.slice(0, 8)}).`,
        });
      }
    } catch {
      toast("A ação falhou", { description: "Tente novamente.", variant: "error" });
    } finally {
      setActionLoading(false);
      setAction(null);
    }
  }

  if (error) {
    return (
      <EmptyState
        variant="radar"
        title="Não foi possível carregar o Raio-X"
        description="O vídeo pode ter sido removido do Radar."
        action={
          <div className="flex gap-2">
            <Button onClick={load}>Tentar novamente</Button>
            <Link href="/app/radar" className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm text-zinc-300 hover:text-white">
              Voltar ao Radar
            </Link>
          </div>
        }
      />
    );
  }

  const loading = !video || !xray;

  return (
    <div className="print-report mx-auto max-w-6xl space-y-6">
      <div className="no-print flex items-center justify-between gap-3">
        <Link
          href="/app/radar"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-lg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao Radar
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.print()}
          disabled={loading}
          aria-label="Exportar Raio-X em PDF"
        >
          <Printer className="h-4 w-4" aria-hidden /> Exportar PDF
        </Button>
      </div>
      <p className="hidden text-2xl font-bold text-white print:block">Raio-X — CortaAí</p>

      {/* Video header */}
      {loading ? (
        <div className="flex flex-col gap-5 md:flex-row">
          <Skeleton className="aspect-video w-full max-w-md rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="relative w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-line">
            <img src={video.thumbnailUrl} alt={`Thumbnail: ${video.title}`} className="aspect-video w-full object-cover" />
            <span className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2 py-0.5 text-xs text-white">
              <Clock className="mr-1 inline h-3 w-3" aria-hidden />
              {formatDuration(video.durationSeconds)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ScoreBadge score={video.retentionIndex} size="lg" label="Índice de Retenção" />
              <Badge variant="accent" className="capitalize">{video.niche}</Badge>
              <Badge variant="outline" className="capitalize">{video.platform}</Badge>
              <span className="text-xs text-zinc-500">{timeAgo(video.publishedAt, MOCK_NOW)}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold leading-tight text-white">{video.title}</h1>
            <p className="mt-1 text-sm text-zinc-400">{video.channel}</p>
            <div className="mt-4 flex flex-wrap gap-5 text-sm text-zinc-300">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-fuchsia-400" aria-hidden />
                <strong>{formatCompact(video.viewsPerHour)}</strong> views/hora
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-zinc-500" aria-hidden />
                {formatCompact(video.views)} views
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-rose-400" aria-hidden />
                {formatCompact(video.likes)} ({((video.likes / video.views) * 100).toFixed(1).replace(".", ",")}%)
              </span>
            </div>
            {/* Radar → production actions */}
            <div className="no-print mt-6 flex flex-wrap gap-2.5">
              <Button onClick={() => setAction("sound")} loading={actionLoading && action === "sound"}>
                <Music2 className="h-4 w-4" aria-hidden /> Usar este som em alta na trilha
              </Button>
              <Button variant="secondary" onClick={() => setAction("caption")} loading={actionLoading && action === "caption"}>
                <Captions className="h-4 w-4" aria-hidden /> Aplicar este estilo de legenda aos meus cortes
              </Button>
              <Button variant="outline" onClick={() => setAction("inspire")} loading={actionLoading && action === "inspire"}>
                <Wand2 className="h-4 w-4" aria-hidden /> Gerar corte inspirado neste formato
              </Button>
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <ExternalLink className="h-4 w-4" aria-hidden /> Ver original
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Retention timeline */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Activity className="mr-2 inline h-4 w-4 text-fuchsia-400" aria-hidden />
            Curva de retenção segundo a segundo
          </CardTitle>
          <p className="mt-1 text-xs text-zinc-500">
            Os pontos âmbar marcam eventos criativos (ex.: &ldquo;zoom + troca de música&rdquo;). Passe o mouse para ver cada marcador.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-[320px] w-full" /> : <RetentionChart data={xray.retentionTimeline} />}
          {!loading && (
            <div className="mt-4 flex flex-wrap gap-2">
              {xray.retentionTimeline
                .filter((p) => p.marker)
                .map((p) => (
                  <Badge key={p.second} variant="warning">
                    {formatDuration(p.second)} · {p.marker}
                  </Badge>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Som / Imagem / Estrutura */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <Volume2 className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden /> Som
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3.5">
                  <p className="text-xs text-zinc-400">Trilha</p>
                  <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-white">
                    {xray.sound.track}
                    {xray.sound.trackTrending && <Badge variant="success"><Sparkles className="h-3 w-3" /> em alta</Badge>}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="BPM" value={xray.sound.bpm} />
                  <Stat label="Energia" value={`${Math.round(xray.sound.energy * 100)}%`} />
                  <Stat label="Voz" value={`${xray.sound.voice.wordsPerMinute} palavras/min`} />
                  <Stat label="Tom" value={<span className="capitalize">{xray.sound.voice.tone}</span>} />
                </div>
                <Stat label="Pausas" value={<span className="capitalize">{xray.sound.voice.pauses}</span>} />
                <Stat
                  label="Efeitos sonoros"
                  value={
                    <span className="flex flex-wrap gap-1.5">
                      {xray.sound.soundEffects.map((e) => <Badge key={e} variant="outline">{e}</Badge>)}
                    </span>
                  }
                />
                <Stat
                  label="Silêncios estratégicos"
                  value={xray.sound.strategicSilences
                    .map((s) => `${formatDuration(s.atSecond)} (${s.durationMs}ms)`)
                    .join(" · ")}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <ImageIcon className="mr-2 inline h-4 w-4 text-fuchsia-400" aria-hidden /> Imagem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Cortes/minuto" value={xray.image.cutsPerMinute} icon={<Film className="h-3 w-3" aria-hidden />} />
                  <Stat label="Zoom punches" value={xray.image.zoomPunches} icon={<ZoomIn className="h-3 w-3" aria-hidden />} />
                </div>
                <Stat
                  label="Paleta dominante"
                  value={
                    <span className="flex items-center gap-2">
                      {xray.image.dominantPalette.map((c) => (
                        <span key={c} className="flex items-center gap-1">
                          <span className="h-5 w-5 rounded-md ring-1 ring-white/20" style={{ backgroundColor: c }} aria-hidden />
                          <span className="font-mono text-[10px] text-zinc-500">{c}</span>
                        </span>
                      ))}
                    </span>
                  }
                />
                <Stat
                  label="Legendas"
                  value={
                    xray.image.captions.present ? (
                      <>
                        Estilo <Badge variant="accent">{CAPTION_PRESETS.find((p) => p.id === xray.image.captions.style)?.name ?? xray.image.captions.style}</Badge>{" "}
                        · posição {xray.image.captions.position}
                      </>
                    ) : (
                      "sem legendas"
                    )
                  }
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Texto na tela" value={xray.image.onScreenText ? "Sim" : "Não"} />
                  <Stat label="Enquadramento" value={<span className="capitalize">{xray.image.framing}</span>} />
                </div>
                <Stat label="Iluminação" value={<span className="capitalize">{xray.image.lighting}</span>} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Timer className="mr-2 inline h-4 w-4 text-emerald-400" aria-hidden /> Estrutura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                  <p className="text-xs text-zinc-400">
                    Gancho <span className="capitalize">({xray.structure.hookType})</span>
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-white">&ldquo;{xray.structure.hookText}&rdquo;</p>
                </div>
                <Stat label="Arco narrativo" value={xray.structure.narrativeArc} />
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Duração ideal" value={`${xray.structure.idealDuration}s`} />
                  <Stat
                    label="Loop perfeito"
                    value={
                      xray.structure.perfectLoop ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300"><Repeat className="h-3.5 w-3.5" aria-hidden /> Sim</span>
                      ) : (
                        "Não"
                      )
                    }
                  />
                </div>
                <Stat label="CTA" value={<span>&ldquo;{xray.structure.cta}&rdquo;</span>} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Picker modals for the radar → production actions */}
      <PickerModal
        open={action === "sound"}
        onClose={() => setAction(null)}
        title="Aplicar som a um corte"
        description="Escolha o projeto e o corte que vai receber esta trilha em alta."
        mode="cut"
        onPick={handlePick}
      />
      <PickerModal
        open={action === "caption"}
        onClose={() => setAction(null)}
        title="Aplicar estilo de legenda"
        description="Escolha o projeto cujos cortes vão herdar este preset de legenda."
        mode="project"
        onPick={handlePick}
      />
      <PickerModal
        open={action === "inspire"}
        onClose={() => setAction(null)}
        title="Gerar corte inspirado"
        description="Escolha o projeto onde a IA vai gerar um corte seguindo este formato viral."
        mode="project"
        onPick={handlePick}
      />
    </div>
  );
}
