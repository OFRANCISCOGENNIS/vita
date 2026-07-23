"use client";

// Mock auth/session store. Persists the session to localStorage so refreshes
// keep the user logged in. Real authentication goes through lib/api.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as api from "@/lib/api";
import type { BrandingKit, User } from "@/lib/types";

interface AuthState {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginGoogle: (idToken: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
  updateBrandingKit: (kit: BrandingKit) => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      hydrated: false,
      login: async (email, password) => {
        const { token, user } = await api.login(email, password);
        api.setAuthToken(token);
        set({ token, user });
      },
      loginGoogle: async (idToken: string) => {
        // idToken é o JWT real do Google Identity Services (GIS). Sem backend,
        // lib/api.ts decodifica o perfil real no cliente.
        const { token, user } = await api.loginGoogle(idToken);
        api.setAuthToken(token);
        set({ token, user });
      },
      register: async (name, email, password) => {
        const { token, user } = await api.register(name, email, password);
        api.setAuthToken(token);
        set({ token, user });
      },
      logout: () => {
        api.setAuthToken(null);
        set({ token: null, user: null });
      },
      updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      updateBrandingKit: (kit) =>
        set((s) => ({ user: s.user ? { ...s.user, brandingKit: kit } : s.user })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "cortaai-session",
      partialize: (s) => ({ user: s.user, token: s.token }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) api.setAuthToken(state.token);
        state?.setHydrated();
      },
    },
  ),
);
