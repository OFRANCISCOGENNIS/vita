from __future__ import annotations

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.errors import ApiError, not_found
from app.models import Cut, Job, Project, User
from app.schemas import (
    CutOut,
    GenerateCutsIn,
    ImportUrlIn,
    JobRef,
    ProjectOut,
    UploadCompleteIn,
    UploadInitIn,
    UploadInitOut,
    UrlPreviewOut,
)
from app.services import storage, ytdlp
from app.workers.dispatch import dispatch_task
from app.workers.tasks_analyze import analyze_task
from app.workers.tasks_import import import_url_task
from app.workers.tasks_transcribe import transcribe_task

router = APIRouter(prefix="/projects", tags=["projects"])


def _get_owned_project(db: Session, user: User, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise not_found("Projeto não encontrado.")
    return project


@router.post("/upload-init", response_model=UploadInitOut)
def upload_init(body: UploadInitIn, user: User = Depends(get_current_user)) -> UploadInitOut:
    """Chunked multipart upload to MinIO — presigns one PUT URL per chunk."""
    if body.size_bytes > 20 * 1024 * 1024 * 1024:
        raise ApiError(413, "file_too_large", "O arquivo excede o limite de 20 GB.")
    result = storage.init_multipart_upload(body.filename, body.size_bytes, body.content_type)
    return UploadInitOut(
        upload_id=result["upload_id"], chunk_size=result["chunk_size"], presigned_urls=result["presigned_urls"]
    )


@router.post("/upload-complete", response_model=ProjectOut, status_code=201)
def upload_complete(
    body: UploadCompleteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> ProjectOut:
    token = storage.decode_upload_token(body.upload_id)
    if not token or "key" not in token:
        raise ApiError(400, "invalid_upload_id", "Identificador de upload inválido.")
    storage.complete_multipart_upload(token)

    filename = token.get("filename") or "video.mp4"
    project = Project(
        user_id=user.id,
        title=filename.rsplit(".", 1)[0].replace("_", " ").strip() or "Novo projeto",
        source_type="upload",
        original_filename=filename,
        storage_key=token["key"],
        duration_seconds=900.0,  # refined by ffprobe in the transcribe worker
        resolution="1080p",
        fps=30.0,
        language="auto",
        status="transcribing",
    )
    db.add(project)
    db.flush()

    job = Job(user_id=user.id, project_id=project.id, type="transcribe", status="queued", payload={})
    db.add(job)
    db.commit()
    dispatch_task(transcribe_task, job.id, project.id)
    return ProjectOut.model_validate(project)


@router.get("/url-preview", response_model=UrlPreviewOut)
def url_preview(url: str = Query(...), user: User = Depends(get_current_user)) -> UrlPreviewOut:
    preview = ytdlp.url_preview(url)
    return UrlPreviewOut(
        title=preview["title"],
        channel=preview.get("channel"),
        duration_seconds=preview.get("duration_seconds"),
        thumbnail_url=preview.get("thumbnail_url"),
        available_resolutions=preview.get("available_resolutions", []),
    )


@router.post("/import-url", response_model=ProjectOut, status_code=201)
def import_url(body: ImportUrlIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ProjectOut:
    preview = ytdlp.url_preview(body.url)
    duration = preview.get("duration_seconds") or 900.0

    project = Project(
        user_id=user.id,
        title=preview["title"],
        source_type=ytdlp.detect_source_type(body.url),
        source_url=body.url,
        duration_seconds=duration,
        resolution=body.quality if body.quality in ("720p", "1080p", "1440p", "2160p") else "1080p",
        fps=30.0,
        language="auto",
        status="importing",
        thumbnail_url=preview.get("thumbnail_url"),
    )
    db.add(project)
    db.flush()

    job = Job(user_id=user.id, project_id=project.id, type="import", status="queued", payload={"url": body.url, "quality": body.quality})
    db.add(job)
    db.commit()
    dispatch_task(import_url_task, job.id, project.id, body.url, body.quality)
    return ProjectOut.model_validate(project)


@router.get("", response_model=list[ProjectOut])
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ProjectOut]:
    projects = (
        db.execute(sa.select(Project).where(Project.user_id == user.id).order_by(Project.created_at.desc()))
        .scalars()
        .all()
    )
    return [ProjectOut.model_validate(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ProjectOut:
    return ProjectOut.model_validate(_get_owned_project(db, user, project_id))


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    project = _get_owned_project(db, user, project_id)
    db.delete(project)
    db.commit()
    return None


@router.post("/{project_id}/generate-cuts", response_model=JobRef, status_code=202)
def generate_cuts(
    project_id: str,
    body: GenerateCutsIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobRef:
    project = _get_owned_project(db, user, project_id)
    if project.status not in ("ready", "analyzing"):
        raise ApiError(409, "project_not_ready", "O projeto ainda está sendo processado. Aguarde a importação/transcrição.")
    job = Job(
        user_id=user.id,
        project_id=project.id,
        type="analyze",
        status="queued",
        payload={"mode": body.mode, "aggressiveness": body.aggressiveness, "count": body.count},
    )
    db.add(job)
    db.commit()
    dispatch_task(analyze_task, job.id, project.id, body.mode, body.aggressiveness, body.count)
    return JobRef(job_id=job.id)


@router.get("/{project_id}/cuts", response_model=list[CutOut])
def list_cuts(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[CutOut]:
    project = _get_owned_project(db, user, project_id)
    cuts = (
        db.execute(sa.select(Cut).where(Cut.project_id == project.id).order_by(Cut.viral_score.desc()))
        .scalars()
        .all()
    )
    return [CutOut.model_validate(c) for c in cuts]
