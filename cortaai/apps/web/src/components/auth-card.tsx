"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { googleEnabled, initGoogle, loadGis, renderGoogleButton } from "@/lib/google";
import { Logo } from "./logo";
import { Button } from "./ui/button";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-line bg-surface-1 p-8 shadow-card">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function GoogleButton({
  onClick,
  onCredential,
  loading,
}: {
  /** Fallback de demonstração (usado quando o Google não está configurado). */
  onClick: () => void;
  /** Recebe o ID token (JWT) real quando o login com Google conclui. */
  onCredential?: (idToken: string) => void;
  loading?: boolean;
}) {
  const enabled = googleEnabled();
  const containerRef = useRef<HTMLDivElement>(null);
  const [gisReady, setGisReady] = useState(false);
  const [gisFailed, setGisFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !onCredential) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        initGoogle(onCredential);
        // Google renderiza o próprio botão dentro do container.
        renderGoogleButton(containerRef.current, { width: 360 });
        setGisReady(true);
      })
      .catch(() => {
        if (!cancelled) setGisFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // onCredential é estável o suficiente por página; recarregar em toda troca
    // recriaria o botão. Intencionalmente rodamos uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Fluxo REAL do Google (Client ID configurado e sem falha no GIS).
  if (enabled && onCredential && !gisFailed) {
    return (
      <div>
        <div
          ref={containerRef}
          className="flex min-h-[44px] justify-center [color-scheme:dark]"
          aria-label="Entrar com o Google"
        />
        {!gisReady && (
          <div
            className="h-11 w-full animate-pulse rounded-full bg-surface-3"
            aria-hidden
          />
        )}
      </div>
    );
  }

  // Fallback de demonstração: sem Client ID (ou GIS indisponível) o botão
  // continua funcional, entrando com um usuário de demonstração.
  return (
    <div>
      <Button
        variant="secondary"
        className="w-full"
        onClick={onClick}
        loading={loading}
        type="button"
        aria-label="Continuar com Google (modo demonstração)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5L1.2 17.3C3.2 21.3 7.3 24 12 24z" />
          <path fill="#FBBC05" d="M5.1 14.3c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.2 6.7C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l3.9-3z" />
          <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.4-3.3C17.9 1 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.7l3.9 3c1-2.9 3.7-5 6.9-5z" />
        </svg>
        Continuar com Google
      </Button>
      <p className="mt-1.5 text-center text-[11px] text-zinc-600">modo demonstração</p>
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-zinc-600">
      <span className="h-px flex-1 bg-line" />
      ou
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
