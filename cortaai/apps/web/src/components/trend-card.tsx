"use client";

import Link from "next/link";
import { Clock, Eye, Heart, MessageCircle, TrendingUp } from "lucide-react";
import type { TrendVideo } from "@/lib/types";
import { MOCK_NOW } from "@/lib/mock-data";
import { cn, formatCompact, formatDuration, timeAgo } from "@/lib/utils";
import { useFavoritesStore } from "@/store/favorites";
import { toast } from "@/store/toast";
import { Badge } from "./ui/badge";
import { ScoreBadge } from "./score-badge";

const platformLabels: Record<TrendVideo["platform"], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

export function TrendCard({ video, rank }: { video: TrendVideo; rank?: number }) {
  const hydrated = useFavoritesStore((s) => s.hydrated);
  const isFav = useFavoritesStore((s) => s.ids.includes(video.id));
  const toggle = useFavoritesStore((s) => s.toggle);

  function onToggleFavorite(e: React.MouseEvent) {
    // The whole card is a <Link> — don't navigate when hitting the heart.
    e.preventDefault();
    e.stopPropagation();
    toggle(video.id);
    toast(isFav ? "Removido dos favoritos" : "Salvo nos favoritos", {
      description: isFav ? undefined : "Veja em Radar → Favoritos.",
      variant: isFav ? "info" : "success",
    });
  }

  return (
    <Link
      href={`/app/radar/${video.id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-card transition-all hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      <div className="relative aspect-video overflow-hidden">
        {/* Local SVG data-URI thumbnail — no external hosts */}
        <img
          src={video.thumbnailUrl}
          alt={`Thumbnail: ${video.title}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {rank != null && (
          <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white backdrop-blur" aria-label={`Posição ${rank}`}>
            {rank}
          </span>
        )}
        <span className="absolute bottom-3 right-3 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
          <Clock className="mr-1 inline h-3 w-3" aria-hidden />
          {formatDuration(video.durationSeconds)}
        </span>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={hydrated ? isFav : undefined}
          aria-label={isFav ? "Remover dos favoritos" : "Salvar nos favoritos"}
          title={isFav ? "Remover dos favoritos" : "Salvar nos favoritos"}
          className="absolute bottom-3 left-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Heart
            className={cn("h-4 w-4 transition-colors", hydrated && isFav ? "fill-rose-500 text-rose-500" : "text-white")}
            aria-hidden
          />
        </button>
        <div className="absolute right-3 top-3">
          <ScoreBadge score={video.retentionIndex} label="Índice de Retenção" />
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Badge variant="outline">{platformLabels[video.platform]}</Badge>
          <Badge variant="accent" className="capitalize">{video.niche}</Badge>
          <span>{timeAgo(video.publishedAt, MOCK_NOW)}</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-zinc-100 group-hover:text-white">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">{video.channel}</p>
        <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1" title="Visualizações por hora">
            <TrendingUp className="h-3.5 w-3.5 text-fuchsia-400" aria-hidden />
            {formatCompact(video.viewsPerHour)}/h
          </span>
          <span className="inline-flex items-center gap-1" title="Visualizações totais">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            {formatCompact(video.views)}
          </span>
          <span className="inline-flex items-center gap-1" title="Proporção de curtidas">
            <Heart className="h-3.5 w-3.5" aria-hidden />
            {((video.likes / video.views) * 100).toFixed(1).replace(".", ",")}%
          </span>
          <span className="inline-flex items-center gap-1" title="Comentários">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            {formatCompact(video.comments)}
          </span>
        </div>
      </div>
    </Link>
  );
}
