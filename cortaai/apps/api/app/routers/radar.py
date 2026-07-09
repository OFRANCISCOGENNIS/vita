from __future__ import annotations

from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.constants import NICHES
from app.database import get_db
from app.deps import get_current_user
from app.errors import ApiError, not_found
from app.models import Cut, Job, NicheAlert, NichePattern, Project, TrendAnalysis, TrendVideo, User
from app.routers.cuts import get_owned_cut
from app.schemas import (
    InspireCutIn,
    JobRef,
    NicheAlertIn,
    NicheAlertOut,
    NichePatternOut,
    NichesOut,
    TrendAnalysisOut,
    TrendListOut,
    TrendVideoOut,
    UseCaptionStyleIn,
    UseSoundIn,
)
from app.workers.dispatch import dispatch_task
from app.workers.tasks_analyze import analyze_task

router = APIRouter(prefix="/radar", tags=["radar"])

_PERIOD_HOURS = {"24h": 24, "7d": 168, "30d": 720}


def _get_trend(db: Session, video_id: str) -> TrendVideo:
    video = db.get(TrendVideo, video_id)
    if video is None:
        raise not_found("Vídeo em alta não encontrado.")
    return video


@router.get("/trends", response_model=TrendListOut)
def list_trends(
    niche: str | None = None,
    q: str | None = None,
    period: str = Query("7d", pattern="^(24h|7d|30d)$"),
    language: str | None = None,
    min_duration: float | None = Query(None, ge=0),
    max_duration: float | None = Query(None, ge=0),
    platform: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrendListOut:
    # Radar real (keyless): quando há tendências reais em cache (Redis), o worker
    # já as buscou via yt-dlp; hidratamos o banco a partir do cache antes de
    # consultar. Sem cache/offline, servimos os dados seed já persistidos — o
    # schema de resposta é idêntico nos dois casos.
    if niche:
        try:
            from app.workers.tasks_radar import hydrate_from_cache

            hydrate_from_cache(db, niche, q, period)
        except Exception:
            pass

    stmt = sa.select(TrendVideo).order_by(TrendVideo.retention_index.desc())
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_PERIOD_HOURS[period])
    stmt = stmt.where(sa.or_(TrendVideo.published_at.is_(None), TrendVideo.published_at >= cutoff))
    if niche:
        stmt = stmt.where(TrendVideo.niche == niche)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(sa.or_(sa.func.lower(TrendVideo.title).like(like), sa.func.lower(TrendVideo.channel).like(like)))
    if language:
        stmt = stmt.where(TrendVideo.language == language)
    if min_duration is not None:
        stmt = stmt.where(TrendVideo.duration_seconds >= min_duration)
    if max_duration is not None:
        stmt = stmt.where(TrendVideo.duration_seconds <= max_duration)
    if platform:
        stmt = stmt.where(TrendVideo.platform == platform)

    # Sem planos: resultados completos para todos os usuários.
    stmt = stmt.limit(100)
    items = db.execute(stmt).scalars().all()
    return TrendListOut(items=[TrendVideoOut.model_validate(v) for v in items])


@router.get("/videos/{video_id}", response_model=TrendVideoOut)
def get_trend_video(video_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TrendVideoOut:
    return TrendVideoOut.model_validate(_get_trend(db, video_id))


@router.get("/videos/{video_id}/xray", response_model=TrendAnalysisOut)
def get_trend_xray(video_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TrendAnalysisOut:
    # Sem planos: Raio-X completo liberado para todos os usuários.
    video = _get_trend(db, video_id)
    analysis = db.execute(
        sa.select(TrendAnalysis).where(TrendAnalysis.trend_video_id == video.id)
    ).scalar_one_or_none()
    if analysis is None:
        from app.workers.tasks_radar import ensure_analysis

        analysis = ensure_analysis(db, video)
        db.commit()
    return TrendAnalysisOut.model_validate(analysis)


@router.get("/niches", response_model=NichesOut)
def list_niches(user: User = Depends(get_current_user)) -> NichesOut:
    return NichesOut(niches=NICHES)


@router.get("/niches/{niche}/patterns", response_model=NichePatternOut)
def get_niche_patterns(
    niche: str,
    period: str = Query("7d", pattern="^(24h|7d|30d)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NichePatternOut:
    pattern = db.execute(
        sa.select(NichePattern).where(NichePattern.niche == niche, NichePattern.period == period)
    ).scalar_one_or_none()
    if pattern is None:
        raise not_found("Ainda não há padrões calculados para este nicho/período.")
    return NichePatternOut.model_validate(pattern)


# --- alerts ---------------------------------------------------------------

@router.post("/alerts", response_model=NicheAlertOut, status_code=201)
def create_alert(body: NicheAlertIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> NicheAlertOut:
    # Sem planos: alertas de nicho liberados para todos os usuários.
    if body.niche not in NICHES:
        raise ApiError(422, "invalid_niche", "Nicho inválido.")
    existing = db.execute(
        sa.select(NicheAlert).where(NicheAlert.user_id == user.id, NicheAlert.niche == body.niche)
    ).scalar_one_or_none()
    if existing is not None:
        existing.enabled = True
        db.commit()
        return NicheAlertOut.model_validate(existing)
    alert = NicheAlert(user_id=user.id, niche=body.niche, enabled=True)
    db.add(alert)
    db.commit()
    return NicheAlertOut.model_validate(alert)


@router.get("/alerts", response_model=list[NicheAlertOut])
def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[NicheAlertOut]:
    alerts = db.execute(sa.select(NicheAlert).where(NicheAlert.user_id == user.id)).scalars().all()
    return [NicheAlertOut.model_validate(a) for a in alerts]


@router.delete("/alerts/{alert_id}", status_code=204)
def delete_alert(alert_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    alert = db.get(NicheAlert, alert_id)
    if alert is None or alert.user_id != user.id:
        raise not_found("Alerta não encontrado.")
    db.delete(alert)
    db.commit()
    return None


# --- radar → production integrations ---------------------------------------

@router.post("/videos/{video_id}/use-sound")
def use_sound(
    video_id: str, body: UseSoundIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """Applies the trending sound of a Radar video to one of the user's cuts."""
    video = _get_trend(db, video_id)
    cut = get_owned_cut(db, user, body.cut_id)
    analysis = db.execute(sa.select(TrendAnalysis).where(TrendAnalysis.trend_video_id == video.id)).scalar_one_or_none()
    track = ((analysis.sound if analysis else None) or {}).get("track") or "Som em alta"
    cut.suggested_sound = {
        "track": track,
        "reason": f"som em alta no nicho {video.niche} esta semana",
        "trendVideoId": video.id,
    }
    db.commit()
    return {"applied": True, "cutId": cut.id, "suggestedSound": cut.suggested_sound}


@router.post("/videos/{video_id}/use-caption-style")
def use_caption_style(
    video_id: str, body: UseCaptionStyleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """Applies the Radar video caption preset to every cut of a project."""
    video = _get_trend(db, video_id)
    project = db.get(Project, body.project_id)
    if project is None or project.user_id != user.id:
        raise not_found("Projeto não encontrado.")
    analysis = db.execute(sa.select(TrendAnalysis).where(TrendAnalysis.trend_video_id == video.id)).scalar_one_or_none()
    style = (((analysis.image if analysis else None) or {}).get("captions") or {}).get("style") or "hormozi"

    cuts = db.execute(sa.select(Cut).where(Cut.project_id == project.id)).scalars().all()
    for cut in cuts:
        cut.edit_state = {**(cut.edit_state or {}), "captionPreset": style}
    # also store in the user's branding kit as the current preference
    user.branding_kit = {**(user.branding_kit or {}), "caption_preset": style}
    db.commit()
    return {"applied": True, "projectId": project.id, "captionPreset": style, "updatedCuts": len(cuts)}


@router.post("/videos/{video_id}/inspire-cut", response_model=JobRef, status_code=202)
def inspire_cut(
    video_id: str, body: InspireCutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> JobRef:
    """Creates an analyze job that generates one cut following the trend's format."""
    video = _get_trend(db, video_id)
    project = db.get(Project, body.project_id)
    if project is None or project.user_id != user.id:
        raise not_found("Projeto não encontrado.")
    analysis = db.execute(sa.select(TrendAnalysis).where(TrendAnalysis.trend_video_id == video.id)).scalar_one_or_none()
    inspiration = (analysis.structure if analysis else None) or {"idealDuration": int(video.duration_seconds or 34)}

    job = Job(
        user_id=user.id,
        project_id=project.id,
        type="analyze",
        status="queued",
        payload={"inspiration": inspiration, "trendVideoId": video.id, "mode": "viral", "count": 1},
    )
    db.add(job)
    db.commit()
    dispatch_task(analyze_task, job.id, project.id, "viral", 3, 1)
    return JobRef(job_id=job.id)
