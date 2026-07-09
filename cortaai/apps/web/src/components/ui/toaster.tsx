"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useToastStore } from "@/store/toast";
import { cn } from "@/lib/utils";

const icons = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />,
  error: <XCircle className="h-5 w-5 text-rose-400" aria-hidden />,
  info: <Info className="h-5 w-5 text-sky-400" aria-hidden />,
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      aria-live="polite"
      aria-label="Notificações"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface-2/95 p-4 shadow-2xl backdrop-blur animate-fade-up",
          )}
        >
          {icons[t.variant]}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100">{t.title}</p>
            {t.description && <p className="mt-0.5 text-xs text-zinc-400">{t.description}</p>}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dispensar notificação"
            className="rounded p-1 text-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
