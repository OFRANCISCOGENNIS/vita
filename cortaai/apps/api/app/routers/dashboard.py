from __future__ import annotations

from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Cut, Job, Project, TrendVideo, User
from app.schemas import DashboardStatsOut, NicheHighlight, ProjectOut, UsagePoint

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStatsOut)
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardStatsOut:
    cuts_generated = (
        db.execute(
            sa.select(sa.func.count(Cut.id)).join(Project, Cut.project_id == Project.id).where(Project.user_id == user.id)
        ).scalar_one()
        or 0
    )
    recent = (
        db.execute(sa.select(Project).where(Project.user_id == user.id).order_by(Project.created_at.desc()).limit(5))
        .scalars()
        .all()
    )

    # Minutos processados = soma da duração dos vídeos-fonte do usuário (dado real,
    # sem cota de plano).
    total_seconds = (
        db.execute(
            sa.select(sa.func.coalesce(sa.func.sum(Project.duration_seconds), 0.0)).where(Project.user_id == user.id)
        ).scalar_one()
        or 0.0
    )
    minutes_processed = round(float(total_seconds) / 60.0, 1)

    # usage series: minutes of source video processed per day (last 14 days)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=14)
    projects_14d = (
        db.execute(sa.select(Project).where(Project.user_id == user.id, Project.created_at >= since)).scalars().all()
    )
    per_day: dict[str, float] = {}
    for p in projects_14d:
        created = p.created_at if p.created_at.tzinfo else p.created_at.replace(tzinfo=timezone.utc)
        key = created.strftime("%Y-%m-%d")
        per_day[key] = per_day.get(key, 0.0) + (p.duration_seconds or 0) / 60.0
    usage_series = [
        UsagePoint(date=(now - timedelta(days=d)).strftime("%Y-%m-%d"), minutes=round(per_day.get((now - timedelta(days=d)).strftime("%Y-%m-%d"), 0.0), 1))
        for d in range(13, -1, -1)
    ]

    # niche highlights: top trend video per niche by retention index (top 3 niches)
    top_videos = (
        db.execute(sa.select(TrendVideo).order_by(TrendVideo.retention_index.desc()).limit(30)).scalars().all()
    )
    seen: set[str] = set()
    highlights: list[NicheHighlight] = []
    for v in top_videos:
        if v.niche in seen:
            continue
        seen.add(v.niche)
        highlights.append(
            NicheHighlight(
                niche=v.niche,
                headline=f"“{v.title}” está com índice de retenção {v.retention_index:.0f} no nicho {v.niche}.",
                retention_index=v.retention_index,
                trend_video_id=v.id,
            )
        )
        if len(highlights) >= 3:
            break

    return DashboardStatsOut(
        minutes_processed=minutes_processed,
        cuts_generated=int(cuts_generated),
        recent_projects=[ProjectOut.model_validate(p) for p in recent],
        usage_series=usage_series,
        niche_highlights=highlights,
    )
