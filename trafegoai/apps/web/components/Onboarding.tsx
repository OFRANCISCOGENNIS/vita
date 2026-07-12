'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Step { done: boolean; title: string; hint: string; href: string; cta: string }

/**
 * Onboarding guiado: conectar 1ª conta → ver o 1º diagnóstico da IA.
 * Aparece uma vez (marcado no localStorage) enquanto os passos não estão completos.
 * No modo demo o seed já traz contas conectadas, então ele reflete o progresso real.
 */
export function Onboarding() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('trafegoai-onboarded') === '1') return;
    Promise.all([
      api.get<unknown[]>('/connections', true).catch(() => []),
      api.get<unknown[]>('/insights/recommendations', true).catch(() => []),
    ]).then(([conns, recs]) => {
      const hasConn = conns.length > 0;
      const sawDiag = localStorage.getItem('trafegoai-saw-diagnostic') === '1';
      const s: Step[] = [
        { done: hasConn, title: 'Conecte sua primeira conta', hint: 'Google, Meta ou TikTok Ads via OAuth oficial.', href: '/conexoes', cta: 'Conectar conta' },
        { done: sawDiag, title: 'Veja o diagnóstico da IA', hint: `${recs.length} recomendações prontas para você.`, href: '/recomendacoes', cta: 'Ver diagnóstico' },
        { done: false, title: 'Aplique ou crie uma automação', hint: 'Aplique uma recomendação com 1 clique ou crie uma regra.', href: '/regras', cta: 'Ver automações' },
      ];
      setSteps(s);
      setDismissed(false);
    });
  }, []);

  function close() {
    localStorage.setItem('trafegoai-onboarded', '1');
    setDismissed(true);
  }

  if (dismissed || !steps) return null;
  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="mb-6 rounded-xl border border-accent/40 bg-accent/5 p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">👋 Bem-vindo ao TrafegoAI</h2>
          <p className="text-sm text-muted">Complete os primeiros passos ({completed}/{steps.length}) para tirar o máximo do painel.</p>
        </div>
        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={close}>Dispensar</button>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className={`rounded-lg border p-3 ${s.done ? 'border-green-500/40 bg-green-500/5' : 'border-border'}`}>
            <p className="flex items-center gap-2 font-medium">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${s.done ? 'bg-green-500 text-white' : 'bg-border text-ink-2'}`}>
                {s.done ? '✓' : i + 1}
              </span>
              {s.title}
            </p>
            <p className="mt-1 text-xs text-ink-2">{s.hint}</p>
            {!s.done && (
              <Link href={s.href} className="btn-primary mt-3 !py-1.5 !text-xs" onClick={() => { if (i === 1) localStorage.setItem('trafegoai-saw-diagnostic', '1'); }}>
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
