"use client";

// Estúdio IA generation queue. Enqueues AI-video generations via the API and
// simulates worker progress client-side (interval per item) so the UX is
// complete standalone. Generation runs on our own video engine (FFmpeg), no
// external key. In production the progress streams over ws://.../ws/progress/{job_id}.
// Persisted so an in-flight generation resumes after a reload — modeled on store/render-queue.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Generation } from "@/lib/types";
import { toast } from "./toast";

/** pt-BR labels for each studio function (used in toasts + cards). */
export const STUDIO_FUNCTION_LABELS: Record<Generation["function"], string> = {
  text_to_video: "Texto → Vídeo",
  image_to_video: "Imagem → Vídeo",
  extend: "Extensão de clipe",
  frames: "Quadro inicial e final",
  motion_brush: "Motion Brush",
  lip_sync: "Lip Sync",
  camera: "Movimentos de câmera",
  effect_template: "Template de efeito",
};

interface StudioState {
  items: Generation[];
  hydrated: boolean;
  /** Push an already-created (queued) Generation and start its progress sim. */
  enqueue: (call: () => Promise<Generation>) => Promise<Generation | null>;
  /** Merge server-side generations (mock/API history) without duplicating. */
  seed: (generations: Generation[]) => void;
  remove: (id: string) => void;
  retry: (id: string) => void;
  resumeSimulations: () => void;
}

// Module-level interval registry (not serializable — kept out of the store).
const timers = new Map<string, ReturnType<typeof setInterval>>();

function startSimulation(id: string, set: StoreSet) {
  if (timers.has(id)) return;
  const timer = setInterval(() => {
    set((s) => {
      const items = s.items.map((item) => {
        if (item.id !== id || item.status === "done" || item.status === "error") return item;
        const step = 4 + Math.random() * 10;
        const progress = Math.min(100, item.progress + step);
        if (progress >= 100) {
          clearInterval(timer);
          timers.delete(id);
          toast("Geração concluída", {
            description: `${STUDIO_FUNCTION_LABELS[item.function]} está pronta no Estúdio IA.`,
            variant: "success",
          });
          return {
            ...item,
            progress: 100,
            status: "done" as const,
            resultUrl: `mock://studio/${item.id}.mp4`,
            finishedAt: new Date().toISOString(),
          };
        }
        return { ...item, status: "running" as const, progress: Math.round(progress) };
      });
      return { items };
    });
  }, 900);
  timers.set(id, timer);
}

type StoreSet = (fn: (s: StudioState) => Partial<StudioState>) => void;

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      items: [],
      hydrated: false,
      enqueue: async (call) => {
        try {
          const gen = await call();
          set((s) => ({ items: [gen, ...s.items.filter((i) => i.id !== gen.id)] }));
          startSimulation(gen.id, set);
          toast("Geração iniciada", {
            description: `${STUDIO_FUNCTION_LABELS[gen.function]} entrou na fila do Estúdio IA.`,
            variant: "info",
          });
          return gen;
        } catch {
          toast("Não foi possível iniciar a geração", {
            description: "Tente novamente em instantes.",
            variant: "error",
          });
          return null;
        }
      },
      seed: (generations) => {
        set((s) => {
          const existing = new Set(s.items.map((i) => i.id));
          const merged = [...s.items, ...generations.filter((g) => !existing.has(g.id))];
          return { items: merged };
        });
      },
      remove: (id) => {
        const timer = timers.get(id);
        if (timer) {
          clearInterval(timer);
          timers.delete(id);
        }
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
      },
      retry: (id) => {
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, status: "queued" as const, progress: 0, errorMessage: null } : i,
          ),
        }));
        startSimulation(id, set);
      },
      resumeSimulations: () => {
        set(() => ({ hydrated: true }));
        // Called on app mount: restart fake workers for generations persisted mid-run.
        for (const item of get().items) {
          if (item.status === "queued" || item.status === "running") startSimulation(item.id, set);
        }
      },
    }),
    { name: "cortaai-studio-queue", partialize: (s) => ({ items: s.items }) },
  ),
);
