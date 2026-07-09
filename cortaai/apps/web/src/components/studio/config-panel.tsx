"use client";

// Central configuration panel for the Estúdio IA. Renders a distinct, tailored
// form per selected tool and a prominent "Gerar" action that enqueues the
// generation into the studio store (client-simulated progress). Heavy bits
// (Motion Brush canvas) are lazy-loaded via next/dynamic.

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Music, Sparkles, Trash2, Wand2 } from "lucide-react";
import * as api from "@/lib/api";
import type {
  CameraMove,
  CameraMoveType,
  EffectTemplate,
  EffectTemplateId,
  ExtendDirection,
  Generation,
  LipSyncSource,
  MotionBrushStroke,
  StudioAspectRatio,
  StudioFunction,
  StudioStyle,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { useStudioStore } from "@/store/studio";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { ImageDropzone } from "./image-dropzone";
import { SourcePicker, type StudioSource } from "./source-picker";
import {
  CAMERA_MOVE_TYPE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  STUDIO_TOOLS,
  TTS_VOICES,
} from "./tools";

const MotionBrushCanvas = dynamic(() => import("./motion-brush-canvas"), {
  ssr: false,
  loading: () => <Skeleton className="aspect-video w-full" />,
});

// ---------------------------------------------------------------- shared bits

function Textarea({
  value,
  onChange,
  placeholder,
  label,
  rows = 4,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  rows?: number;
  id?: string;
}) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors hover:border-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-zinc-300">{label}</span>
      {children}
    </div>
  );
}

/** The "Gerar" action bar shared by every form. */
function GenerateBar({
  disabled,
  hint,
  onGenerate,
}: {
  disabled: boolean;
  hint?: string;
  onGenerate: () => Promise<Generation | null>;
}) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="sticky bottom-0 -mx-5 mt-6 flex items-center justify-between gap-3 border-t border-line bg-surface-1/95 px-5 pt-4 backdrop-blur">
      <p className="text-xs text-zinc-500">{hint ?? "Renderizado no nosso motor de vídeo (FFmpeg); aparece em Gerações recentes com progresso ao vivo."}</p>
      <Button
        onClick={async () => {
          setSubmitting(true);
          try {
            await onGenerate();
          } finally {
            setSubmitting(false);
          }
        }}
        disabled={disabled}
        loading={submitting}
        className="shrink-0"
      >
        <Wand2 className="h-4 w-4" aria-hidden /> Gerar
      </Button>
    </div>
  );
}

const ASPECTS: StudioAspectRatio[] = ["9:16", "1:1", "16:9", "4:5"];
const STYLES: StudioStyle[] = ["cinematográfico", "anime", "realista", "3D"];

// ---------------------------------------------------------------- 1. Texto → Vídeo

function TextToVideoForm() {
  const enqueue = useStudioStore((s) => s.enqueue);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<StudioAspectRatio>("9:16");
  const [duration, setDuration] = useState(5);
  const [style, setStyle] = useState<StudioStyle>("cinematográfico");
  const [cameraMovement, setCameraMovement] = useState("zoom_in");
  const [negativePrompt, setNegativePrompt] = useState("");

  return (
    <div className="space-y-5">
      <Textarea
        id="ttv-prompt"
        label="Descrição da cena"
        rows={4}
        value={prompt}
        onChange={setPrompt}
        placeholder="Ex.: um foguete artesanal decolando de uma favela colorida ao amanhecer, câmera subindo junto…"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Proporção">
          <div className="grid grid-cols-4 gap-1.5">
            {ASPECTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAspectRatio(a)}
                aria-pressed={aspectRatio === a}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  aspectRatio === a
                    ? "border-violet-500 bg-violet-500/15 text-white"
                    : "border-line text-zinc-400 hover:text-white",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Estilo visual">
          <Select value={style} onChange={(e) => setStyle(e.target.value as StudioStyle)} aria-label="Estilo visual">
            {STYLES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label={`Duração: ${duration}s`} min={3} max={10} value={duration} onChange={setDuration} aria-label="Duração em segundos" />
        <Field label="Movimento de câmera">
          <Select value={cameraMovement} onChange={(e) => setCameraMovement(e.target.value)} aria-label="Movimento de câmera">
            {CAMERA_MOVEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Textarea
        id="ttv-neg"
        label="Prompt negativo (opcional)"
        rows={2}
        value={negativePrompt}
        onChange={setNegativePrompt}
        placeholder="Ex.: borrado, distorcido, texto na tela, marca d'água…"
      />
      <GenerateBar
        disabled={!prompt.trim()}
        hint={!prompt.trim() ? "Descreva a cena para gerar." : undefined}
        onGenerate={() =>
          enqueue(() =>
            api.studioTextToVideo(prompt.trim(), {
              aspectRatio,
              duration,
              style,
              cameraMovement: cameraMovement as never,
              negativePrompt: negativePrompt.trim(),
            }),
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- 2. Imagem → Vídeo

function ImageToVideoForm() {
  const enqueue = useStudioStore((s) => s.enqueue);
  const [image, setImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [motion, setMotion] = useState<"sutil" | "moderado" | "intenso">("moderado");
  const [duration, setDuration] = useState(5);
  const [cameraMovement, setCameraMovement] = useState("none");

  return (
    <div className="space-y-5">
      <ImageDropzone label="Imagem de origem" value={image} onChange={setImage} sampleLabel="Retrato de estúdio" sampleNiche="beleza" />
      <Textarea
        id="itv-prompt"
        label="Prompt de movimento (opcional)"
        rows={2}
        value={prompt}
        onChange={setPrompt}
        placeholder="Ex.: cabelo balançando ao vento, olhos piscando suavemente…"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Intensidade do movimento">
          <div className="grid grid-cols-3 gap-1.5">
            {(["sutil", "moderado", "intenso"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotion(m)}
                aria-pressed={motion === m}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  motion === m ? "border-violet-500 bg-violet-500/15 text-white" : "border-line text-zinc-400 hover:text-white",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Movimento de câmera">
          <Select value={cameraMovement} onChange={(e) => setCameraMovement(e.target.value)} aria-label="Movimento de câmera">
            {CAMERA_MOVEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Slider label={`Duração: ${duration}s`} min={3} max={10} value={duration} onChange={setDuration} aria-label="Duração em segundos" />
      <GenerateBar
        disabled={!image}
        hint={!image ? "Envie uma imagem para gerar." : undefined}
        onGenerate={() =>
          enqueue(() =>
            api.studioImageToVideo(image!, prompt.trim() || null, { motion, duration, cameraMovement: cameraMovement as never }),
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- 3. Extensão de clipe

function ExtendForm() {
  const enqueue = useStudioStore((s) => s.enqueue);
  const [source, setSource] = useState<StudioSource | null>(null);
  const [seconds, setSeconds] = useState(4);
  const [loop, setLoop] = useState(false);

  return (
    <div className="space-y-5">
      <SourcePicker value={source} onChange={setSource} label="Clipe a estender" />
      <Slider label={`Segundos a acrescentar: ${seconds}s`} min={2} max={10} value={seconds} onChange={setSeconds} aria-label="Segundos a acrescentar" />
      <Switch
        checked={loop}
        onChange={setLoop}
        label="Loop perfeito"
        description={loop ? "Fecha o movimento para repetir sem corte." : "Continua a cena para frente."}
      />
      <GenerateBar
        disabled={!source}
        hint={!source ? "Escolha um clipe de origem." : undefined}
        onGenerate={() =>
          enqueue(() =>
            api.studioExtend(
              { cutId: source?.cutId ?? null, generationId: source?.generationId ?? null },
              { seconds, direction: (loop ? "loop" : "forward") as ExtendDirection },
            ),
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- 4. Quadro inicial e final

function FramesForm() {
  const enqueue = useStudioStore((s) => s.enqueue);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [duration, setDuration] = useState(5);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageDropzone label="Quadro inicial" value={start} onChange={setStart} sampleLabel="Quadro inicial" sampleNiche="humor" />
        <ImageDropzone label="Quadro final" value={end} onChange={setEnd} sampleLabel="Quadro final" sampleNiche="tecnologia" />
      </div>
      <Slider label={`Duração da transição: ${duration}s`} min={3} max={10} value={duration} onChange={setDuration} aria-label="Duração da transição" />
      <GenerateBar
        disabled={!start || !end}
        hint={!start || !end ? "Envie os dois quadros (início e fim)." : undefined}
        onGenerate={() => enqueue(() => api.studioFrames(start!, end!, { duration }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 5. Motion Brush

function MotionBrushForm() {
  const enqueue = useStudioStore((s) => s.enqueue);
  const [image, setImage] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<MotionBrushStroke[]>([]);
  const [intensity, setIntensity] = useState(70);
  const [duration, setDuration] = useState(5);

  return (
    <div className="space-y-5">
      {!image ? (
        <ImageDropzone label="Imagem base" value={image} onChange={setImage} sampleLabel="Cachoeira" sampleNiche="fitness" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">Pincele o movimento</span>
            <button
              type="button"
              onClick={() => {
                setImage(null);
                setStrokes([]);
              }}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Trocar imagem
            </button>
          </div>
          <MotionBrushCanvas
            imageUrl={image}
            strokes={strokes}
            onChange={setStrokes}
            intensity={intensity}
            onIntensityChange={setIntensity}
          />
        </div>
      )}
      <Slider label={`Duração: ${duration}s`} min={3} max={10} value={duration} onChange={setDuration} aria-label="Duração em segundos" />
      <GenerateBar
        disabled={!image || strokes.length === 0}
        hint={!image ? "Envie uma imagem base." : strokes.length === 0 ? "Pincele ao menos um traço de movimento." : undefined}
        onGenerate={() => enqueue(() => api.studioMotionBrush(image!, { strokes, duration }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 6. Lip Sync

function LipSyncForm() {
  const enqueue = useStudioStore((s) => s.enqueue);
  const [target, setTarget] = useState<StudioSource | null>(null);
  const [mode, setMode] = useState<LipSyncSource>("ttsText");
  const [ttsText, setTtsText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voice, setVoice] = useState(TTS_VOICES[0].value);
  const [language, setLanguage] = useState("pt-BR");

  const missingAudio = mode === "audioUrl" && !audioUrl;
  const missingText = mode === "ttsText" && !ttsText.trim();

  return (
    <div className="space-y-5">
      <SourcePicker value={target} onChange={setTarget} label="Vídeo/corte de destino" />
      <p className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-500">
        O lip-sync roda no nosso motor de vídeo: a fala (texto ou áudio) é sincronizada com
        legenda e forma de onda. É uma aproximação honesta — lip-sync fotorrealista exigiria um
        modelo externo.
      </p>
      <Field label="Origem da fala">
        <Tabs
          tabs={[
            { id: "ttsText", label: "Texto (TTS)" },
            { id: "audioUrl", label: "Áudio" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as LipSyncSource)}
        />
      </Field>

      {mode === "ttsText" ? (
        <>
          <Textarea
            id="lip-text"
            label="Texto para narrar"
            rows={3}
            value={ttsText}
            onChange={setTtsText}
            placeholder="Ex.: Comenta EU QUERO aqui embaixo que eu te mando o material completo!"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Voz (pt-BR)">
              <Select value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="Voz">
                {TTS_VOICES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Idioma">
              <Select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Idioma">
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
              </Select>
            </Field>
          </div>
        </>
      ) : (
        <AudioDrop value={audioUrl} onChange={setAudioUrl} />
      )}

      <GenerateBar
        disabled={!target || missingAudio || missingText}
        hint={
          !target
            ? "Escolha o vídeo de destino."
            : missingText
              ? "Escreva o texto a narrar."
              : missingAudio
                ? "Envie um arquivo de áudio."
                : undefined
        }
        onGenerate={() =>
          enqueue(() =>
            api.studioLipSync(
              { cutId: target?.cutId ?? null, inputAssetUrl: target?.inputAssetUrl ?? null },
              { source: mode, ttsText: mode === "ttsText" ? ttsText.trim() : "", voice, language },
            ),
          )
        }
      />
    </div>
  );
}

function AudioDrop({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <Field label="Arquivo de áudio">
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
          <Music className="h-5 w-5 text-violet-300" aria-hidden />
          <span className="flex-1 truncate text-sm text-zinc-200">Áudio carregado</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
          >
            Remover
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line bg-surface-2 px-3.5 py-3 text-sm text-zinc-400 hover:border-zinc-600 focus-within:ring-2 focus-within:ring-violet-400">
          <Music className="h-5 w-5" aria-hidden />
          Clique para enviar um .mp3 / .wav
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onChange(URL.createObjectURL(f));
            }}
          />
        </label>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------- 7. Movimentos de câmera

function CameraForm() {
  const enqueue = useStudioStore((s) => s.enqueue);
  const [target, setTarget] = useState<StudioSource | null>(null);
  const [moves, setMoves] = useState<CameraMove[]>([{ type: "zoom_in", startSecond: 0, endSecond: 3 }]);

  function updateMove(i: number, patch: Partial<CameraMove>) {
    setMoves((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }

  return (
    <div className="space-y-5">
      <SourcePicker value={target} onChange={setTarget} label="Vídeo/corte de destino (opcional)" />

      <Field label="Sequência de movimentos">
        <ul className="space-y-2">
          {moves.map((m, i) => (
            <li key={i} className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs font-semibold text-violet-200">
                  {i + 1}
                </span>
                <Select
                  className="h-9"
                  value={m.type}
                  onChange={(e) => updateMove(i, { type: e.target.value as CameraMoveType })}
                  aria-label={`Tipo do movimento ${i + 1}`}
                >
                  {CAMERA_MOVE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setMoves((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remover movimento ${i + 1}`}
                  disabled={moves.length === 1}
                  className="rounded-lg p-2 text-zinc-500 hover:text-rose-400 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-400">
                  Início (s)
                  <input
                    type="number"
                    min={0}
                    max={m.endSecond}
                    value={m.startSecond}
                    onChange={(e) => updateMove(i, { startSecond: Math.max(0, Number(e.target.value)) })}
                    className="mt-1 h-9 w-full rounded-lg border border-line bg-surface-1 px-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Fim (s)
                  <input
                    type="number"
                    min={m.startSecond}
                    value={m.endSecond}
                    onChange={(e) => updateMove(i, { endSecond: Number(e.target.value) })}
                    className="mt-1 h-9 w-full rounded-lg border border-line bg-surface-1 px-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => {
            const last = moves[moves.length - 1];
            const start = last ? last.endSecond : 0;
            setMoves((prev) => [...prev, { type: "pan_left", startSecond: start, endSecond: start + 3 }]);
          }}
        >
          + Adicionar movimento
        </Button>
      </Field>

      <GenerateBar
        disabled={moves.length === 0}
        onGenerate={() =>
          enqueue(() =>
            api.studioCamera({ cutId: target?.cutId ?? null, inputAssetUrl: target?.inputAssetUrl ?? null }, { moves }),
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- 8. Templates de efeito

function EffectTemplateForm() {
  const enqueue = useStudioStore((s) => s.enqueue);
  const [templates, setTemplates] = useState<EffectTemplate[] | null>(null);
  const [selected, setSelected] = useState<EffectTemplateId | null>(null);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.studioEffectTemplates().then((r) => {
      if (active) setTemplates(r.templates);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <Field label="Escolha um efeito">
        {templates === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                aria-pressed={selected === t.id}
                className={cn(
                  "group overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  selected === t.id ? "border-violet-500 ring-2 ring-violet-500/40" : "border-line hover:border-zinc-600",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.thumbnailUrl} alt={t.label} className="aspect-video w-full object-cover" />
                <span className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-zinc-200">
                  <Sparkles className="h-3 w-3 text-violet-300" aria-hidden /> {t.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </Field>

      <ImageDropzone label="Imagem de origem" value={image} onChange={setImage} sampleLabel="Foto de origem" sampleNiche="beleza" />

      <GenerateBar
        disabled={!selected || !image}
        hint={!selected ? "Selecione um efeito." : !image ? "Envie uma imagem de origem." : undefined}
        onGenerate={() => enqueue(() => api.studioEffect(image!, { template: selected! }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------- panel shell

const FORMS: Record<StudioFunction, () => JSX.Element> = {
  text_to_video: TextToVideoForm,
  image_to_video: ImageToVideoForm,
  extend: ExtendForm,
  frames: FramesForm,
  motion_brush: MotionBrushForm,
  lip_sync: LipSyncForm,
  camera: CameraForm,
  effect_template: EffectTemplateForm,
};

export function ConfigPanel({ fn }: { fn: StudioFunction }) {
  const meta = STUDIO_TOOLS.find((t) => t.fn === fn)!;
  const Icon = meta.icon;
  const Form = FORMS[fn];
  return (
    <div className="rounded-2xl border border-line bg-surface-1 shadow-card">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20 text-violet-200 ring-1 ring-inset ring-violet-500/30">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">{meta.label}</h2>
          <p className="text-xs text-zinc-500">{meta.description}</p>
        </div>
      </div>
      <div className="px-5 py-5">
        <Form />
      </div>
    </div>
  );
}
