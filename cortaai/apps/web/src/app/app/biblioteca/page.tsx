"use client";

// Library: searchable/filterable grid with hover preview + a simple
// windowed (virtualized) long list — no extra dependency.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Play, Search } from "lucide-react";
import * as api from "@/lib/api";
import type { Cut, Project } from "@/lib/types";
import { cn, formatDuration, svgThumb } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";

interface LibraryItem {
  cut: Cut;
  project: Project;
  thumb: string;
}

const ROW_HEIGHT = 76;
const OVERSCAN = 6;

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [hovered, setHovered] = useState<string | null>(null);

  // windowing state for list view
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  function load() {
    setError(false);
    setItems(null);
    api
      .listProjects()
      .then(async (projects) => {
        const all: LibraryItem[] = [];
        for (const p of projects) {
          const cuts = await api.getProjectCuts(p.id);
          for (const c of cuts) {
            all.push({ cut: c, project: p, thumb: svgThumb(c.title, "podcast", 360, 640) });
          }
        }
        setItems(all);
      })
      .catch(() => setError(true));
  }
  useEffect(load, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el || view !== "list") return;
    setViewportH(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [view, items]);

  const filtered = useMemo(
    () =>
      (items ?? []).filter((i) => {
        if (query && !`${i.cut.title} ${i.project.title}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [items, query],
  );

  // simple windowing math
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(filtered.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);
  const visible = filtered.slice(startIndex, endIndex);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Biblioteca</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Todos os seus clipes em um só lugar{items && ` · ${filtered.length} itens`}.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-line bg-surface-1 p-1" role="group" aria-label="Modo de visualização">
          <button
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label="Ver em grade"
            className={cn("rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400", view === "grid" ? "bg-violet-600/30 text-white" : "text-zinc-500 hover:text-white")}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="Ver em lista (virtualizada)"
            className={cn("rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400", view === "list" ? "bg-violet-600/30 text-white" : "text-zinc-500 hover:text-white")}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clipe..."
            aria-label="Buscar na biblioteca"
            className="h-10 w-full rounded-xl border border-line bg-surface-1 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          />
        </div>
      </div>

      {error ? (
        <EmptyState
          variant="queue"
          title="Falha ao carregar a biblioteca"
          action={<Button onClick={load}>Tentar novamente</Button>}
        />
      ) : items === null ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState variant="search" title="Nada encontrado" description="Ajuste o texto da busca." />
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {filtered.slice(0, 40).map((item) => (
            <Link
              key={item.cut.id}
              href={`/app/editor?cut=${item.cut.id}`}
              onMouseEnter={() => setHovered(item.cut.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(item.cut.id)}
              onBlur={() => setHovered(null)}
              className="group relative overflow-hidden rounded-2xl border border-line bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <div className="relative aspect-[9/16] overflow-hidden">
                <img src={item.thumb} alt={`Clipe: ${item.cut.title}`} className="h-full w-full object-cover" />
                {/* animated hover preview placeholder */}
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center bg-gradient-to-b from-violet-900/70 to-fuchsia-900/70 transition-opacity",
                    hovered === item.cut.id ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur animate-pulse-soft">
                    <Play className="ml-0.5 h-5 w-5 text-white" />
                  </span>
                  <span className="absolute bottom-10 left-3 right-3 h-1 overflow-hidden rounded bg-white/15">
                    <span className="block h-full w-1/2 rounded bg-white/70 animate-bar-grow" />
                  </span>
                </div>
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  {formatDuration(item.cut.endSeconds - item.cut.startSeconds)}
                </span>
              </div>
              <div className="p-3">
                <h3 className="line-clamp-2 text-xs font-semibold text-zinc-100">{item.cut.title}</h3>
                <p className="mt-1 truncate text-[10px] text-zinc-500">{item.project.title}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Virtualized list (simple windowing) */
        <div
          ref={listRef}
          className="h-[560px] overflow-y-auto rounded-2xl border border-line bg-surface-1"
          role="list"
          aria-label={`Lista de ${filtered.length} clipes`}
        >
          <div style={{ height: filtered.length * ROW_HEIGHT, position: "relative" }}>
            {visible.map((item, i) => {
              const index = startIndex + i;
              return (
                <Link
                  key={item.cut.id}
                  href={`/app/editor?cut=${item.cut.id}`}
                  role="listitem"
                  className="absolute inset-x-0 flex items-center gap-4 border-b border-line/50 px-4 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
                  style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                >
                  <span className="w-8 shrink-0 text-right font-mono text-xs text-zinc-600">{index + 1}</span>
                  <img src={item.thumb} alt="" className="h-14 w-9 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{item.cut.title}</p>
                    <p className="truncate text-xs text-zinc-500">{item.project.title}</p>
                  </div>
                  <span className="hidden font-mono text-xs text-zinc-500 sm:block">
                    {formatDuration(item.cut.endSeconds - item.cut.startSeconds)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
