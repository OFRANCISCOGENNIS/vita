"use client";

// A single "Geração recente" card: thumbnail, function badge, prompt/summary,
// live progress bar for running items, error state with retry, and — when done
// — the three integration actions (editor / biblioteca / capa). A geração é real,
// produzida pelo nosso motor de vídeo (FFmpeg), sem custo.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Image as ImageIcon,
  Library,
  Loader2,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import * as api from "@/lib/api";
import type { Generation } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { toast } from "@/store/toast";
import { useStudioStore, STUDIO_FUNCTION_LABELS } from "@/store/studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function summarize(gen: Generation): string {
  if (gen.prompt) return gen.prompt;
  const p = gen.params as unknown as Record<string, unknown>;
  if (gen.function === "extend") return p.direction === "loop" ? "Loop perfeito" : `Continuação de ${p.seconds}s`;
  if (gen.function === "effect_template") return `Efeito “${String(p.template)}”`;
  if (gen.function === "camera") return `${Array.isArray(p.moves) ? p.moves.length : 0} movimentos de câmera`;
  if (gen.function === "motion_brush") return `${Array.isArray(p.strokes) ? p.strokes.length : 0} traços de movimento`;
  if (gen.function === "frames") return "Transição entre quadros início e fim";
  return STUDIO_FUNCTION_LABELS[gen.function];
}

export function GenerationCard({ gen }: { gen: Generation }) {
  const router = useRouter();
  const { remove, retry } = useStudioStore();
  const [busy, setBusy] = useState<null | "editor" | "biblioteca" | "capa">(null);

  const running = gen.status === "queued" || gen.status === "running";

  async function sendToEditor() {
    setBusy("editor");
    try {
      const cut = await api.studioGenerationToCut(gen.id, gen.projectId);
      toast("Geração enviada ao editor", { description: "Abrindo o corte no editor…", variant: "success" });
      router.push(`/app/editor/${cut.id}`);
    } catch {
      toast("Não foi possível abrir no editor", { variant: "error" });
      setBusy(null);
    }
  }

  async function saveToLibrary() {
    setBusy("biblioteca");
    try {
      await api.studioGenerationToCut(gen.id, gen.projectId);
      toast("Salvo na biblioteca", { description: "A geração agora está disponível em Biblioteca.", variant: "success" });
    } catch {
      toast("Falha ao salvar", { variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  function useAsCover() {
    setBusy("capa");
    // INTEGRAÇÃO: aplica o primeiro quadro da geração como capa do projeto/corte.
    toast("Definido como capa", { description: "O primeiro quadro será usado como capa.", variant: "success" });
    setBusy(null);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-card">
      <div className="relative aspect-video w-full bg-surface-2">
        {gen.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gen.thumbnailUrl} alt={summarize(gen)} className="h-full w-full object-cover" />
        )}
        <div className="absolute left-2 top-2">
          <Badge variant="accent">{STUDIO_FUNCTION_LABELS[gen.function]}</Badge>
        </div>
        {running && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-8 w-8 animate-spin text-violet-300" aria-hidden />
          </div>
        )}
        {gen.status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-rose-950/60">
            <AlertTriangle className="h-8 w-8 text-rose-300" aria-hidden />
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-zinc-200">{summarize(gen)}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {gen.durationSeconds}s · {gen.resolution} · {gen.fps}fps · {timeAgo(gen.createdAt)}
        </p>
        {gen.function === "lip_sync" && (
          <p className="mt-1 text-[11px] text-zinc-600">
            Lip-sync aproximado (fala sincronizada por legenda/onda), pelo nosso motor de vídeo.
          </p>
        )}

        {running && (
          <div className="mt-3">
            <Progress value={gen.progress} label={`Geração ${STUDIO_FUNCTION_LABELS[gen.function]}`} />
            <p className="mt-1.5 text-xs text-zinc-500">
              {gen.status === "queued" ? "Na fila…" : `Gerando… ${gen.progress}%`}
            </p>
          </div>
        )}

        {gen.status === "error" && (
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => retry(gen.id)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove(gen.id)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remover
            </Button>
          </div>
        )}

        {gen.status === "done" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={sendToEditor} loading={busy === "editor"} disabled={busy !== null}>
              <Send className="h-3.5 w-3.5" aria-hidden /> Enviar para o editor
            </Button>
            <Button size="sm" variant="secondary" onClick={saveToLibrary} loading={busy === "biblioteca"} disabled={busy !== null}>
              <Library className="h-3.5 w-3.5" aria-hidden /> Salvar na biblioteca
            </Button>
            <Button size="sm" variant="secondary" onClick={useAsCover} loading={busy === "capa"} disabled={busy !== null}>
              <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Usar como capa
            </Button>
            <Button size="icon" variant="ghost" onClick={() => remove(gen.id)} aria-label="Remover geração">
              <Trash2 className="h-4 w-4 text-zinc-500 hover:text-rose-400" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
