"use client";

// Render queue store. Enqueues export jobs via the API and simulates worker
// progress client-side (interval per item) so the UX is complete standalone.
// In production the progress would stream over ws://.../ws/progress/{job_id}.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as api from "@/lib/api";
import { toast } from "./toast";

export interface RenderItem {
  id: string; // job id
  cutId: string;
  cutTitle: string;
  projectTitle: string;
  resolution: string;
  fps: number;
  codec: "h264" | "h265";
  preset: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  etaSeconds: number;
  createdAt: string;
  files?: { video: string; srt: string; thumb: string; meta: string };
}

interface RenderQueueState {
  items: RenderItem[];
  enqueue: (params: {
    cutId: string;
    cutTitle: string;
    projectTitle: string;
    resolution: string;
    fps: number;
    codec: "h264" | "h265";
    preset: string;
  }) => Promise<void>;
  addCompleted: (params: {
    cutId: string;
    cutTitle: string;
    projectTitle: string;
    resolution: string;
    fps: number;
    codec: "h264" | "h265";
    preset: string;
  }) => void;
  remove: (id: string) => void;
  resumeSimulations: () => void;
}

// Module-level interval registry (not serializable — kept out of the store).
const timers = new Map<string, ReturnType<typeof setInterval>>();

function startSimulation(id: string, set: (fn: (s: RenderQueueState) => Partial<RenderQueueState>) => void) {
  if (timers.has(id)) return;
  const timer = setInterval(() => {
    set((s) => {
      const items = s.items.map((item) => {
        if (item.id !== id || item.status === "done" || item.status === "error") return item;
        const step = 3 + Math.random() * 9;
        const progress = Math.min(100, item.progress + step);
        const done = progress >= 100;
        if (done) {
          clearInterval(timer);
          timers.delete(id);
          toast("Exportação concluída", {
            description: `"${item.cutTitle}" está pronto para download.`,
            variant: "success",
          });
          return {
            ...item,
            progress: 100,
            status: "done" as const,
            etaSeconds: 0,
            files: {
              video: `mock://minio/renders/${id}.mp4`,
              srt: `mock://minio/renders/${id}.srt`,
              thumb: `mock://minio/renders/${id}.jpg`,
              meta: `mock://minio/renders/${id}.txt`,
            },
          };
        }
        return {
          ...item,
          status: "running" as const,
          progress: Math.round(progress),
          etaSeconds: Math.max(1, Math.round(((100 - progress) / step) * 1.1)),
        };
      });
      return { items };
    });
  }, 1100);
  timers.set(id, timer);
}

export const useRenderQueueStore = create<RenderQueueState>()(
  persist(
    (set, get) => ({
      items: [],
      enqueue: async (params) => {
        const { jobs } = await api.createRenders(
          [params.cutId],
          params.resolution,
          params.fps,
          params.codec,
          params.preset,
        );
        const job = jobs[0];
        const item: RenderItem = {
          id: job.id,
          cutId: params.cutId,
          cutTitle: params.cutTitle,
          projectTitle: params.projectTitle,
          resolution: params.resolution,
          fps: params.fps,
          codec: params.codec,
          preset: params.preset,
          status: "queued",
          progress: 0,
          etaSeconds: 90,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ items: [item, ...s.items] }));
        startSimulation(job.id, set);
        toast("Renderização iniciada", {
          description: `"${params.cutTitle}" entrou na fila em ${params.resolution} ${params.fps}fps.`,
          variant: "info",
        });
      },
      // Exportação REAL feita no navegador (WebCodecs): registra o item já
      // concluído — o arquivo foi baixado na hora, sem simulação de fila.
      addCompleted: (params) => {
        const item: RenderItem = {
          id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          cutId: params.cutId,
          cutTitle: params.cutTitle,
          projectTitle: params.projectTitle,
          resolution: params.resolution,
          fps: params.fps,
          codec: params.codec,
          preset: params.preset,
          status: "done",
          progress: 100,
          etaSeconds: 0,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ items: [item, ...s.items] }));
      },
      remove: (id) => {
        const timer = timers.get(id);
        if (timer) {
          clearInterval(timer);
          timers.delete(id);
        }
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
      },
      resumeSimulations: () => {
        // Called on app mount: restart fake workers for jobs persisted mid-render.
        for (const item of get().items) {
          if (item.status === "queued" || item.status === "running") startSimulation(item.id, set);
        }
      },
    }),
    { name: "cortaai-render-queue", partialize: (s) => ({ items: s.items }) },
  ),
);
