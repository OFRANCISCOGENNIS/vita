"use client";

// Global keyboard chords for the app shell: `g r/e/p/n` navigation, `t` theme,
// `?` help. Typing-guarded and scoped to non-editor routes (the editor owns its
// own keydown handler incl. "?"). Also hosts the app-level shortcuts help modal,
// which the command palette can open via a "cortaai:open-help" event.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useThemeStore } from "@/store/theme";
import { ShortcutsHelpModal } from "@/components/shortcuts-help-modal";

const CHORD_ROUTES: Record<string, string> = {
  r: "/app/radar",
  e: "/app/estudio",
  p: "/app/projetos",
  n: "/app/novo",
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
}

export function GlobalShortcuts({ isEditor = false }: { isEditor?: boolean }) {
  const router = useRouter();
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The palette's "Atalhos de teclado" command opens this modal from anywhere.
  useEffect(() => {
    const onHelp = () => setHelpOpen(true);
    window.addEventListener("cortaai:open-help", onHelp);
    return () => window.removeEventListener("cortaai:open-help", onHelp);
  }, []);

  useEffect(() => {
    if (isEditor) return; // editor owns its keyboard handler
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      // Don't fire while an overlay dialog is open.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      const key = e.key.toLowerCase();

      if (pendingG.current && CHORD_ROUTES[key]) {
        pendingG.current = false;
        if (gTimer.current) clearTimeout(gTimer.current);
        e.preventDefault();
        router.push(CHORD_ROUTES[key]);
        return;
      }

      if (key === "g") {
        pendingG.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => (pendingG.current = false), 900);
        return;
      }

      pendingG.current = false;

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      } else if (key === "t") {
        e.preventDefault();
        cycleTheme();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gTimer.current) clearTimeout(gTimer.current);
    };
  }, [isEditor, router, cycleTheme]);

  return <ShortcutsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />;
}
