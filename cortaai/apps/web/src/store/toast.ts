"use client";

// Global toast notifications store.
//
// MODO SILENCIOSO (pedido do usuário): confirmações de sucesso/info NÃO viram
// notificação — a própria tela já mostra o resultado da ação. Só aparecem:
// - variant "error" (algo falhou ou precisa de atenção), e
// - toasts marcados com { important: true } (avisos honestos de limitação).

import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export interface ToastOptions {
  description?: string;
  variant?: ToastVariant;
  /** Mostra mesmo não sendo erro (ex.: aviso honesto de limitação). */
  important?: boolean;
}

interface ToastState {
  toasts: Toast[];
  push: (title: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (title, options) => {
    const variant = options?.variant ?? "success";
    if (variant !== "error" && !options?.important) return; // silencioso
    const id = nextId++;
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id, title, description: options?.description, variant }],
    }));
    setTimeout(() => get().dismiss(id), 5200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience imperative helper usable outside React components. */
export function toast(title: string, options?: ToastOptions) {
  useToastStore.getState().push(title, options);
}
