"""Radar Viral REAL sem chave (keyless via yt-dlp).

Como o ambiente bloqueia rede externa, o módulo ``yt_dlp`` é MOCKADO para exercitar:
  (1) caminho de sucesso: JSON do yt_dlp -> item -> TrendVideo (mapeamento + upsert);
  (2) caminho de falha: sem rede/bloqueado -> fallback para o seed/mock, sem exceção.
"""
from __future__ import annotations

import contextlib


class _FakeYDL:
    """Dubla ``yt_dlp.YoutubeDL``: devolve um playlist 'flat' para buscas
    ``ytsearch...`` e um info completo por vídeo caso contrário."""

    _VIDEOS = {
        "vid001": {
            "id": "vid001",
            "title": "O erro que te mantém pobre",
            "channel": "Primo Investidor",
            "webpage_url": "https://www.youtube.com/watch?v=vid001",
            "thumbnail": "https://i.ytimg.com/vi/vid001/hq.jpg",
            "duration": 42,
            "view_count": 2_800_000,
            "like_count": 180_000,
            "comment_count": 13_000,
            "upload_date": "20260701",
            "language": "pt",
        },
        "vid002": {
            "id": "vid002",
            "title": "Quanto rende 1.000 reais no CDB",
            "channel": "Papo de Carteira",
            "webpage_url": "https://www.youtube.com/watch?v=vid002",
            "thumbnails": [{"url": "https://i.ytimg.com/vi/vid002/hq.jpg"}],
            "duration": 38,
            "view_count": 1_450_000,
            "like_count": 80_000,
            "comment_count": 5_600,
            "timestamp": 1_782_000_000,
        },
    }

    def __init__(self, opts):
        self.opts = opts

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def extract_info(self, target, download=False):
        if str(target).startswith("ytsearch"):
            return {"entries": [{"id": "vid001"}, {"id": "vid002"}]}
        for vid, info in self._VIDEOS.items():
            if vid in str(target):
                return info
        raise RuntimeError("vídeo não encontrado no dublê")


class _FakeYtDlp:
    YoutubeDL = _FakeYDL


def test_fetch_trends_maps_ytdlp_json_to_items(monkeypatch):
    from app.services import youtube_trends

    monkeypatch.setattr(youtube_trends, "yt_dlp", _FakeYtDlp)
    items = youtube_trends.fetch_trends("finanças", "finanças", limit=5)
    assert items and len(items) == 2

    first = items[0]
    assert first["platform"] == "youtube"
    assert first["external_id"] == "vid001"
    assert first["title"] == "O erro que te mantém pobre"
    assert first["channel"] == "Primo Investidor"
    assert first["views"] == 2_800_000
    assert first["likes"] == 180_000
    assert first["comments"] == 13_000
    assert first["duration_seconds"] == 42.0
    assert first["niche"] == "finanças"
    assert first["published_at"] and first["published_at"].startswith("2026-07-01")
    # segundo vídeo usa thumbnails[] + timestamp epoch
    assert items[1]["thumbnail_url"].endswith("vid002/hq.jpg")
    assert items[1]["published_at"] is not None


def test_fetch_trends_returns_none_on_failure(monkeypatch):
    from app.services import youtube_trends

    class _Boom:
        class YoutubeDL:
            def __init__(self, opts):
                raise OSError("sem rede")

    monkeypatch.setattr(youtube_trends, "yt_dlp", _Boom)
    assert youtube_trends.fetch_trends("fitness", "fitness") is None


def test_success_path_upserts_trend_video(monkeypatch):
    """Item mapeado -> TrendVideo persistido com retention_index calculado."""
    from app.database import SessionLocal, create_all_tables
    from app.models import TrendVideo
    from app.services import youtube_trends
    from app.workers.tasks_radar import upsert_trend_video

    create_all_tables()
    monkeypatch.setattr(youtube_trends, "yt_dlp", _FakeYtDlp)
    items = youtube_trends.fetch_trends("finanças", "finanças")
    db = SessionLocal()
    try:
        video = upsert_trend_video(db, items[0])
        db.commit()
        assert isinstance(video, TrendVideo)
        assert video.external_id == "vid001"
        assert video.views == 2_800_000
        assert 0 <= video.retention_index <= 100
        assert video.views_per_hour > 0
    finally:
        db.close()


def test_fetch_youtube_trending_falls_back_to_seed(monkeypatch):
    """Sem dados reais (yt_dlp falha), fetch_youtube_trending cai no mock
    determinístico sem levantar exceção — o Radar nunca quebra offline."""
    from app.services import youtube_trends
    from app.workers import tasks_radar

    # força o fetch real a retornar None (cache Redis indisponível nos testes)
    monkeypatch.setattr(youtube_trends, "fetch_trends", lambda *a, **k: None)
    items = tasks_radar.fetch_youtube_trending("games", query="speedrun", period="7d")
    assert isinstance(items, list) and len(items) >= 1
    assert all(it["niche"] == "games" for it in items)


def test_fetch_youtube_trending_uses_real_when_available(monkeypatch):
    from app.services import youtube_trends
    from app.workers import tasks_radar

    real = [{
        "platform": "youtube", "external_id": "real42", "url": "u", "title": "t",
        "channel": "c", "thumbnail_url": None, "niche": "tecnologia", "language": "pt-BR",
        "duration_seconds": 30.0, "views": 100, "likes": 5, "comments": 1, "published_at": None,
    }]
    monkeypatch.setattr(youtube_trends, "fetch_trends", lambda *a, **k: real)
    with contextlib.suppress(Exception):
        items = tasks_radar.fetch_youtube_trending("tecnologia")
        assert items == real
