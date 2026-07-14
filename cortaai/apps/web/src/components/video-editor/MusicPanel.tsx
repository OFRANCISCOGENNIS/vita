"use client";

// Música no Estúdio: importe a sua (arquivo de áudio) OU adicione uma trilha
// ORIGINAL gerada no aparelho (sem direitos autorais, entra no vídeo). Nada de
// Spotify — faixas protegidas não podem ir num vídeo exportado.

import { useState } from "react";
import { Loader2, Mic2, Music2, Upload } from "lucide-react";
import { fileKind, registerBlob, registerFile } from "@/lib/video-editor/media-registry";
import { generateSfx, generateTrack, MUSIC_PRESETS, SFX_PRESETS } from "@/lib/video-editor/music-gen";
import { generateSpeech, TTS_VOICES } from "@/lib/ai/tts";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";

export function MusicPanel() {
  const addClipFromSource = useVideoEditor((s) => s.addClipFromSource);
  const [busy, setBusy] = useState<string | null>(null);
  const [ttsText, setTtsText] = useState("");
  const [ttsVoice, setTtsVoice] = useState(TTS_VOICES[0].id);

  async function addNarration() {
    if (!ttsText.trim()) {
      toast("Digite o texto da narração", { variant: "error" });
      return;
    }
    setBusy("tts");
    try {
      const result = await generateSpeech(ttsText, ttsVoice, (p) => setBusy(p.message));
      const source = await registerBlob(result.blob, "Narração (IA)", "audio", result.durationMs);
      addClipFromSource(source);
      toast("Narração adicionada à timeline", { description: `${(result.durationMs / 1000).toFixed(1)}s de fala gerada no aparelho.` });
      setTtsText("");
    } catch {
      toast("Falha ao gerar a narração", {
        description: "A voz de IA (~80 MB) baixa na 1ª vez e precisa de internet estável. Tente de novo.",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  }

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

  async function addGenerated(presetId: string, kind: "music" | "sfx") {
    setBusy(presetId);
    try {
      const track = kind === "music" ? await generateTrack(presetId) : await generateSfx(presetId);
      if (!track) {
        toast("Não foi possível gerar o áudio neste navegador", { variant: "error" });
        return;
      }
      const source = await registerBlob(track.blob, track.name, "audio", track.durationMs);
      addClipFromSource(source);
      toast(kind === "music" ? "Trilha gerada e adicionada" : "Efeito sonoro adicionado", { description: track.name });
    } catch {
      toast("Falha ao gerar o áudio", { variant: "error" });
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
          {MUSIC_PRESETS.map((p, i) => (
            <button
              key={p.id}
              style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => addGenerated(p.id, "music")}
              disabled={busy !== null}
              className="anim-rise hover-lift flex items-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition-colors hover:border-violet-500/50 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <span className="text-lg" aria-hidden>
                {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : p.emoji}
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Efeitos sonoros</p>
        <div className="flex flex-wrap gap-1.5">
          {SFX_PRESETS.map((p, i) => (
            <button
              key={p.id}
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={() => addGenerated(p.id, "sfx")}
              disabled={busy !== null}
              className="anim-pop inline-flex items-center gap-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-violet-500/50 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <span aria-hidden>{busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : p.emoji}</span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          <Mic2 className="h-3.5 w-3.5" aria-hidden /> Narração (IA)
        </p>
        <textarea
          rows={2}
          value={ttsText}
          onChange={(e) => setTtsText(e.target.value)}
          placeholder="Digite o texto que a voz vai falar…"
          aria-label="Texto da narração"
          className="w-full rounded-xl border border-line bg-surface-1 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={ttsVoice}
            onChange={(e) => setTtsVoice(e.target.value)}
            aria-label="Voz da narração"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {TTS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void addNarration()}
            disabled={busy !== null}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:from-violet-500 hover:to-fuchsia-500 active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {busy && busy !== "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mic2 className="h-3.5 w-3.5" aria-hidden />}
            Gerar
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
          Voz de IA gerada no seu aparelho (baixa ~80 MB na 1ª vez). Vozes em português incluídas.
        </p>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Músicas do Spotify não podem entrar no vídeo (são protegidas por direitos autorais). Use a sua própria
        faixa ou as trilhas geradas acima.
      </p>
    </div>
  );
}
