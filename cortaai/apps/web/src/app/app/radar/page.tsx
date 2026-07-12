"use client";

// RADAR VIRAL — trend research center. Tabs: ranked trends grid + niche patterns.

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Bell, BellRing, Clock3, Music2, Quote, Search, Timer } from "lucide-react";
import * as api from "@/lib/api";
import { CAPTION_PRESETS, NICHES } from "@/lib/presets";
import type { Niche, NicheAlert, NichePattern, TrendPeriod, TrendVideo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { useFavoritesStore } from "@/store/favorites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { TrendCard } from "@/components/trend-card";

const PostTimesChart = dynamic(() => import("@/components/charts").then((m) => m.PostTimesChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[200px] w-full" />,
});

const PERIODS: { id: TrendPeriod; label: string }[] = [
  { id: "24h", label: "Últimas 24h" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
];

const PLATFORMS = [
  { id: "", label: "Todas" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
];

const LANGUAGES = [
  { id: "", label: "Qualquer idioma" },
  { id: "pt-BR", label: "Português" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
];

const DURATIONS = [
  { id: "", label: "Qualquer duração", min: undefined as number | undefined, max: undefined as number | undefined },
  { id: "curto", label: "Até 30s", min: undefined, max: 30 },
  { id: "medio", label: "30–60s", min: 30, max: 60 },
  { id: "longo", label: "60s+", min: 60, max: undefined },
];

function Chip({ active, onClick, children, ariaLabel }: { active: boolean; onClick: () => void; children: React.ReactNode; ariaLabel?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
        active
          ? "border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow"
          : "border-line bg-surface-1 text-zinc-400 hover:border-violet-500/50 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export default function RadarPage() {
  const [tab, setTab] = useState<"trends" | "favorites" | "patterns">("trends");
  const favIds = useFavoritesStore((s) => s.ids);
  const favHydrated = useFavoritesStore((s) => s.hydrated);
  const [allVideos, setAllVideos] = useState<TrendVideo[] | null>(null);
  const [niche, setNiche] = useState<Niche | "">("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<TrendPeriod>("7d");
  const [language, setLanguage] = useState("");
  const [durationId, setDurationId] = useState("");
  const [platform, setPlatform] = useState("");

  const [videos, setVideos] = useState<TrendVideo[] | null>(null);
  const [error, setError] = useState(false);

  const [alerts, setAlerts] = useState<NicheAlert[]>([]);
  const [pattern, setPattern] = useState<NichePattern | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);

  const load = useCallback(() => {
    setVideos(null);
    setError(false);
    const dur = DURATIONS.find((d) => d.id === durationId);
    api
      .getTrends({
        niche: niche || undefined,
        q: query || undefined,
        period,
        language: language || undefined,
        minDuration: dur?.min,
        maxDuration: dur?.max,
        platform: platform || undefined,
      })
      .then((r) => setVideos(r.items))
      .catch(() => setError(true));
  }, [niche, query, period, language, durationId, platform]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce free-text search
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api.getNicheAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  // Unfiltered pool so the Favoritos tab shows every saved video, independent
  // of the active trend filters.
  useEffect(() => {
    api.getTrends({ period: "30d" }).then((r) => setAllVideos(r.items)).catch(() => setAllVideos([]));
  }, []);

  const favVideos = (allVideos ?? []).filter((v) => favIds.includes(v.id));

  const patternNiche: Niche = (niche || "finanças") as Niche;
  useEffect(() => {
    if (tab !== "patterns") return;
    setPatternLoading(true);
    setPattern(null);
    api
      .getNichePatterns(patternNiche, period)
      .then(setPattern)
      .catch(() => setPattern(null))
      .finally(() => setPatternLoading(false));
  }, [tab, patternNiche, period]);

  async function toggleAlert(n: Niche) {
    const existing = alerts.find((a) => a.niche === n);
    if (existing) {
      await api.deleteNicheAlert(existing.id);
      setAlerts((prev) => prev.filter((a) => a.id !== existing.id));
      toast("Alerta removido", { description: `Você não receberá mais alertas de "${n}".`, variant: "info" });
    } else {
      const created = await api.createNicheAlert(n);
      setAlerts((prev) => [...prev, created]);
      toast("Nicho favoritado!", {
        description: `Vamos te avisar quando algo explodir em "${n}".`,
      });
    }
  }

  const alertActive = niche !== "" && alerts.some((a) => a.niche === niche);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Radar Viral</h1>
          <p className="mt-1 text-sm text-zinc-500">
            O que está explodindo agora — ranqueado por Índice de Retenção.
          </p>
        </div>
        <Tabs
          tabs={[
            { id: "trends", label: "Tendências" },
            { id: "favorites", label: favHydrated && favIds.length > 0 ? `Favoritos (${favIds.length})` : "Favoritos" },
            { id: "patterns", label: "Padrões do nicho" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* Search + niche chips */}
      <div className="space-y-3">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por palavra-chave, título ou canal..."
            aria-label="Buscar tendências por palavra-chave"
            className="h-11 w-full rounded-xl border border-line bg-surface-1 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por nicho">
          <Chip active={niche === ""} onClick={() => setNiche("")}>Todos os nichos</Chip>
          {NICHES.map((n) => (
            <Chip key={n} active={niche === n} onClick={() => setNiche(niche === n ? "" : n)}>
              <span className="capitalize">{n}</span>
              {alerts.some((a) => a.niche === n) && <BellRing className="ml-1.5 inline h-3 w-3 text-amber-300" aria-label="Alerta ativo" />}
            </Chip>
          ))}
          {niche !== "" && (
            <button
              onClick={() => toggleAlert(niche as Niche)}
              aria-pressed={alertActive}
              className={cn(
                "ml-1 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                alertActive
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                  : "border-line text-zinc-400 hover:border-amber-400/50 hover:text-amber-300",
              )}
            >
              {alertActive ? <BellRing className="h-3.5 w-3.5" aria-hidden /> : <Bell className="h-3.5 w-3.5" aria-hidden />}
              {alertActive ? "Alerta ativo" : "Ativar alerta do nicho"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros de período, idioma, duração e plataforma">
          {PERIODS.map((p) => (
            <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {PLATFORMS.map((p) => (
            <Chip key={p.id} active={platform === p.id} onClick={() => setPlatform(p.id)}>{p.label}</Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {DURATIONS.map((d) => (
            <Chip key={d.id} active={durationId === d.id} onClick={() => setDurationId(d.id)}>{d.label}</Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {LANGUAGES.map((l) => (
            <Chip key={l.id} active={language === l.id} onClick={() => setLanguage(l.id)}>{l.label}</Chip>
          ))}
        </div>
      </div>

      {tab === "favorites" ? (
        !favHydrated || allVideos === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : favVideos.length === 0 ? (
          <EmptyState
            variant="radar"
            title="Você ainda não favoritou nenhum vídeo"
            description="Toque no coração de qualquer tendência para salvá-la aqui e acompanhar de perto."
            action={<Button variant="secondary" onClick={() => setTab("trends")}>Explorar tendências</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {favVideos.map((v) => (
              <TrendCard key={v.id} video={v} />
            ))}
          </div>
        )
      ) : tab === "trends" ? (
        error ? (
          <EmptyState
            variant="radar"
            title="Falha ao carregar as tendências"
            description="O Radar não respondeu. Verifique a conexão e tente novamente."
            action={<Button onClick={load}>Tentar novamente</Button>}
          />
        ) : videos === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : videos.length === 0 ? (
          <EmptyState
            variant="search"
            title="Nada encontrado com esses filtros"
            description="Tente ampliar o período, remover a palavra-chave ou trocar de nicho."
            action={
              <Button variant="secondary" onClick={() => { setQuery(""); setNiche(""); setPeriod("30d"); setPlatform(""); setDurationId(""); setLanguage(""); }}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v, i) => (
              <TrendCard key={v.id} video={v} rank={i + 1} />
            ))}
          </div>
        )
      ) : (
        /* ---- Padrões do nicho ---- */
        <div className="space-y-6">
          <p className="text-sm text-zinc-400">
            Padrões calculados para o nicho{" "}
            <Badge variant="accent" className="capitalize">{patternNiche}</Badge>{" "}
            no período <Badge variant="outline">{period}</Badge>
            {niche === "" && <span className="ml-2 text-zinc-600">(selecione um nicho acima para trocar)</span>}
          </p>
          {patternLoading || !pattern ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Timer className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden />
                    Duração viral média
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-5xl font-extrabold text-white">
                    {pattern.avgDuration}
                    <span className="ml-1 text-lg font-medium text-zinc-500">segundos</span>
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Cortes entre {Math.max(15, pattern.avgDuration - 10)}s e {pattern.avgDuration + 12}s têm o melhor desempenho neste nicho.
                  </p>
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Top estilos de legenda</p>
                    <div className="space-y-2">
                      {pattern.topCaptionStyles.map((s) => {
                        const preset = CAPTION_PRESETS.find((p) => p.id === s.style);
                        return (
                          <div key={s.style} className="flex items-center gap-3">
                            <span className="w-28 truncate text-xs text-zinc-300">{preset?.name ?? s.style}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${s.sharePct}%` }} />
                            </div>
                            <span className="w-10 text-right font-mono text-xs text-zinc-400">{s.sharePct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <Music2 className="mr-2 inline h-4 w-4 text-fuchsia-400" aria-hidden />
                    Sons em alta na semana
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {pattern.trendingSounds.map((s, i) => (
                      <li key={s.track} className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 text-sm font-bold text-fuchsia-300">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-100">{s.track}</p>
                          <p className="text-xs text-zinc-500">{s.usedBy.toLocaleString("pt-BR")} vídeos usando</p>
                        </div>
                        <Badge variant={s.growthPct > 100 ? "success" : "info"}>+{s.growthPct}%</Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <Quote className="mr-2 inline h-4 w-4 text-emerald-400" aria-hidden />
                    Ganchos recorrentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {pattern.topHooks.map((h) => (
                      <li key={h.hook} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
                        <span className="text-sm font-medium text-zinc-200">&ldquo;{h.hook}&rdquo;</span>
                        <span className="shrink-0 text-xs text-zinc-500">{h.occurrences}× no período</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <Clock3 className="mr-2 inline h-4 w-4 text-amber-400" aria-hidden />
                    Melhores horários para postar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PostTimesChart data={pattern.bestPostTimes} />
                  <p className="mt-2 text-xs text-zinc-500">
                    Score combina alcance médio e taxa de retenção por dia/horário de publicação.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
