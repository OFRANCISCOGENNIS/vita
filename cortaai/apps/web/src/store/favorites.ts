"use client";

// Favorited Radar videos, persisted to localStorage. Stored as an array (JSON
// friendly); components read `has(id)` and gate on `hydrated` to avoid SSR
// hydration mismatches.

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FavoritesState {
  ids: string[];
  hydrated: boolean;
  toggle: (id: string) => void;
  has: (id: string) => boolean;
  setHydrated: () => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      hydrated: false,
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [id, ...s.ids],
        })),
      has: (id) => get().ids.includes(id),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "cortaai-favorites",
      partialize: (s) => ({ ids: s.ids }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
