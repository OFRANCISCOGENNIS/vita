"use client";

// Home do editor: saudação, botão grande "Novo vídeo", projetos recentes e
// atalhos para o Editor de Fotos e o Estúdio de Capa.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Image as ImageIcon, ImagePlus, PlusCircle, ShieldAlert } from "lucide-react";
import * as api from "@/lib/api";
import type { Project } from "@/lib/types";
import { formatDuration, timeAgo } from "@/lib/utils";
import { MOCK_NOW } from "@/lib/mock-data";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const statusLabels: Record<string, { label: string; variant: "success" | "info" | "warning" | "danger" }> = {
  ready: { label: "Pronto", variant: "success" },
  importing: { label: "Importando", variant: "info" },
  transcribing: { label: "Processando", variant: "info" },
  analyzing: { label: "Processando", variant: "warning" },
  error: { label: "Erro", variant: "danger" },
};

const TOOLS = [
  {
    href: "/app/fotos",
    title: "Editor de Fotos",
    desc: "Ajustes, filtros, curvas, retoque e elementos — direto no navegador.",
    icon: ImagePlus,
  },
  {
    href: "/app/capa",
    title: "Estúdio de Capa",
    desc: "Desenhe capas e thumbnails com texto, formas e seu kit de marca.",
    icon: ImageIcon,
  },
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setProjects(null);
    api
      .listProjects()
      .then((list) => setProjects(list.slice(0, 6)))
      .catch(() => setError(true));
  }
  useEffect(load, []);

  if (error) {
    return (
      <EmptyState
        variant="queue"
        title="Não foi possível carregar o painel"
        description="Verifique sua conexão e tente novamente."
        action={<Button onClick={load}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Olá, {user?.name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tudo pronto para editar seu próximo vídeo.
        </p>
      </div>

      {/* Atalho para administradores (não força redirecionamento — é uma escolha). */}
      {user?.isAdmin && (
        <Link
          href="/app/admin"
          className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-3 transition-colors hover:border-amber-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white" aria-hidden>
            <ShieldAlert className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              Painel do ADM
              <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-black">ADM</span>
            </span>
            <span className="block text-xs text-zinc-400">Você tem acesso administrativo — veja as métricas da plataforma inteira.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        </Link>
      )}

      {/* CTA principal: novo vídeo */}
      <Link
        href="/app/novo"
        className="group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-violet-500/40 bg-gradient-to-b from-violet-600/10 to-fuchsia-600/5 px-6 py-12 text-center transition-colors hover:border-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow transition-transform group-hover:scale-105" aria-hidden>
          <PlusCircle className="h-7 w-7" />
        </span>
        <span className="text-xl font-bold text-white">Novo vídeo</span>
        <span className="max-w-md text-sm text-zinc-400">
          Envie um vídeo (ou vários, juntando tudo em um só) e abra direto no editor — timeline, legendas, cores e exportação.
        </span>
      </Link>

      {/* Atalhos para as outras ferramentas */}
      <section aria-labelledby="ferramentas">
        <h2 id="ferramentas" className="mb-4 text-lg font-bold text-white">Outras ferramentas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className="group flex items-start gap-4 rounded-2xl border border-line bg-surface-1 p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300" aria-hidden>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold text-white">
                    {t.title}
                    <ArrowRight className="h-3.5 w-3.5 text-violet-400 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{t.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Projetos recentes */}
      <section aria-labelledby="recentes">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recentes" className="text-lg font-bold text-white">Projetos recentes</h2>
          <Link href="/app/projetos" className="inline-flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300">
            Ver todos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {projects === null ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            variant="clapper"
            title="Nenhum projeto ainda"
            description="Envie seu primeiro vídeo e comece a editar em segundos."
            action={
              <Link href="/app/novo" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white">
                Enviar primeiro vídeo
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {projects.map((p) => {
              const st = statusLabels[p.status] ?? statusLabels.ready;
              return (
                <Link
                  key={p.id}
                  href={`/app/projeto?id=${p.id}`}
                  className="group overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-card transition-all hover:-translate-y-0.5 hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                      {formatDuration(p.durationSeconds)}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="text-[11px] text-zinc-500">{timeAgo(p.createdAt, MOCK_NOW)}</span>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-100">{p.title}</h3>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
