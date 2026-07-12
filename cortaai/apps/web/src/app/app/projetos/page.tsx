"use client";

// Project list with search, status filter and delete.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import * as api from "@/lib/api";
import { MOCK_NOW } from "@/lib/mock-data";
import { deleteUserProject } from "@/lib/session-scope";
import { deleteMedia } from "@/lib/media-store";
import type { Project } from "@/lib/types";
import { cn, formatDuration, timeAgo } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SkeletonCard } from "@/components/ui/skeleton";

const STATUS_FILTERS = [
  { id: "", label: "Todos" },
  { id: "ready", label: "Prontos" },
  { id: "processing", label: "Processando" },
];

const statusLabels: Record<string, { label: string; variant: "success" | "info" | "warning" | "danger" }> = {
  ready: { label: "Pronto", variant: "success" },
  importing: { label: "Importando", variant: "info" },
  transcribing: { label: "Transcrevendo", variant: "info" },
  analyzing: { label: "Analisando", variant: "warning" },
  error: { label: "Erro", variant: "danger" },
};

const sourceLabels: Record<Project["sourceType"], string> = {
  upload: "Upload",
  youtube: "YouTube",
  twitch: "Twitch",
  vimeo: "Vimeo",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setError(false);
    setProjects(null);
    api.listProjects().then(setProjects).catch(() => setError(true));
  }
  useEffect(load, []);

  const filtered = (projects ?? []).filter((p) => {
    if (query && !p.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (statusFilter === "ready" && p.status !== "ready") return false;
    if (statusFilter === "processing" && (p.status === "ready" || p.status === "error")) return false;
    return true;
  });

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteProject(confirmDelete.id);
      // Client-side persistence: drop the project + its cuts and free the
      // IndexedDB video blobs they referenced (no-op for the demo seed).
      const mediaIds = deleteUserProject(confirmDelete.id);
      await Promise.all(mediaIds.map((mid) => deleteMedia(mid)));
      setProjects((prev) => (prev ?? []).filter((p) => p.id !== confirmDelete.id));
      toast("Projeto excluído", { description: `"${confirmDelete.title}" e seus clipes foram removidos.` });
    } catch {
      toast("Falha ao excluir", { variant: "error" });
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Projetos</h1>
          <p className="mt-1 text-sm text-zinc-500">Seus vídeos longos e o estado de processamento de cada um.</p>
        </div>
        <Link
          href="/app/novo"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-glow hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Novo projeto
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar projeto..."
            aria-label="Buscar projeto"
            className="h-10 w-full rounded-xl border border-line bg-surface-1 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          />
        </div>
        <div role="group" aria-label="Filtrar por status" className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              aria-pressed={statusFilter === f.id}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                statusFilter === f.id
                  ? "border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
                  : "border-line text-zinc-400 hover:text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <EmptyState
          variant="queue"
          title="Falha ao carregar projetos"
          description="Verifique a conexão e tente novamente."
          action={<Button onClick={load}>Tentar novamente</Button>}
        />
      ) : projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          variant={query ? "search" : "clapper"}
          title={query ? "Nenhum projeto encontrado" : "Nenhum projeto ainda"}
          description={query ? "Tente outra busca." : "Envie seu primeiro vídeo para começar a editar."}
          action={
            !query && (
              <Link href="/app/novo" className="inline-flex h-10 items-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white">
                Importar vídeo
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const st = statusLabels[p.status] ?? statusLabels.ready;
            return (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-card transition-all hover:-translate-y-0.5 hover:border-violet-500/40"
              >
                <Link href={`/app/projeto?id=${p.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  <div className="relative aspect-video overflow-hidden">
                    <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                      {formatDuration(p.durationSeconds)}
                    </span>
                    <span className="absolute left-2 top-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-2 text-sm font-semibold text-zinc-100 group-hover:text-white">{p.title}</h3>
                    <p className="mt-2 text-xs text-zinc-500">
                      {sourceLabels[p.sourceType]} · {p.resolution} · {p.fps}fps · {timeAgo(p.createdAt, MOCK_NOW)}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => setConfirmDelete(p)}
                  aria-label={`Excluir projeto ${p.title}`}
                  className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-zinc-300 opacity-0 backdrop-blur transition-opacity hover:text-rose-400 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Excluir projeto?"
        description={`"${confirmDelete?.title}" e todos os clipes serão removidos permanentemente.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            <Trash2 className="h-4 w-4" aria-hidden /> Excluir definitivamente
          </Button>
        </div>
      </Modal>
    </div>
  );
}
