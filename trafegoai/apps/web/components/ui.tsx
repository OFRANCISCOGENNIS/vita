'use client';

import { ReactNode, useEffect, useRef } from 'react';

export function Skeleton({ className = 'h-24 w-full' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center" role="alert">
      <span className="text-2xl" aria-hidden>⚠️</span>
      <p className="text-sm text-ink-2">{message}</p>
      <button className="btn-ghost" onClick={onRetry}>Tentar novamente</button>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-12 text-center">
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const tones = {
    neutral: 'bg-border/60 text-ink-2',
    good: 'bg-green-500/15 text-green-400',
    warn: 'bg-yellow-500/15 text-yellow-500',
    bad: 'bg-red-500/15 text-red-400',
    accent: 'bg-accent/15 text-indigo-300',
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Trend({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted">—</span>;
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={`tnum inline-flex items-center gap-0.5 text-xs font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>
      <span aria-hidden>{value > 0 ? '▲' : '▼'}</span>
      <span aria-label={`variação de ${Math.abs(value)}% vs. período anterior`}>{Math.abs(value).toLocaleString('pt-BR')}%</span>
    </span>
  );
}

/**
 * Diálogo de confirmação — usado antes de QUALQUER ação que gasta dinheiro
 * ou altera campanhas (pausar, verba, aplicar recomendação).
 */
export function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirmar', danger = false, busy = false,
  onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card w-full max-w-md shadow-2xl">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-ink-2">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button ref={ref} className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Aplicando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
