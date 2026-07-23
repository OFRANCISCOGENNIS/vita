"use client";

// Painéis do redesign "Editor Profissional": cards de Ferramentas + painéis de
// Filtros/Efeitos/Transições/Texto que agem no CLIPE SELECIONADO, e o card de
// armazenamento REAL (navigator.storage.estimate). Nenhum botão falso: cada
// card executa uma ação real ou navega para a ferramenta correspondente.

import { useEffect, useState } from "react";
import {
  Aperture,
  AudioLines,
  Captions,
  Clapperboard,
  Eraser,
  Gauge,
  HardDrive,
  Mic2,
  Palette,
  Scissors,
  Snowflake,
  Sparkles,
  Stamp,
  Type as TypeIcon,
  Vibrate,
  Wand2,
  ZoomIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ensureBgVideoSegmenter, isBgVideoReady } from "@/lib/ai/video-segmenter";
import { CLIP_FILTERS, OVERLAY_EFFECTS } from "@/lib/video-editor/filters";
import { TRANSITIONS } from "@/lib/video-editor/transitions";
import { projectDurationMs } from "@/lib/video-editor/timeline-math";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";

export type RailPanel =
  | "ferramentas"
  | "midia"
  | "audio"
  | "texto"
  | "legendas"
  | "transicoes"
  | "filtros"
  | "efeitos"
  | "gravar";

// ------------------------------------------------------------------ helpers

function useSelectedClip() {
  const project = useVideoEditor((s) => s.project);
  const selectedClipId = useVideoEditor((s) => s.selectedClipId);
  if (!selectedClipId) return null;
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === selectedClipId);
    if (clip) return { track, clip };
  }
  return null;
}

function needClipToast() {
  toast("Selecione um clipe na timeline", {
    description: "Toque num clipe embaixo e tente de novo.",
    variant: "error",
  });
}

/** Abre a aba correspondente no painel Propriedades (e a gaveta no celular). */
function openProps(tab: "video" | "audio" | "anim" | "ajustes") {
  window.dispatchEvent(new CustomEvent("studio-props-tab", { detail: tab }));
  window.dispatchEvent(new CustomEvent("studio-open-sheet", { detail: "inspector" }));
}

// ------------------------------------------------------------- Ferramentas

export function ToolsPanel({ onNavigate }: { onNavigate: (panel: RailPanel) => void }) {
  const found = useSelectedClip();
  const updateClip = useVideoEditor((s) => s.updateClip);
  const splitAtPlayhead = useVideoEditor((s) => s.splitAtPlayhead);
  const freezeAtPlayhead = useVideoEditor((s) => s.freezeAtPlayhead);
  const addTextClip = useVideoEditor((s) => s.addTextClip);

  function velocidade() {
    if (!found) return needClipToast();
    openProps("audio");
    toast("Velocidade aberta", { description: "Use o controle Velocidade em Propriedades → Áudio." });
  }

  function animacoes() {
    if (!found) return needClipToast();
    openProps("anim");
    toast("Animações abertas", { description: "Ken Burns, entrada/saída e keyframes em Propriedades → Animação." });
  }

  function zoom() {
    if (!found) return needClipToast();
    updateClip(found.clip.id, { transform: { ...found.clip.transform, scale: Math.max(1.5, found.clip.transform.scale) } });
    openProps("video");
    toast("Zoom aplicado", { description: "Ajuste a área (Posição X/Y) em Propriedades → Vídeo." });
  }

  function estabilizar() {
    if (!found) return needClipToast();
    const s = Math.min(3, Math.max(1.08, found.clip.transform.scale * 1.06));
    updateClip(found.clip.id, { transform: { ...found.clip.transform, scale: s } });
    toast("Estabilização leve aplicada (por recorte)", {
      description: "Reduz o tremor cortando as bordas. Tremor forte só um app de desktop resolve — no navegador não dá para rastrear o movimento.",
      important: true,
    });
  }

  function melhorarAudio() {
    if (!found) return needClipToast();
    updateClip(found.clip.id, { audioFx: { denoise: true, voice: true } });
    openProps("audio");
    toast("Melhorar áudio ativado no clipe", {
      description: "Reduzir ruído + aprimorar voz — aplicados no arquivo exportado.",
    });
  }

  function cortar() {
    const count = (p: ReturnType<typeof useVideoEditor.getState>["project"]) =>
      p.tracks.reduce((n, t) => n + t.clips.length, 0);
    const before = count(useVideoEditor.getState().project);
    splitAtPlayhead();
    const after = count(useVideoEditor.getState().project);
    if (after > before) toast("Vídeo dividido no cursor");
    else
      toast("Nada para dividir aqui", {
        description: "Mova o cursor da linha do tempo para cima de um clipe.",
        variant: "error",
      });
  }

  function colorGrading() {
    if (!found) return needClipToast();
    openProps("video");
    toast("Cor (grading) aberto", { description: "Ajuste brilho, contraste, saturação e matiz em Propriedades." });
  }

  function congelar() {
    freezeAtPlayhead();
  }

  function removerFundo() {
    if (!found) return needClipToast();
    updateClip(found.clip.id, { bgRemove: true });
    if (!isBgVideoReady()) {
      toast("Baixando a IA de recorte (~3 MB)…", {
        description: "O fundo some assim que o modelo carregar. Fica em cache para as próximas vezes.",
        important: true,
      });
    }
    void ensureBgVideoSegmenter().then((ok) => {
      if (!ok)
        toast("A IA de recorte não carregou", {
          description: "Verifique a internet e tente de novo — o clipe fica com o fundo até a IA carregar.",
          variant: "error",
        });
    });
    openProps("video");
  }

  function marcaDagua() {
    const id = addTextClip("© Sua marca");
    const dur = Math.max(3000, projectDurationMs(useVideoEditor.getState().project.tracks));
    updateClip(id, {
      startInTimeline: 0,
      duration: dur,
      trimOut: dur,
      transform: { x: 0.32, y: -0.42, scale: 0.55, rotation: 0, opacity: 0.55 },
    });
    openProps("video");
    toast("Marca d'água adicionada", { description: "Edite o texto e a posição em Propriedades." });
  }

  const TOOLS: { icon: typeof Scissors; title: string; sub: string; onClick: () => void; accent?: string }[] = [
    { icon: AudioLines, title: "Melhorar Áudio", sub: "Reduza ruídos e melhore clareza", onClick: melhorarAudio },
    { icon: Scissors, title: "Cortes", sub: "Divida o clipe no cursor", onClick: cortar },
    { icon: Clapperboard, title: "Transições", sub: "Adicione transições incríveis", onClick: () => onNavigate("transicoes") },
    { icon: Sparkles, title: "Efeitos", sub: "Aplique efeitos visuais", onClick: () => onNavigate("efeitos") },
    { icon: Aperture, title: "Filtros", sub: "Ajuste a cor do seu vídeo", onClick: () => onNavigate("filtros") },
    { icon: TypeIcon, title: "Texto", sub: "Adicione textos e títulos", onClick: () => onNavigate("texto") },
    { icon: Captions, title: "Legendas", sub: "Gere e edite legendas", onClick: () => onNavigate("legendas") },
    { icon: Eraser, title: "Remover Fundo", sub: "IA sem tela verde (novo!)", onClick: removerFundo, accent: "bg-emerald-400/10 text-emerald-300" },
    { icon: Stamp, title: "Marca d'água", sub: "Adicione sua marca d'água", onClick: marcaDagua },
    { icon: Palette, title: "Color Grading", sub: "Ajuste cores como um pro", onClick: colorGrading },
    { icon: Gauge, title: "Velocidade", sub: "Altere a velocidade do vídeo", onClick: velocidade },
    { icon: Snowflake, title: "Congelar Frame", sub: "Pause a imagem no cursor", onClick: congelar },
    { icon: Wand2, title: "Animações", sub: "Adicione animações e keyframes", onClick: animacoes },
    { icon: Mic2, title: "Narração (IA)", sub: "Texto vira voz em português", onClick: () => onNavigate("audio") },
    { icon: Vibrate, title: "Estabilizar", sub: "Reduza tremores da imagem", onClick: estabilizar },
    { icon: ZoomIn, title: "Zoom", sub: "Aplique zoom em áreas específicas", onClick: zoom },
  ];

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {TOOLS.map((t, i) => (
        <button
          key={t.title}
          onClick={t.onClick}
          style={{ animationDelay: `${i * 25}ms` }}
          className="anim-rise group flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] px-1.5 py-2 text-center transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_8px_24px_-12px_rgba(139,92,246,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:hover:translate-y-0"
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300 transition-colors group-hover:bg-violet-500/20",
              t.accent,
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-[10.5px] font-semibold leading-tight text-zinc-200">{t.title}</span>
          <span className="text-[9px] leading-tight text-zinc-500">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- Texto

export function TextPanel() {
  const addTextClip = useVideoEditor((s) => s.addTextClip);
  const updateClip = useVideoEditor((s) => s.updateClip);

  const PRESETS: { id: string; name: string; sample: string; apply: () => void }[] = [
    {
      id: "titulo",
      name: "Título",
      sample: "Aa",
      apply: () => {
        addTextClip("Seu título");
      },
    },
    {
      id: "legenda",
      name: "Legenda com fundo",
      sample: "Aa",
      apply: () => {
        const id = addTextClip("Sua legenda aqui");
        updateClip(id, {
          text: { content: "Sua legenda aqui", fontFamily: "Inter", color: "#ffffff", fontWeight: 700, background: "rgba(0,0,0,0.75)" },
          transform: { x: 0, y: 0.32, scale: 0.8, rotation: 0, opacity: 1 },
        });
      },
    },
    {
      id: "destaque",
      name: "Destaque amarelo",
      sample: "Aa",
      apply: () => {
        const id = addTextClip("DESTAQUE");
        updateClip(id, {
          text: { content: "DESTAQUE", fontFamily: "Inter", color: "#facc15", fontWeight: 800, background: null },
        });
      },
    },
  ];

  return (
    <div className="space-y-2">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => {
            p.apply();
            toast("Texto adicionado no cursor", { description: "Edite o conteúdo em Propriedades." });
          }}
          className="hover-lift flex w-full items-center gap-3 rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-left transition-colors hover:border-violet-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-extrabold",
              p.id === "destaque" ? "bg-yellow-400/15 text-yellow-300" : p.id === "legenda" ? "bg-black text-white ring-1 ring-white/20" : "bg-violet-500/15 text-violet-200",
            )}
          >
            {p.sample}
          </span>
          <span className="text-xs font-medium text-zinc-200">{p.name}</span>
        </button>
      ))}
      <p className="text-[10px] leading-relaxed text-zinc-600">O texto entra no cursor da linha do tempo. Edite conteúdo, cor e posição em Propriedades.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Filtros

export function FiltersPanel() {
  const found = useSelectedClip();
  const updateClip = useVideoEditor((s) => s.updateClip);
  if (!found || found.track.type === "audio" || found.clip.text) {
    return <EmptyHint text="Selecione um clipe de vídeo ou imagem na timeline para aplicar um filtro." />;
  }
  const { clip } = found;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {CLIP_FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => updateClip(clip.id, { filterId: f.id === "none" ? undefined : f.id })}
          aria-pressed={(clip.filterId ?? "none") === f.id}
          className={cn(
            "rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors",
            (clip.filterId ?? "none") === f.id
              ? "border-violet-400 bg-violet-500/20 text-white"
              : "border-line bg-surface-1 text-zinc-400 hover:text-white",
          )}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Efeitos

export function EffectsPanel() {
  const found = useSelectedClip();
  const updateClip = useVideoEditor((s) => s.updateClip);
  if (!found || found.track.type === "audio" || found.clip.text) {
    return <EmptyHint text="Selecione um clipe de vídeo ou imagem na timeline para aplicar efeitos." />;
  }
  const { clip } = found;
  return (
    <div className="space-y-1.5">
      {OVERLAY_EFFECTS.map((fx) => {
        const active = clip.effects.find((e) => e.id === fx.id);
        return (
          <div key={fx.id} className="flex items-center gap-2">
            <button
              onClick={() =>
                updateClip(clip.id, {
                  effects: active ? clip.effects.filter((e) => e.id !== fx.id) : [...clip.effects, { id: fx.id, intensity: 0.6 }],
                })
              }
              aria-pressed={!!active}
              className={cn(
                "min-w-[110px] rounded-xl border px-2.5 py-2 text-left text-[11px] font-medium transition-colors",
                active ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
              )}
            >
              {fx.name}
            </button>
            {active && (
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={active.intensity}
                onChange={(e) =>
                  updateClip(clip.id, { effects: clip.effects.map((ef) => (ef.id === fx.id ? { ...ef, intensity: Number(e.target.value) } : ef)) })
                }
                aria-label={`Intensidade de ${fx.name}`}
                className="min-w-0 flex-1 accent-violet-500"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------- Transições

export function TransitionsPanel() {
  const found = useSelectedClip();
  const updateClip = useVideoEditor((s) => s.updateClip);
  if (!found || found.track.type === "audio") {
    return <EmptyHint text="Selecione o SEGUNDO clipe (o da direita) para criar a transição com o anterior." />;
  }
  const { clip } = found;
  return (
    <div className="space-y-2">
      <div className="stagger-in grid grid-cols-2 gap-1.5">
        <button
          onClick={() => updateClip(clip.id, { transitionIn: undefined })}
          aria-pressed={!clip.transitionIn}
          className={cn(
            "rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors",
            !clip.transitionIn ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
          )}
        >
          Nenhuma
        </button>
        {TRANSITIONS.map((t) => (
          <button
            key={t.id}
            onClick={() => updateClip(clip.id, { transitionIn: { id: t.id, durationMs: clip.transitionIn?.durationMs ?? 600 } })}
            aria-pressed={clip.transitionIn?.id === t.id}
            className={cn(
              "rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors",
              clip.transitionIn?.id === t.id ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
            )}
          >
            {t.name}
          </button>
        ))}
      </div>
      {clip.transitionIn && (
        <label className="block">
          <span className="flex items-center justify-between text-[11px] text-zinc-400">
            Duração
            <span className="font-mono text-zinc-500">{((clip.transitionIn.durationMs ?? 600) / 1000).toFixed(1)}s</span>
          </span>
          <input
            type="range"
            min={200}
            max={2000}
            step={50}
            value={clip.transitionIn.durationMs}
            onChange={(e) => updateClip(clip.id, { transitionIn: { id: clip.transitionIn!.id, durationMs: Number(e.target.value) } })}
            aria-label="Duração da transição"
            className="mt-1 w-full accent-violet-500"
          />
        </label>
      )}
      <p className="text-[10px] leading-relaxed text-zinc-600">A transição acontece ENTRE este clipe e o anterior colado a ele na mesma trilha.</p>
    </div>
  );
}

// ------------------------------------------------------------- Armazenamento

export function StorageCard({ onManage }: { onManage?: () => void }) {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    let alive = true;
    try {
      void navigator.storage?.estimate?.().then((e) => {
        if (alive && e && typeof e.usage === "number" && typeof e.quota === "number" && e.quota > 0) {
          setEst({ usage: e.usage, quota: e.quota });
        }
      });
    } catch {
      /* sem suporte */
    }
    return () => {
      alive = false;
    };
  }, []);
  if (!est) return null;
  const pct = Math.min(100, Math.round((est.usage / est.quota) * 100));
  const gb = (n: number) => (n / 1024 ** 3 >= 1 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);
  return (
    <div className="rounded-xl border border-line bg-surface-1/60 p-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <HardDrive className="h-3 w-3" aria-hidden /> Armazenamento
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-zinc-500">
        {pct}% usado · {gb(est.usage)} de {gb(est.quota)}
      </p>
      {onManage && (
        <button
          onClick={onManage}
          className="mt-2 w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-[10px] font-medium text-zinc-300 transition-colors hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Gerenciar armazenamento
        </button>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-dashed border-line px-3 py-4 text-xs leading-relaxed text-zinc-500">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" aria-hidden />
      {text}
    </p>
  );
}
