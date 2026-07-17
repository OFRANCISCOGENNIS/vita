'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';

const NAV = [
  { href: '/painel', label: 'Dashboard', icon: '📊' },
  { href: '/radar', label: 'Radar de Tendências', icon: '📡' },
  { href: '/planner', label: 'Planejador de Posts', icon: '🗓️' },
  { href: '/campanhas', label: 'Campanhas', icon: '🎯' },
  { href: '/recomendacoes', label: 'Recomendações IA', icon: '🤖' },
  { href: '/chat', label: 'Assistente', icon: '💬' },
  { href: '/regras', label: 'Automações', icon: '⚡' },
  { href: '/criativos', label: 'Criativos', icon: '🎨' },
  { href: '/metas', label: 'Metas & Previsões', icon: '🏁' },
  { href: '/relatorios', label: 'Relatórios', icon: '📄' },
  { href: '/conexoes', label: 'Conexões', icon: '🔌' },
  { href: '/auditoria', label: 'Auditoria', icon: '🧾' },
  { href: '/planos', label: 'Planos', icon: '💳' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, org, logout } = useAuthStore();
  const [light, setLight] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('light', light);
  }, [light]);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface/60 max-lg:hidden">
      <Link href="/painel" className="flex items-center gap-2 px-5 py-5">
        <span className="text-xl" aria-hidden>🚀</span>
        <span className="font-display text-lg font-bold tracking-tight">TrafegoAI</span>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Navegação principal">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname.startsWith(item.href) ? 'bg-accent/15 font-medium text-ink' : 'text-ink-2 hover:bg-border/40 hover:text-ink'
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-border p-4 text-sm">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate font-medium">{user?.name ?? '—'}</p>
            <p className="truncate text-xs text-muted">{org?.name ?? ''} · Plano {org?.plan ?? '—'}</p>
          </div>
          <button
            className="btn-ghost !px-2 !py-1"
            onClick={() => setLight((v) => !v)}
            aria-label={light ? 'Ativar modo escuro' : 'Ativar modo claro'}
            title={light ? 'Modo escuro' : 'Modo claro'}
          >
            {light ? '🌙' : '☀️'}
          </button>
        </div>
        <button
          className="btn-ghost mt-3 w-full"
          onClick={() => {
            logout();
            router.push('/login');
          }}
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
