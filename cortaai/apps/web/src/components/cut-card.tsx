"use client";

// Card de clipe: título, duração, hashtags e ações (editor, capa, compartilhar).

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, Clock, Image as ImageIcon, Loader2, Pencil, Share2 } from "lucide-react";
import type { Cut } from "@/lib/types";
import * as api from "@/lib/api";
import { openInStudio } from "@/lib/open-in-studio";
import { formatDuration } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ShareModal } from "./share-modal";

const statusLabels: Record<Cut["status"], { label: string; variant: "default" | "accent" | "info" | "success" }> = {
  suggested: { label: "Clipe", variant: "default" },
  edited: { label: "Editado", variant: "accent" },
  rendering: { label: "Renderizando", variant: "info" },
  rendered: { label: "Exportado", variant: "success" },
};

export function CutCard({ cut }: { cut: Cut }) {
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);
  const [studioBusy, setStudioBusy] = useState(false);

  async function toStudio() {
    if (studioBusy) return;
    setStudioBusy(true);
    try {
      const project = await api.getProject(cut.projectId).catch(() => null);
      const result = await openInStudio({
        mediaId: project?.mediaId,
        mediaUrl: project?.mediaUrl,
        name: cut.title,
        startSec: cut.startSeconds,
        endSec: cut.endSeconds,
      });
      if (result.ok) {
        toast("Clipe aberto no Estúdio", { description: "Só o trecho do clipe entrou na timeline — edite à vontade." });
        router.push("/app/estudio");
      } else {
        toast("Não deu para abrir no Estúdio", { description: result.reason, variant: "error" });
      }
    } finally {
      setStudioBusy(false);
    }
  }

  const snippet = cut.transcript
    .slice(0, 16)
    .map((w) => w.word)
    .join(" ");

  const status = statusLabels[cut.status];

  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface-1 p-5 shadow-card transition-colors hover:border-violet-500/30">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <Clock className="h-3.5 w-3.5 text-violet-400" aria-hidden />
          {formatDuration(cut.endSeconds - cut.startSeconds)}
        </span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <h3 className="mt-3 flex-1 text-base font-bold leading-snug text-white">{cut.title}</h3>
      {snippet && (
        <p className="mt-2 line-clamp-2 text-xs italic leading-relaxed text-zinc-500">&ldquo;{snippet}...&rdquo;</p>
      )}

      {cut.hashtags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cut.hashtags.map((h) => (
            <span key={h} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-violet-300">
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/app/editor?cut=${cut.id}`}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 text-xs font-medium text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Abrir no editor
        </Link>
        <button
          onClick={() => void toStudio()}
          aria-label="Abrir no Estúdio PRO"
          title="Abrir no Estúdio PRO (multitrilha)"
          disabled={studioBusy}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          {studioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Clapperboard className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <Link
          href={`/app/capa/editor?cut=${cut.id}`}
          aria-label="Criar capa deste clipe"
          title="Estúdio de Capa"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)} aria-label="Compartilhar clipe" title="Compartilhar">
          <Share2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} cut={cut} />
    </article>
  );
}
