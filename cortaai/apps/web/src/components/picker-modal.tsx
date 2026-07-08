"use client";

// Project/cut picker used by the Raio-X action buttons
// (use sound / apply caption style / generate inspired cut).

import { useEffect, useState } from "react";
import { ChevronRight, Film, Scissors } from "lucide-react";
import * as api from "@/lib/api";
import type { Cut, Project } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { Modal } from "./ui/modal";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./ui/empty-state";

interface PickerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  mode: "project" | "cut";
  onPick: (target: { projectId: string; cutId?: string; label: string }) => void;
}

export function PickerModal({ open, onClose, title, description, mode, onPick }: PickerModalProps) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [cutsByProject, setCutsByProject] = useState<Record<string, Cut[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjects(null);
    api.listProjects().then(async (list) => {
      setProjects(list);
      if (mode === "cut") {
        const entries = await Promise.all(
          list.map(async (p) => [p.id, await api.getProjectCuts(p.id)] as const),
        );
        setCutsByProject(Object.fromEntries(entries));
      }
    });
  }, [open, mode]);

  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      {projects === null ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState variant="clapper" title="Nenhum projeto ainda" description="Importe um vídeo em Novo projeto para começar." />
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-1 p-3 text-left transition-colors hover:border-violet-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                onClick={() => {
                  if (mode === "project") {
                    onPick({ projectId: p.id, label: p.title });
                  } else {
                    setExpanded(expanded === p.id ? null : p.id);
                  }
                }}
                aria-expanded={mode === "cut" ? expanded === p.id : undefined}
              >
                <Film className="h-5 w-5 shrink-0 text-violet-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">{p.title}</span>
                  <span className="text-xs text-zinc-500">{formatDuration(p.durationSeconds)}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-500" aria-hidden />
              </button>
              {mode === "cut" && expanded === p.id && (
                <ul className="ml-6 mt-2 space-y-1.5">
                  {(cutsByProject[p.id] ?? []).length === 0 && (
                    <li className="py-2 text-xs text-zinc-500">Este projeto ainda não tem cortes.</li>
                  )}
                  {(cutsByProject[p.id] ?? []).map((c) => (
                    <li key={c.id}>
                      <button
                        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-xs text-zinc-300 hover:border-fuchsia-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                        onClick={() => onPick({ projectId: p.id, cutId: c.id, label: c.title })}
                      >
                        <Scissors className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" aria-hidden />
                        <span className="truncate">{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
