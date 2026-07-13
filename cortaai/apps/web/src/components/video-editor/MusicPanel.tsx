"use client";

// Música no Estúdio: importe a sua (arquivo de áudio) OU adicione uma trilha
// ORIGINAL gerada no aparelho (sem direitos autorais, entra no vídeo). Nada de
// Spotify — faixas protegidas não podem ir num vídeo exportado.

import { useState } from "react";
import { Loader2, Music2, Upload } from "lucide-react";
import { fileKind, registerBlob, registerFile } from "@/lib/video-editor/media-registry";
import { generateTrack, MUSIC_PRESETS } from "@/lib/video-editor/music-gen";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";

export function MusicPanel() {
  const addClipFromSource = useVideoEditor((s) => s.addClipFromSource);
  const [busy, setBusy] = useState<string | null>(null);

  async function importOwn(files: FileList | null) {
    if (!files) return;
    const audio = Array.from(files).filter((f) => fileKind(f) === "audio");
    if (audio.length === 0) {
      toast("Selecione um arquivo de áudio", { description: "MP3, WAV, M4A…", variant: "error" });
      return;
    }
    setBusy("import");
    try {
      for (const file of audio) {
        const src = await registerFile(file);
        if (src) addClipFromSource(src);
      }
      toast("Música adicionada à trilha de áudio");
    } finally {
      setBusy(null);
    }
  }

  async function addGenerated(presetId: string) {
    setBusy(presetId);
    try {
      const track = await generateTrack(presetId);
      if (!track) {
        toast("Não foi possível gerar a trilha neste navegador", { variant: "error" });
        return;
      }
      const source = await registerBlob(track.blob, track.name, "audio", track.durationMs);
      addClipFromSource(source);
      toast("Trilha gerada e adicionada", { description: track.name });
    } catch {
      toast("Falha ao gerar a trilha", { variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* importar a própria música */}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-1/60 px-3 py-3 text-xs font-medium text-zinc-300 hover:border-violet-500/50 hover:text-white">
        {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        Importar minha música
        <input
          type="file"
          accept="audio/*"
          multiple
          className="sr-only"
          aria-label="Importar música"
          onChange={(e) => {
            void importOwn(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          <Music2 className="h-3.5 w-3.5" aria-hidden /> Trilhas sem direitos autorais
        </p>
        <p className="mb-2 text-[11px] text-zinc-500">Geradas no seu aparelho — 100% livres para postar.</p>
        <div className="grid grid-cols-2 gap-2">
          {MUSIC_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => addGenerated(p.id)}
              disabled={busy !== null}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition-colors hover:border-violet-500/50 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <span className="text-lg" aria-hidden>
                {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : p.emoji}
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Músicas do Spotify não podem entrar no vídeo (são protegidas por direitos autorais). Use a sua própria
        faixa ou as trilhas geradas acima.
      </p>
    </div>
  );
}
