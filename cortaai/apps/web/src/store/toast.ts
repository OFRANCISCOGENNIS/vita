"use client";

// Global toast notifications store.

import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  push: (title: string, options?: { description?: string; variant?: ToastVariant }) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (title, options) => {
    const id = nextId++;
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id, title, description: options?.description, variant: options?.variant ?? "success" }],
    }));
    setTimeout(() => get().dismiss(id), 5200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience imperative helper usable outside React components. */
export function toast(title: string, options?: { description?: string; variant?: ToastVariant }) {
  useToastStore.getState().push(title, options);
}
