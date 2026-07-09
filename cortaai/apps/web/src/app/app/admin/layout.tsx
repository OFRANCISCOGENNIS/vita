"use client";

// Shell do Painel do ADM. Identidade visual distinta (acento âmbar/dourado +
// selo "ADM"), sub-navegação própria e guarda de acesso para toda a subárvore
// /app/admin. Se o usuário não for admin, nada de dados administrativos vaza.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Flag,
  Gauge,
  ListChecks,
  Radar,
  ShieldAlert,
  ShieldX,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { EmptyState } from "@/components/ui/empty-state";

const SUBNAV = [
  { href: "/app/admin", label: "Visão geral", icon: Gauge, exact: true },
  { href: "/app/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/app/admin/jobs", label: "Fila de jobs", icon: ListChecks },
  { href: "/app/admin/conteudo", label: "Conteúdo", icon: Flag },
  { href: "/app/admin/nichos", label: "Radar & nichos", icon: Radar },
  { href: "/app/admin/sistema", label: "Sistema", icon: SlidersHorizontal },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();

  // Guarda: sem admin, mostra estado de acesso restrito (não renderiza dados).
  if (!user || !user.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <EmptyState
          variant="queue"
          title="Acesso restrito"
          description="Esta área é exclusiva para administradores da plataforma CortaAí. Se você acredita que deveria ter acesso, fale com o time."
          action={
            <span className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300">
              <ShieldX className="h-4 w-4" aria-hidden /> Permissão de administrador necessária
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-admin-shell>
      {/* Cabeçalho identitário do ADM — acento âmbar/dourado, distinto do violeta do criador */}
      <header className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/15 via-surface-1 to-surface-1 p-5 shadow-card">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-glow">
            <ShieldAlert className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-white sm:text-2xl">Painel do ADM</h1>
              <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-black">
                ADM
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-zinc-400">
              Visão da plataforma inteira — {user.name} · {user.email}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Sistema operacional
          </span>
        </div>
      </header>

      {/* Sub-navegação do ADM (acento âmbar quando ativo) */}
      <nav
        aria-label="Seções do painel administrativo"
        className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-1 p-1"
      >
        {SUBNAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
                active
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
