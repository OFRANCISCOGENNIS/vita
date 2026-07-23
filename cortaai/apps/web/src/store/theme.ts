"use client";

// Theme store (dark | light | system), persisted to localStorage. The applied
// theme is resolved and written to <html> by ThemeProvider + an anti-FOUC inline
// script in the root layout. Default is "dark" (the app's native look).

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  hydrated: boolean;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
  setHydrated: () => void;
}

const ORDER: Theme[] = ["dark", "light", "system"];

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      hydrated: false,
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const next = ORDER[(ORDER.indexOf(get().theme) + 1) % ORDER.length];
        set({ theme: next });
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "cortaai-theme",
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** Resolves "system" to the OS preference; passes through dark/light. */
export function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}
