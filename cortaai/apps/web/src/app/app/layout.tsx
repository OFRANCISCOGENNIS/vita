"use client";

// Authenticated shell: sidebar + topbar + auth guard.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Download,
  FolderOpen,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Palette,
  PlusCircle,
  Radar,
  Settings,
  ShieldCheck,
  Wand2,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useRenderQueueStore } from "@/store/render-queue";

const NAV = [
  { href: "/app", label: "Painel", icon: LayoutDashboard, exact: true },
  { href: "/app/radar", label: "Radar Viral", icon: Radar },
  { href: "/app/novo", label: "Novo projeto", icon: PlusCircle },
  { href: "/app/estudio", label: "Estúdio IA", icon: Wand2 },
  { href: "/app/projetos", label: "Projetos", icon: FolderOpen },
  { href: "/app/exportacoes", label: "Exportações", icon: Download },
  { href: "/app/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/app/marca", label: "Kit de marca", icon: Palette },
  { href: "/app/configuracoes", label: "Configurações", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated, logout } = useAuthStore();
  const resumeSimulations = useRenderQueueStore((s) => s.resumeSimulations);
  const runningRenders = useRenderQueueStore(
    (s) => s.items.filter((i) => i.status === "running" || i.status === "queued").length,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !user) router.replace("/entrar");
  }, [hydrated, user, router]);

  useEffect(() => {
    // Restart simulated render workers persisted from a previous session.
    resumeSimulations();
  }, [resumeSimulations]);

  useEffect(() => setMobileOpen(false), [pathname]);

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Carregando sessão">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  const isEditor = pathname?.startsWith("/app/editor/");

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo href="/app" />
        <button
          className="rounded-lg p-1.5 text-zinc-400 hover:text-white lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Menu do aplicativo">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                active
                  ? "bg-gradient-to-r from-violet-600/25 to-fuchsia-600/15 text-white ring-1 ring-inset ring-violet-500/30"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden />
              {item.label}
              {item.href === "/app/exportacoes" && runningRenders > 0 && (
                <Badge variant="accent" className="ml-auto">{runningRenders}</Badge>
              )}
            </Link>
          );
        })}
        {user.isAdmin && (
          <Link
            href="/app/admin"
            aria-current={pathname?.startsWith("/app/admin") ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
              pathname?.startsWith("/app/admin")
                ? "bg-gradient-to-r from-violet-600/25 to-fuchsia-600/15 text-white ring-1 ring-inset ring-violet-500/30"
                : "text-zinc-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
            Admin
          </Link>
        )}
      </nav>
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-bold text-white"
            aria-hidden
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
          <button
            onClick={() => {
              logout();
              router.push("/");
            }}
            aria-label="Sair da conta"
            title="Sair"
            className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface-1/70 backdrop-blur lg:block">
        {sidebar}
      </aside>
      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            tabIndex={-1}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-surface-1">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-lg p-2 text-zinc-400 hover:text-white lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1" />
          <Link
            href="/app/novo"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <PlusCircle className="h-4 w-4" aria-hidden /> Novo projeto
          </Link>
        </header>
        <main className={cn("flex-1", isEditor ? "" : "px-4 py-6 sm:px-6 lg:px-8")}>{children}</main>
      </div>
    </div>
  );
}
