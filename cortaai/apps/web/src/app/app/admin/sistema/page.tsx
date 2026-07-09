"use client";

// Painel do ADM · Sistema — feature flags (persistidas em localStorage) e
// card de "Saúde do sistema" com pills de status por componente.

import { useEffect, useState } from "react";
import { Activity, RotateCcw } from "lucide-react";
import { systemHealth, type HealthStatus } from "@/lib/admin-data";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { FLAG_META, useAdminFlagsStore, type AdminFlags } from "@/store/admin-flags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

const HEALTH_STYLE: Record<HealthStatus, { label: string; dot: string; text: string; ring: string }> = {
  operacional: { label: "Operacional", dot: "bg-emerald-400", text: "text-emerald-300", ring: "ring-emerald-400/30" },
  degradado: { label: "Degradado", dot: "bg-amber-400", text: "text-amber-300", ring: "ring-amber-400/30" },
  fora: { label: "Fora do ar", dot: "bg-rose-400", text: "text-rose-300", ring: "ring-rose-400/30" },
};

export default function AdminSystemPage() {
  const flags = useAdminFlagsStore((s) => s.flags);
  const hydrated = useAdminFlagsStore((s) => s.hydrated);
  const toggle = useAdminFlagsStore((s) => s.toggle);
  const reset = useAdminFlagsStore((s) => s.reset);

  // Evita divergência SSR/cliente: só mostra os valores após a hidratação do store.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && hydrated;

  function onToggle(key: keyof AdminFlags, label: string) {
    toggle(key);
    const next = !flags[key];
    toast(`${label} ${next ? "ativado" : "desativado"}`, {
      description: "Configuração salva neste dispositivo.",
      variant: next ? "success" : "info",
    });
  }

  function onReset() {
    reset();
    toast("Configurações restauradas", { description: "As feature flags voltaram ao padrão.", variant: "success" });
  }

  const worst = systemHealth.some((h) => h.status === "fora")
    ? "fora"
    : systemHealth.some((h) => h.status === "degradado")
      ? "degradado"
      : "operacional";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Feature flags */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Feature flags & configurações</CardTitle>
          <Button size="sm" variant="ghost" onClick={onReset} disabled={!ready}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
          </Button>
        </CardHeader>
        <CardContent className="space-y-1">
          {!ready ? (
            <div className="space-y-3 py-1">
              {Array.from({ length: FLAG_META.length }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            FLAG_META.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4 rounded-xl px-1 py-2.5">
                <Switch
                  checked={flags[f.key]}
                  onChange={() => onToggle(f.key, f.label)}
                  label={f.label}
                  description={f.description}
                />
              </div>
            ))
          )}
          <p className="pt-2 text-[11px] text-zinc-500">
            As flags são salvas em <code className="text-zinc-400">localStorage</code> (sem backend neste ambiente).
          </p>
        </CardContent>
      </Card>

      {/* Saúde do sistema */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            <Activity className="mr-2 inline h-4 w-4 text-amber-400" aria-hidden />
            Saúde do sistema
          </CardTitle>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
              HEALTH_STYLE[worst].text,
              HEALTH_STYLE[worst].ring,
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", HEALTH_STYLE[worst].dot)} aria-hidden />
            {worst === "operacional" ? "Todos operacionais" : HEALTH_STYLE[worst].label}
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          {systemHealth.map((h) => {
            const s = HEALTH_STYLE[h.status];
            return (
              <div key={h.key} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{h.label}</p>
                  <p className="truncate text-xs text-zinc-500">{h.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-xs text-zinc-500">{h.latencyMs} ms</span>
                  <Badge
                    variant={h.status === "operacional" ? "success" : h.status === "degradado" ? "warning" : "danger"}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
                    {s.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
