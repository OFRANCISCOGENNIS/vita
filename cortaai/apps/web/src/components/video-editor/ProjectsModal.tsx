"use client";

// GERENCIADOR DE PROJETOS do Estúdio — lista os projetos salvos (localStorage),
// com criar, abrir, duplicar e apagar. Os blobs de mídia continuam no
// IndexedDB; aqui só metadados + o JSON do projeto.

import { useEffect, useState } from "react";
import { Copy, FilePlus2, FolderOpen, Trash2 } from "lucide-react";
import { makeProject, newId, validateProject } from "@/lib/video-editor/model";
import type { MediaSource } from "@/lib/video-editor/media-registry";
import {
  deleteProjectEntry,
  duplicateProjectEntry,
  listProjects,
  setCurrentProjectId,
  type StudioProjectEntry,
} from "@/lib/video-editor/project-library";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";
import { Modal } from "@/components/ui/modal";

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ProjectsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadFromJson = useVideoEditor((s) => s.loadFromJson);
  const loadProject = useVideoEditor((s) => s.loadProject);
  const addSource = useVideoEditor((s) => s.addSource);
  const currentId = useVideoEditor((s) => s.project.id);
  const [entries, setEntries] = useState<StudioProjectEntry[]>([]);

  useEffect(() => {
    if (open) setEntries(listProjects());
  }, [open]);

  function restoreSources(sources: MediaSource[]) {
    sources.forEach((src) => {
      if (src && typeof src.id === "string" && typeof src.mediaId === "string") addSource(src);
    });
  }

  function openEntry(entry: StudioProjectEntry) {
    const valid = validateProject(entry.project);
    if (!valid) {
      toast("Projeto corrompido — não foi possível abrir", { variant: "error" });
      return;
    }
    loadFromJson(valid);
    restoreSources(entry.sources ?? []);
    setCurrentProjectId(valid.id);
    toast("Projeto aberto", { description: entry.name });
    onClose();
  }

  function newProject() {
    const project = makeProject("Meu vídeo", { w: 1080, h: 1920 }, 30);
    loadProject(project);
    setCurrentProjectId(project.id);
    toast("Novo projeto criado");
    onClose();
  }

  function duplicate(entry: StudioProjectEntry) {
    const copy = duplicateProjectEntry(entry.id, newId("proj"), `${entry.name} (cópia)`);
    if (copy) {
      setEntries(listProjects());
      toast("Projeto duplicado", { description: copy.name });
    }
  }

  function remove(entry: StudioProjectEntry) {
    deleteProjectEntry(entry.id);
    setEntries(listProjects());
    toast("Projeto apagado", { description: entry.name });
  }

  return (
    <Modal open={open} onClose={onClose} title="Projetos do Estúdio">
      <div className="space-y-3">
        <button
          onClick={newProject}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-1/60 px-3 py-3 text-sm font-medium text-zinc-300 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <FilePlus2 className="h-4 w-4" aria-hidden />
          Novo projeto
        </button>

        {entries.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-zinc-500">Nenhum projeto salvo ainda — tudo que você editar é salvo automaticamente.</p>
        ) : (
          <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {entry.name}
                    {entry.id === currentId && <span className="ml-2 rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-300">aberto</span>}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {(entry.durationMs / 1000).toFixed(1)}s · {fmtWhen(entry.updatedAt)}
                  </p>
                </div>
                <button onClick={() => openEntry(entry)} aria-label={`Abrir ${entry.name}`} title="Abrir" className="rounded-lg p-2 text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  <FolderOpen className="h-4 w-4" />
                </button>
                <button onClick={() => duplicate(entry)} aria-label={`Duplicar ${entry.name}`} title="Duplicar" className="rounded-lg p-2 text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  <Copy className="h-4 w-4" />
                </button>
                <button onClick={() => remove(entry)} aria-label={`Apagar ${entry.name}`} title="Apagar" className="rounded-lg p-2 text-zinc-400 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
