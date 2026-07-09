"use client";

// Applies the resolved theme to <html> (data-theme + .dark class) whenever the
// stored preference changes, and follows the OS setting live while in "system".
// The anti-FOUC script in the root layout sets the initial value before paint,
// so this only reconciles subsequent changes.

import { useEffect } from "react";
import { resolveTheme, useThemeStore } from "@/store/theme";

function applyTheme(resolved: "dark" | "light") {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const hydrated = useThemeStore((s) => s.hydrated);

  // Apply on preference change (after hydration so we don't fight the FOUC script).
  useEffect(() => {
    if (!hydrated) return;
    applyTheme(resolveTheme(theme));
  }, [theme, hydrated]);

  // Follow the OS setting live while in "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return <>{children}</>;
}
