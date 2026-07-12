"use client";

// Painel do ADM · Radar & nichos — gerenciar os 8 nichos (habilitar/desabilitar
// e disparar re-scan). Re-scan é um job mock: estado "varredura" temporário +
// toast, depois atualiza o "último scan".

import { useEffect, useRef, useState } from "react";
import { Loader2, Radar as RadarIcon, RefreshCw } from "lucide-react";
import { adminNiches, type AdminNiche } from "@/lib/admin-data";
import { MOCK_NOW } from "@/lib/mock-data";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

export default function AdminNichesPage() {
  const [niches, setNiches] = useState<AdminNiche[] | null>(null);
  const [scanning, setScanning] = useState<Record<string, boolean>>({});
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setNiches(adminNiches.map((n) => ({ ...n }))), 360);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => clearTimeout(id));
  }, []);

  function toggle(n: AdminNiche) {
    const next = !n.enabled;
    setNiches((prev) => (prev ? prev.map((x) => (x.niche === n.niche ? { ...x, enabled: next } : x)) : prev));
    toast(next ? "Nicho ativado no Radar" : "Nicho desativado", {
      description: `${cap(n.niche)} ${next ? "voltou a ser rastreado" : "não será mais rastreado"}.`,
      variant: next ? "success" : "info",
    });
  }

  function rescan(n: AdminNiche) {
    if (scanning[n.niche]) return;
    setScanning((s) => ({ ...s, [n.niche]: true }));
    toast("Re-scan disparado", { description: `Varredura do nicho ${cap(n.niche)} enfileirada.`, variant: "success" });
    const id = window.setTimeout(() => {
      setNiches((prev) =>
        prev
          ? prev.map((x) =>
              x.niche === n.niche
                ? { ...x, lastScan: new Date(MOCK_NOW).toISOString(), videosTracked: x.videosTracked + Math.round(x.videosTracked * 0.03) }
                : x,
            )
          : prev,
      );
      setScanning((s) => ({ ...s, [n.niche]: false }));
      toast("Varredura concluída", { description: `${cap(n.niche)} atualizado com novas tendências.`, variant: "success" });
    }, 1600);
    timers.current.push(id);
  }

  const enabledCount = niches?.filter((n) => n.enabled).length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            <RadarIcon className="mr-2 inline h-4 w-4 text-amber-400" aria-hidden />
            Nichos rastreados pelo Radar
          </CardTitle>
          {niches && (
            <span className="text-xs text-zinc-500">{enabledCount} de {niches.length} ativos</span>
          )}
        </CardHeader>
        <CardContent>
          {niches === null ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {niches.map((n) => {
                const busy = !!scanning[n.niche];
                return (
                  <div
                    key={n.niche}
                    className={cn(
                      "rounded-2xl border p-4 transition-colors",
                      n.enabled ? "border-line bg-surface-1" : "border-line bg-surface-1/50 opacity-70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white">{cap(n.niche)}</h3>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {n.videosTracked.toLocaleString("pt-BR")} vídeos · scan {timeAgo(n.lastScan, MOCK_NOW)}
                        </p>
                      </div>
                      <Switch checked={n.enabled} onChange={() => toggle(n)} label={`Ativar nicho ${cap(n.niche)}`} className="w-auto" />
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>Índice de tendência</span>
                        <span className="font-semibold text-amber-300">{n.trendingIndex}</span>
                      </div>
                      <Progress value={n.trendingIndex} label={`Tendência do nicho ${cap(n.niche)}`} colorClass="bg-none bg-amber-500" />
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      {n.enabled ? <Badge variant="success">Ativo</Badge> : <Badge variant="outline">Desativado</Badge>}
                      <Button size="sm" variant="secondary" onClick={() => rescan(n)} disabled={!n.enabled || busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                        {busy ? "Varrendo…" : "Disparar re-scan"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
