"use client";

// Guided tour: a custom spotlight over the sidebar nav targets (marked with
// data-tour="..."). Auto-opens once for new users on the dashboard; can be
// replayed from Configurações. Esc skips. Fully client-side + a11y.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Radar, PlusCircle, Wand2, Download, X } from "lucide-react";
import { useOnboardingStore } from "@/store/onboarding";
import { Button } from "@/components/ui/button";

interface Step {
  target: string;
  title: string;
  desc: string;
  icon: typeof Radar;
}

const STEPS: Step[] = [
  {
    target: "radar",
    title: "Radar Viral",
    desc: "Descubra o que está explodindo no seu nicho e abra o Raio-X de cada tendência.",
    icon: Radar,
  },
  {
    target: "novo",
    title: "Novo projeto",
    desc: "Suba um vídeo longo ou cole um link — a IA encontra os melhores cortes por você.",
    icon: PlusCircle,
  },
  {
    target: "estudio",
    title: "Estúdio IA",
    desc: "Gere e dirija vídeo por IA: do texto ao efeito pronto, no nosso próprio motor.",
    icon: Wand2,
  },
  {
    target: "exportacoes",
    title: "Exportações",
    desc: "Acompanhe suas renderizações e baixe os cortes em até 4K, com legenda e capa.",
    icon: Download,
  },
];

export function OnboardingTour() {
  const pathname = usePathname();
  const { completed, hydrated, complete } = useOnboardingStore();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Auto-open once for new users on the dashboard.
  useEffect(() => {
    if (hydrated && !completed && pathname === "/app") {
      setStep(0);
      setActive(true);
    }
  }, [hydrated, completed, pathname]);

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step]?.target}"]`);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect(r.width > 0 && r.height > 0 ? r : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!active) return;
    measure();
  }, [active, step, measure]);

  useEffect(() => {
    if (!active) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [active, measure]);

  const finish = useCallback(() => {
    setActive(false);
    complete();
  }, [complete]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  // Position the tooltip: beside the target (right of the sidebar) when known,
  // otherwise centered as a plain intro card (e.g. sidebar hidden on mobile).
  const pad = 8;
  const cardW = 320;
  let cardStyle: React.CSSProperties;
  if (rect) {
    const left = Math.min(rect.right + 12, window.innerWidth - cardW - pad);
    const top = Math.min(Math.max(rect.top, pad), window.innerHeight - 220);
    cardStyle = { position: "fixed", left, top, width: cardW };
  } else {
    cardStyle = {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: cardW,
    };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Tour: ${current.title}`}>
      {/* Dim + spotlight */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-violet-400 transition-all"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          }}
        />
      ) : (
        <button
          aria-label="Pular tour"
          tabIndex={-1}
          onClick={finish}
          className="absolute inset-0 cursor-default bg-black/62"
        />
      )}

      {/* Tooltip card */}
      <div
        style={cardStyle}
        className="rounded-2xl border border-line bg-surface-2 p-5 shadow-2xl animate-fade-up"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <button
            onClick={finish}
            aria-label="Pular tour"
            className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="mt-3 text-base font-bold text-white">{current.title}</h3>
        <p className="mt-1.5 text-sm text-zinc-400">{current.desc}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-500" aria-live="polite">
            {step + 1} de {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                Voltar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={finish}>
              Pular
            </Button>
            {isLast ? (
              <Button size="sm" onClick={finish}>
                Concluir
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Próximo <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
