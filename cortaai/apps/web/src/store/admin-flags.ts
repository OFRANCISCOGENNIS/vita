"use client";

// Feature flags / configurações do sistema (Painel do ADM). Persistidas em
// localStorage — sem backend (export estático). São globais da plataforma no
// modelo mental do ADM, mas na prática ficam no dispositivo do admin.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AdminFlags {
  registroAberto: boolean;
  marcaDagua: boolean;
  moderacaoAuto: boolean;
  manutencao: boolean;
}

export const DEFAULT_FLAGS: AdminFlags = {
  registroAberto: true,
  marcaDagua: false,
  moderacaoAuto: true,
  manutencao: false,
};

export interface FlagMeta {
  key: keyof AdminFlags;
  label: string;
  description: string;
}

export const FLAG_META: FlagMeta[] = [
  { key: "registroAberto", label: "Registro aberto", description: "Permite novos cadastros sem convite." },
  { key: "marcaDagua", label: "Marca d'água", description: "Aplica a marca CortaAí nas exportações do plano Free." },
  { key: "moderacaoAuto", label: "Moderação automática", description: "Sinaliza conteúdo sensível automaticamente para revisão." },
  { key: "manutencao", label: "Modo manutenção", description: "Exibe aviso de manutenção e pausa novos jobs." },
];

interface AdminFlagsState {
  flags: AdminFlags;
  hydrated: boolean;
  toggle: (key: keyof AdminFlags) => void;
  set: (key: keyof AdminFlags, value: boolean) => void;
  reset: () => void;
  setHydrated: () => void;
}

export const useAdminFlagsStore = create<AdminFlagsState>()(
  persist(
    (setState) => ({
      flags: { ...DEFAULT_FLAGS },
      hydrated: false,
      toggle: (key) => setState((s) => ({ flags: { ...s.flags, [key]: !s.flags[key] } })),
      set: (key, value) => setState((s) => ({ flags: { ...s.flags, [key]: value } })),
      reset: () => setState({ flags: { ...DEFAULT_FLAGS } }),
      setHydrated: () => setState({ hydrated: true }),
    }),
    {
      name: "cortaai-admin-flags",
      partialize: (s) => ({ flags: s.flags }),
      // Migra flags novas mantendo defaults quando o storage é antigo.
      merge: (persisted, current) => {
        const p = (persisted as { flags?: Partial<AdminFlags> } | undefined)?.flags ?? {};
        return { ...current, flags: { ...DEFAULT_FLAGS, ...p } };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
