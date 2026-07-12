"use client";

// Painel do ADM · Conteúdo / moderação — projetos e cortes recentes de toda a
// plataforma com ações de sinalizar / remover (mock: estado local + toast).

import { useEffect, useMemo, useState } from "react";
import { Film, Flag, FlagOff, Scissors, Trash2 } from "lucide-react";
import { adminContent, type AdminContentItem } from "@/lib/admin-data";
import { MOCK_NOW } from "@/lib/mock-data";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";

type FilterTab = "all" | "flagged" | "cut" | "project";

export default function AdminContentPage() {
  const [items, setItems] = useState<AdminContentItem[] | null>(null);
  const [tab, setTab] = useState<FilterTab>("all");

  useEffect(() => {
    const t = setTimeout(() => setItems(adminContent.map((c) => ({ ...c }))), 360);
    return () => clearTimeout(t);
  }, []);

  const counts = useMemo(() => {
    const all = items?.length ?? 0;
    const flagged = items?.filter((i) => i.flagged).length ?? 0;
    return { all, flagged };
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((i) => {
      if (tab === "flagged") return i.flagged;
      if (tab === "cut") return i.kind === "cut";
      if (tab === "project") return i.kind === "project";
      return true;
    });
  }, [items, tab]);

  function toggleFlag(item: AdminContentItem) {
    const next = !item.flagged;
    setItems((prev) => (prev ? prev.map((i) => (i.id === item.id ? { ...i, flagged: next } : i)) : prev));
    toast(next ? "Conteúdo sinalizado" : "Sinalização removida", {
      description: `“${item.title}” ${next ? "foi enviado para revisão" : "voltou ao normal"}.`,
      variant: next ? "info" : "success",
    });
  }

  function remove(item: AdminContentItem) {
    setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
    toast("Conteúdo removido", { description: `“${item.title}” foi retirado da plataforma.`, variant: "success" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: `Tudo (${counts.all})` },
            { id: "flagged", label: `Sinalizados (${counts.flagged})` },
            { id: "cut", label: "Cortes" },
            { id: "project", label: "Projetos" },
          ]}
        />
      </div>

      {items === null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="clapper"
          title="Nada por aqui"
          description={tab === "flagged" ? "Nenhum conteúdo sinalizado no momento." : "Não há conteúdo para este filtro."}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => (
            <Card key={item.id} className={cn("transition-colors", item.flagged && "border-rose-500/40")}>
              <CardContent className="flex items-start gap-3 pt-4">
                <span
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    item.kind === "cut" ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-violet-500/15 text-violet-300",
                  )}
                  aria-hidden
                >
                  {item.kind === "cut" ? <Scissors className="h-4 w-4" /> : <Film className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={item.kind === "cut" ? "accent" : "outline"}>
                      {item.kind === "cut" ? "Corte" : "Projeto"}
                    </Badge>
                    <Badge variant="default">{item.niche}</Badge>
                    {item.flagged && <Badge variant="danger"><Flag className="h-3 w-3" aria-hidden /> Sinalizado</Badge>}
                  </div>
                  <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold text-zinc-100">{item.title}</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {item.userName} · {timeAgo(item.createdAt, MOCK_NOW)}
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => toggleFlag(item)}>
                      {item.flagged ? <FlagOff className="h-3.5 w-3.5" aria-hidden /> : <Flag className="h-3.5 w-3.5" aria-hidden />}
                      {item.flagged ? "Remover flag" : "Sinalizar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(item)} aria-label={`Remover ${item.title}`}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-400" aria-hidden /> Remover
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
