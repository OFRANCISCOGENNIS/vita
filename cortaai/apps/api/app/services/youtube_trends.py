"""Radar Viral — busca REAL de tendências do YouTube SEM chave (keyless).

Usa o módulo Python ``yt_dlp`` (já é dependência) em vez da YouTube Data API v3,
portanto NÃO requer ``YOUTUBE_API_KEY``:

    1. Lista de busca (rápida, sem detalhes): ``ytsearchN:<query> #shorts`` com
       ``extract_flat`` — devolve id/título/canal/duração/views por vídeo.
    2. Enriquecimento por vídeo (sem download): ``extract_info`` completo para
       obter view_count/like_count/comment_count/duração/canal/thumbnail/data.

Tudo é embrulhado em try/except com timeout de socket. Em QUALQUER falha
(sem rede, bloqueio, região) a função devolve ``None`` e o chamador
(``app.workers.tasks_radar``) cai no seed/mock determinístico — o app nunca
quebra offline.

NOTA: este ambiente de teste bloqueia rede externa, então as chamadas ao vivo
falham aqui de propósito; os testes mockam ``yt_dlp`` para exercitar o mapeamento
e o caminho de fallback.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import yt_dlp

logger = logging.getLogger(__name__)

# Vídeo "short" tem no máximo ~3 min; usado para descartar lives/vídeos longos.
_MAX_SHORT_DURATION = 240.0


def _parse_published(info: dict) -> str | None:
    """upload_date ('YYYYMMDD') ou timestamp (epoch) -> ISO 8601 UTC."""
    ts = info.get("timestamp") or info.get("release_timestamp")
    if ts:
        try:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
        except Exception:
            pass
    upload_date = info.get("upload_date")
    if upload_date and len(str(upload_date)) == 8:
        try:
            dt = datetime.strptime(str(upload_date), "%Y%m%d").replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            pass
    return None


def _map_item(niche: str, info: dict) -> dict:
    """Mapeia o JSON do yt_dlp para o shape de item consumido por
    ``upsert_trend_video`` (idêntico ao shape do seed/mock)."""
    vid = info.get("id") or ""
    url = info.get("webpage_url") or (f"https://www.youtube.com/watch?v={vid}" if vid else "")
    thumb = info.get("thumbnail")
    if not thumb:
        thumbs = info.get("thumbnails") or []
        if thumbs:
            thumb = thumbs[-1].get("url")
    return {
        "platform": "youtube",
        "external_id": vid,
        "url": url,
        "title": info.get("title") or "Vídeo em alta",
        "channel": info.get("channel") or info.get("uploader"),
        "thumbnail_url": thumb,
        "niche": niche,
        "language": info.get("language") or "pt-BR",
        "duration_seconds": float(info.get("duration") or 0.0),
        "views": int(info.get("view_count") or 0),
        "likes": int(info.get("like_count") or 0),
        "comments": int(info.get("comment_count") or 0),
        "published_at": _parse_published(info),
    }


def fetch_trends(niche: str, query: str, limit: int = 10, timeout: int = 20) -> list[dict] | None:
    """Busca tendências reais do YouTube via yt-dlp (keyless).

    Devolve uma lista de itens (shape do seed) ou ``None`` em qualquer falha —
    o chamador deve tratar ``None`` como "sem dados reais" e usar o fallback.
    """
    search = f"ytsearch{max(int(limit), 1)}:{query} #shorts"
    try:
        flat_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": True,
            "socket_timeout": timeout,
            "noplaylist": False,
        }
        with yt_dlp.YoutubeDL(flat_opts) as ydl:
            playlist = ydl.extract_info(search, download=False)
        entries = (playlist or {}).get("entries") or []
        if not entries:
            return None

        full_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "socket_timeout": timeout,
            "noplaylist": True,
        }
        items: list[dict] = []
        for entry in entries[:limit]:
            vid = (entry or {}).get("id")
            if not vid:
                continue
            info = entry
            try:
                with yt_dlp.YoutubeDL(full_opts) as ydl:
                    info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
            except Exception:
                # enriquecimento por vídeo falhou — usa o entry "flat" mesmo.
                info = entry
            item = _map_item(niche, info)
            duration = item["duration_seconds"]
            if duration and duration > _MAX_SHORT_DURATION:
                continue  # descarta vídeos longos (não são shorts/cortes)
            if item["external_id"]:
                items.append(item)
        return items or None
    except Exception:
        logger.info("Busca keyless de tendências falhou para nicho=%s (offline/bloqueado).", niche)
        return None
