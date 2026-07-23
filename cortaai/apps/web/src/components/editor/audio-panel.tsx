"use client";

// Audio panel: -14 LUFS normalization, silence/filler removal, ducking and a
// music library.

import { Music2 } from "lucide-react";
import { mockMusicLibrary } from "@/lib/mock-data";
import { cn, formatDuration } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Switch } from "@/components/ui/switch";
import { AudioAdvanced } from "./audio-advanced";
import { AudioCapcutPanel } from "./audio-capcut";

export function AudioPanel() {
  const { doc, apply } = useEditorStore();
  const audio = doc.audio;

  function setAudio(patch: Partial<typeof audio>) {
    apply({ audio: { ...audio, ...patch } });
  }

  const library = mockMusicLibrary;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <Switch
          checked={audio.normalizeLufs}
          onChange={(v) => setAudio({ normalizeLufs: v })}
          label="Normalizar para -14 LUFS"
          description="Volume padrão das plataformas de vídeo curto"
        />
        <Switch
          checked={audio.removeSilence}
          onChange={(v) => setAudio({ removeSilence: v })}
          label="Remover silêncios e vícios de fala"
          description={'Corta pausas longas e muletas ("ééé", "tipo", "né")'}
        />
        <Switch
          checked={audio.ducking}
          onChange={(v) => setAudio({ ducking: v })}
          label="Ducking automático"
          description="Abaixa a música quando há fala"
        />
      </section>

      <AudioCapcutPanel />

      <AudioAdvanced />

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Trilha sonora
        </h3>
        <ul className="space-y-2" role="listbox" aria-label="Biblioteca de músicas">
          <li>
            <button
              role="option"
              aria-selected={audio.musicTrack === null}
              onClick={() => setAudio({ musicTrack: null })}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                audio.musicTrack === null ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line bg-surface-2 text-zinc-400 hover:border-violet-500/40",
              )}
            >
              Sem música (só a voz)
            </button>
          </li>
          {library.map((m) => (
            <li key={m.track}>
              <button
                role="option"
                aria-selected={audio.musicTrack === m.track}
                onClick={() => setAudio({ musicTrack: m.track })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  audio.musicTrack === m.track
                    ? "border-violet-500/60 bg-violet-500/10"
                    : "border-line bg-surface-2 hover:border-violet-500/40",
                )}
              >
                <Music2 className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">{m.track}</span>
                  <span className="text-xs text-zinc-500">
                    {`${m.mood} · ${m.bpm} BPM · ${formatDuration(m.duration)}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
