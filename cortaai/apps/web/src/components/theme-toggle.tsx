"use client";

// Accessible theme switch. Cycles dark → light → system on click/Enter, showing
// the icon of the current preference. Reused in the app topbar, landing header
// and command palette (via useThemeStore.cycleTheme).

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore, type Theme } from "@/store/theme";

const META: Record<Theme, { icon: typeof Sun; label: string; next: string }> = {
  dark: { icon: Moon, label: "escuro", next: "claro" },
  light: { icon: Sun, label: "claro", next: "sistema" },
  system: { icon: Monitor, label: "do sistema", next: "escuro" },
};

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const meta = META[theme];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={`Tema ${meta.label}. Clique para mudar para ${meta.next}.`}
      title={`Tema ${meta.label} — clique para ${meta.next}`}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line text-zinc-400 transition-colors hover:text-white hover:border-violet-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </button>
  );
}
