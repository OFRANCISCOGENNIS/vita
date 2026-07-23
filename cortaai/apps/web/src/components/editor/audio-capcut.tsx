"use client";

// Áudio CapCut: beat sync (marcadores de batida determinísticos + "cortar no
// ritmo"), redução de ruído, voice changer e extrair áudio (download simulado).
// Valores no EditorDoc (undo/redo). Marcadores de batida aparecem na timeline.
// INTEGRAÇÃO real: FFmpeg/backend — beat detection, denoise, pitch/voice e demux.

import { AudioWaveform, Download, Scissors, Volume2 } from "lucide-react";
import { VOICE_CHANGERS, beatTimes, type VoiceChangerId } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { toast } from "@/store/toast";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

export function AudioCapcutPanel() {
  const { cut, doc, setAudioCapcut, snapCutsToBeats } = useEditorStore();
  const ac = doc.audioCapcut;
  const duration = cut ? cut.endSeconds - cut.startSeconds : 0;
  const beats = ac.beatSync ? beatTimes(ac.bpm, duration) : [];

  function cutOnBeat() {
    const added = snapCutsToBeats();
    if (added > 0) toast(`${added} corte(s) alinhados à batida`, { variant: "success" });
    else toast("Nenhum corte novo — os limites já estão na batida", { variant: "info" });
  }

  // Extração de áudio simulada: gera um arquivo-marcador para download 100%
  // client-side (sem backend). INTEGRAÇÃO real: FFmpeg extrai a faixa .m4a/.wav.
  function extractAudio() {
    if (typeof window === "undefined" || !cut) return;
    const meta = [
      `# Áudio extraído (simulado) — CortaAí`,
      `corte: ${cut.title}`,
      `duração: ${duration.toFixed(1)}s`,
      `voice changer: ${ac.voiceChanger}`,
      `redução de ruído: ${ac.noiseReduction ? "sim" : "não"}`,
      `bpm: ${ac.bpm}`,
      ``,
      `# INTEGRAÇÃO real: FFmpeg entrega a faixa de áudio (.m4a/.wav).`,
    ].join("\n");
    const blob = new Blob([meta], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cut.title.replace(/[^\w.-]+/g, "_").slice(0, 40)}-audio.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Áudio extraído (arquivo de demonstração)", { variant: "success" });
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface-2/50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Áudio CapCut</h3>

      {/* Beat sync */}
      <div className="space-y-3 rounded-lg border border-line bg-surface-1/60 p-3">
        <Switch
          checked={ac.beatSync}
          onChange={(v) => setAudioCapcut({ beatSync: v })}
          label="Beat sync (detecção de batidas)"
          description="Marca as batidas da faixa na timeline"
        />
        {ac.beatSync && (
          <>
            <Slider
              label={`BPM (${ac.bpm})`}
              min={60}
              max={180}
              value={ac.bpm}
              onChange={(v) => setAudioCapcut({ bpm: v })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                <AudioWaveform className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                {beats.length} batidas detectadas
              </span>
              <button
                onClick={cutOnBeat}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <Scissors className="h-3 w-3" aria-hidden /> Cortar no ritmo
              </button>
            </div>
          </>
        )}
      </div>

      {/* Redução de ruído */}
      <Switch
        checked={ac.noiseReduction}
        onChange={(v) => setAudioCapcut({ noiseReduction: v })}
        label="Redução de ruído"
        description="Remove chiado e ruído de fundo constante"
      />

      {/* Voice changer */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Volume2 className="h-3.5 w-3.5" aria-hidden /> Voice changer
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Voice changer">
          {VOICE_CHANGERS.map((v) => (
            <button
              key={v.id}
              onClick={() => setAudioCapcut({ voiceChanger: v.id as VoiceChangerId })}
              aria-pressed={ac.voiceChanger === v.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                ac.voiceChanger === v.id ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
              )}
            >
              <span aria-hidden>{v.emoji}</span> {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Extrair áudio */}
      <button
        onClick={extractAudio}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        <Download className="h-3.5 w-3.5" aria-hidden /> Extrair áudio
      </button>
    </section>
  );
}
