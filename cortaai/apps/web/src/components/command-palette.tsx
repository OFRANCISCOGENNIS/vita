"use client";

// Command palette (Ctrl/⌘K). Custom overlay with fuzzy search + full keyboard
// navigation. Navigate to any app route or run a quick action. Opens everywhere
// (including the editor — Ctrl+K doesn't clash with the editor's own keys).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Library,
  ImagePlus,
  Image as ImageIcon,
  LogOut,
  Palette,
  PlusCircle,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SunMoon,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useThemeStore } from "@/store/theme";
import { useOnboardingStore } from "@/store/onboarding";
import { toast } from "@/store/toast";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string;
  run: () => void;
}

/** Simple subsequence fuzzy score — higher is better, null when no match. */
function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === c) {
        found = j;
        break;
      }
    }
    if (found === -1) return null;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak + (found === 0 ? 2 : 0);
    ti = found + 1;
  }
  return score;
}

export function CommandPalette({ isEditor = false }: { isEditor?: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const commands = useMemo<Command[]>(() => {
    const nav = (href: string, label: string, hint: string, icon: LucideIcon, keywords = ""): Command => ({
      id: `nav:${href}`,
      label,
      hint,
      icon,
      keywords,
      run: () => {
        router.push(href);
        close();
      },
    });
    const list: Command[] = [
      nav("/app", "Painel", "Ir para o painel", LayoutDashboard, "dashboard inicio home"),
      nav("/app/novo", "Novo vídeo", "Enviar um vídeo para editar", PlusCircle, "criar upload novo projeto"),
      nav("/app/fotos", "Editor de Fotos", "Editar e retocar imagens", ImagePlus, "fotos imagem retoque"),
      nav("/app/gerar", "Gerar vídeo (IA)", "Texto ou imagem vira vídeo (Wan2.2, self-host)", Wand2, "gerar ia wan video texto"),
      nav("/app/capa", "Estúdio de Capa", "Desenhar capas e thumbnails", ImageIcon, "capa thumbnail"),
      nav("/app/projetos", "Projetos", "Seus projetos", FolderOpen, "obras"),
      nav("/app/exportacoes", "Exportações", "Renderizações e downloads", Download, "renders downloads"),
      nav("/app/biblioteca", "Biblioteca", "Seus clipes salvos", Library, "clipes"),
      nav("/app/marca", "Kit de marca", "Logo, fontes e cores", Palette, "branding marca"),
      nav("/app/configuracoes", "Configurações", "Perfil e preferências", Settings, "perfil ajustes conta"),
    ];
    if (user?.isAdmin) {
      list.push(nav("/app/admin", "Admin", "Painel administrativo", ShieldCheck, "administracao metricas"));
    }
    list.push(
      {
        id: "action:theme",
        label: "Alternar tema",
        hint: "Claro / escuro / sistema",
        icon: SunMoon,
        keywords: "tema dark light modo",
        run: () => {
          cycleTheme();
          close();
        },
      },
      {
        id: "action:tour",
        label: "Refazer tour guiado",
        hint: "Rever a apresentação",
        icon: RotateCcw,
        keywords: "onboarding tutorial ajuda",
        run: () => {
          resetOnboarding();
          router.push("/app");
          toast("Tour reiniciado", { variant: "info" });
          close();
        },
      },
      {
        id: "action:help",
        label: "Atalhos de teclado",
        hint: "Ver todos os atalhos",
        icon: HelpCircle,
        keywords: "ajuda shortcuts teclas",
        run: () => {
          close();
          window.dispatchEvent(new CustomEvent("cortaai:open-help"));
        },
      },
      {
        id: "action:logout",
        label: "Sair da conta",
        hint: "Encerrar sessão",
        icon: LogOut,
        keywords: "logout sair deslogar",
        run: () => {
          close();
          logout();
          router.push("/");
        },
      },
    );
    return list;
  }, [router, user, cycleTheme, resetOnboarding, logout, close]);

  const results = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((c) => ({ c, score: fuzzyScore(query.trim(), `${c.label} ${c.keywords}`) }))
      .filter((x): x is { c: Command; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [commands, query]);

  // Global open shortcut (Ctrl/⌘K), ignoring the editor's typing fields is fine
  // since Ctrl+K isn't used for typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset + focus on open; restore focus on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      setQuery("");
      setActive(0);
      // focus after paint
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    restoreFocusRef.current?.focus?.();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open, results.length]);

  if (!open) return null;
  // (isEditor is accepted for API symmetry with GlobalShortcuts; Ctrl+K is safe
  // in the editor so the palette stays available everywhere.)
  void isEditor;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
    >
      <button aria-label="Fechar" tabIndex={-1} onClick={close} className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-2xl animate-fade-up"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comandos, páginas, ações..."
            aria-label="Buscar comandos"
            aria-controls="cmd-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            role="combobox"
            aria-expanded
            className="h-12 w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none"
          />
          <kbd className="hidden rounded-md border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline">
            Esc
          </kbd>
        </div>
        <ul ref={listRef} id="cmd-list" role="listbox" aria-label="Comandos" className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-zinc-500">Nenhum comando encontrado.</li>
          ) : (
            results.map((c, i) => {
              const Icon = c.icon;
              const selected = i === active;
              return (
                <li key={c.id} data-index={i}>
                  <button
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => c.run()}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      selected ? "bg-violet-500/15 text-white" : "text-zinc-300 hover:bg-white/5",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-violet-300" : "text-zinc-500")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.label}</span>
                      <span className="block truncate text-xs text-zinc-500">{c.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
