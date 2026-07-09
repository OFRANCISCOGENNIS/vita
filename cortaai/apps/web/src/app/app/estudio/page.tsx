"use client";

// ESTÚDIO IA — geração e direção de vídeo por IA. 8 ferramentas: coluna esquerda
// (seleção), painel central (configuração + Gerar) e galeria "Gerações recentes"
// com status/progresso ao vivo. A geração roda no nosso próprio motor de vídeo
// (FFmpeg), sem custo. Sem API, cai no fallback local.

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import type { StudioFunction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store/studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ConfigPanel } from "@/components/studio/config-panel";
import { GenerationCard } from "@/components/studio/generation-card";
import { STUDIO_TOOLS } from "@/components/studio/tools";

export default function EstudioPage() {
  const [tool, setTool] = useState<StudioFunction>("text_to_video");
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  const items = useStudioStore((s) => s.items);
  const seed = useStudioStore((s) => s.seed);
  const resumeSimulations = useStudioStore((s) => s.resumeSimulations);

  useEffect(() => {
    resumeSimulations();
  }, [resumeSimulations]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    api
      .studioGenerations()
      .then((gens) => {
        if (!active) return;
        seed(gens);
      })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [seed]);

  const running = items.filter((i) => i.status === "running" || i.status === "queued").length;
  const recent = [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  function retryLoad() {
    setLoadError(false);
    setLoading(true);
    api
      .studioGenerations()
      .then(seed)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-glow">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="text-2xl font-bold text-white">Estúdio IA</h1>
            <Badge variant="accent">Beta</Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Gere e dirija vídeo por IA — 8 ferramentas, do texto ao efeito pronto.
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Gerado pelo nosso próprio motor de vídeo (FFmpeg), sem custo.
          </p>
        </div>
        {running > 0 && (
          <Badge variant="info" className="h-7 px-3">
            {running} {running === 1 ? "geração em andamento" : "gerações em andamento"}
          </Badge>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Coluna esquerda — 8 ferramentas */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div
            role="tablist"
            aria-label="Ferramentas do Estúdio IA"
            className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0"
          >
            {STUDIO_TOOLS.map((t) => {
              const Icon = t.icon;
              const active = tool === t.fn;
              return (
                <button
                  key={t.fn}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTool(t.fn)}
                  className={cn(
                    "group flex min-w-[220px] items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 lg:min-w-0",
                    active
                      ? "border-violet-500/50 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10"
                      : "border-line bg-surface-1 hover:border-zinc-600",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors",
                      active
                        ? "bg-violet-500/20 text-violet-200 ring-violet-500/40"
                        : "bg-surface-2 text-zinc-400 ring-line group-hover:text-white",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", active ? "text-white" : "text-zinc-200")}>{t.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-zinc-500">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Painel central — configuração da ferramenta */}
        <div className="min-w-0">
          <ConfigPanel fn={tool} />
        </div>
      </div>

      {/* Gerações recentes */}
      <section aria-labelledby="recentes-title" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="recentes-title" className="text-lg font-semibold text-white">
            Gerações recentes
          </h2>
          {recent.length > 0 && <span className="text-xs text-zinc-500">{recent.length} no total</span>}
        </div>

        {loading && items.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : loadError && items.length === 0 ? (
          <EmptyState
            variant="clapper"
            title="Não foi possível carregar as gerações"
            description="Verifique sua conexão e tente novamente."
            action={
              <Button variant="secondary" onClick={retryLoad}>
                Tentar novamente
              </Button>
            }
          />
        ) : recent.length === 0 ? (
          <EmptyState
            variant="clapper"
            title="Nenhuma geração ainda"
            description="Escolha uma ferramenta acima, configure e clique em Gerar para criar seu primeiro vídeo por IA."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((gen) => (
              <GenerationCard key={gen.id} gen={gen} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
