"use client";

// Estúdio de Capa — index: pick a cut to design a cover/thumbnail for.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ImageIcon } from "lucide-react";
import * as api from "@/lib/api";
import type { Cut } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function CapaIndexPage() {
  const [cuts, setCuts] = useState<Cut[] | null>(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setCuts(null);
    api.listCuts().then(setCuts).catch(() => setError(true));
  }
  useEffect(load, []);

  if (error) {
    return (
      <EmptyState
        variant="queue"
        title="Não foi possível carregar os clipes"
        description="Verifique sua conexão e tente novamente."
        action={<Button onClick={load}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          <ImageIcon className="mr-2 inline h-6 w-6 text-fuchsia-400" aria-hidden />
          Estúdio de Capa
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Crie capas e thumbnails para seus clipes: recorte por proporção,
          texto com estilo, stickers, remoção de fundo e comparação A/B.
        </p>
      </div>

      {cuts === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : cuts.length === 0 ? (
        <EmptyState
          variant="clapper"
          title="Nenhum clipe para gerar capa"
          description="Envie um vídeo e crie um clipe — depois volte aqui para desenhar a capa perfeita."
          action={
            <Link href="/app/novo" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white">
              Criar primeiro projeto
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cuts.map((c) => (
            <Link
              key={c.id}
              href={`/app/capa/editor?cut=${c.id}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface-1 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>{formatDuration(c.endSeconds - c.startSeconds)}</span>
              </div>
              <h2 className="mt-2 line-clamp-2 flex-1 text-sm font-semibold text-white">{c.title}</h2>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-violet-400 group-hover:text-violet-300">
                Abrir estúdio de capa <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
