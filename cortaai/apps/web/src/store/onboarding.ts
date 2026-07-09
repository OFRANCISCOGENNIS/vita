"use client";

// Onboarding tour state, persisted so a returning user isn't shown it again.
// `completed` gates the auto-open; `reset()` powers "Refazer tour" in settings.

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  completed: boolean;
  hydrated: boolean;
  complete: () => void;
  reset: () => void;
  setHydrated: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      hydrated: false,
      complete: () => set({ completed: true }),
      reset: () => set({ completed: false }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "cortaai-onboarding",
      partialize: (s) => ({ completed: s.completed }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
