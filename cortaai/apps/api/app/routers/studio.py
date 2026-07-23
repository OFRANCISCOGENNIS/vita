"""ESTÚDIO IA — endpoints REST (prefixo /api/v1/studio).

8 funções de geração de vídeo por IA (estilo Kling) + galeria + templates de
efeito + conversão para Cut (integra com o editor/biblioteca).

Cada POST de geração cria uma Generation (fila) + um Job (para o WebSocket de
progresso ``/ws/progress/{jobId}``) e despacha o worker ``generate_task`` pelo
mecanismo de dispatch com fallback inline (roda sem Celery/Redis nos testes).
Sem KLING_API_KEY, o resultado é o mock determinístico (model="mock").
"""
from __future__ import annotations

import sqlalchemy as sa
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.errors import ApiError, not_found
from app.models import Cut, Generation, Job, Project, User
from app.schemas import (
    CameraIn,
    CutOut,
    EffectIn,
    EffectTemplateOut,
    EffectTemplatesOut,
    ExtendIn,
    FramesIn,
    GenerationOut,
    ImageToVideoIn,
    LipSyncIn,
    MotionBrushIn,
    TextToVideoIn,
    ToCutIn,
)
from app.services import generative, storage
from app.workers.dispatch import dispatch_task
from app.workers.tasks_generative import generate_task

router = APIRouter(prefix="/studio", tags=["studio"])


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _owned_project_id(db: Session, user: User, project_id: str | None) -> str | None:
    if project_id is None:
        return None
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise not_found("Projeto não encontrado.")
    return project.id


def _owned_generation(db: Session, user: User, generation_id: str) -> Generation:
    gen = db.get(Generation, generation_id)
    if gen is None or gen.user_id != user.id:
        raise not_found("Geração não encontrada.")
    return gen


def _owned_cut_id(db: Session, user: User, cut_id: str | None) -> str | None:
    if cut_id is None:
        return None
    cut = db.get(Cut, cut_id)
    if cut is None:
        raise not_found("Corte não encontrado.")
    project = db.get(Project, cut.project_id)
    if project is None or project.user_id != user.id:
        raise not_found("Corte não encontrado.")
    return cut.id


def _create_generation(
    db: Session,
    user: User,
    *,
    function: str,
    prompt: str | None,
    params: dict | None,
    input_asset_url: str | None = None,
    input_asset_url_2: str | None = None,
    project_id: str | None = None,
    cut_id: str | None = None,
) -> Generation:
    """Persiste a Generation + Job e despacha o worker (Celery ou inline)."""
    gen = Generation(
        user_id=user.id,
        project_id=project_id,
        cut_id=cut_id,
        function=function,
        prompt=prompt,
        params=params or {},
        input_asset_url=input_asset_url,
        input_asset_url_2=input_asset_url_2,
        status="queued",
        progress=0,
        model=generative.model_name(),
    )
    db.add(gen)
    db.flush()

    job = Job(
        user_id=user.id,
        project_id=project_id,
        type="studio",
        status="queued",
        payload={"generationId": gen.id, "function": function},
    )
    db.add(job)
    db.commit()

    dispatch_task(generate_task, job.id, gen.id)
    db.refresh(gen)
    return gen


# ---------------------------------------------------------------------------
# generation endpoints (8 funções)
# ---------------------------------------------------------------------------

@router.post("/text-to-video", response_model=GenerationOut, status_code=202)
def text_to_video(body: TextToVideoIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    gen = _create_generation(
        db, user,
        function="text_to_video",
        prompt=body.prompt,
        params=body.params.model_dump(by_alias=True),
        project_id=_owned_project_id(db, user, body.project_id),
    )
    return GenerationOut.model_validate(gen)


@router.post("/image-to-video", response_model=GenerationOut, status_code=202)
def image_to_video(body: ImageToVideoIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    gen = _create_generation(
        db, user,
        function="image_to_video",
        prompt=body.prompt,
        params=body.params.model_dump(by_alias=True),
        input_asset_url=body.input_asset_url,
        project_id=_owned_project_id(db, user, body.project_id),
    )
    return GenerationOut.model_validate(gen)


@router.post("/extend", response_model=GenerationOut, status_code=202)
def extend(body: ExtendIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    if not body.cut_id and not body.generation_id:
        raise ApiError(400, "missing_source", "Informe um corte (cutId) ou uma geração (generationId) para estender.")
    input_url = None
    if body.generation_id:
        src = _owned_generation(db, user, body.generation_id)
        input_url = src.result_url
    gen = _create_generation(
        db, user,
        function="extend",
        prompt=body.prompt,
        params=body.params.model_dump(by_alias=True),
        input_asset_url=input_url,
        cut_id=_owned_cut_id(db, user, body.cut_id),
        project_id=_owned_project_id(db, user, body.project_id),
    )
    return GenerationOut.model_validate(gen)


@router.post("/frames", response_model=GenerationOut, status_code=202)
def frames(body: FramesIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    gen = _create_generation(
        db, user,
        function="frames",
        prompt=body.prompt,
        params=body.params.model_dump(by_alias=True),
        input_asset_url=body.start_image_url,
        input_asset_url_2=body.end_image_url,
        project_id=_owned_project_id(db, user, body.project_id),
    )
    return GenerationOut.model_validate(gen)


@router.post("/motion-brush", response_model=GenerationOut, status_code=202)
def motion_brush(body: MotionBrushIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    gen = _create_generation(
        db, user,
        function="motion_brush",
        prompt=body.prompt,
        params=body.params.model_dump(by_alias=True),
        input_asset_url=body.input_asset_url,
        project_id=_owned_project_id(db, user, body.project_id),
    )
    return GenerationOut.model_validate(gen)


@router.post("/lip-sync", response_model=GenerationOut, status_code=202)
def lip_sync(body: LipSyncIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    if not body.cut_id and not body.input_asset_url:
        raise ApiError(400, "missing_source", "Informe um corte (cutId) ou um vídeo (inputAssetUrl) para a sincronia labial.")
    gen = _create_generation(
        db, user,
        function="lip_sync",
        prompt=None,
        params=body.params.model_dump(by_alias=True),
        input_asset_url=body.input_asset_url,
        cut_id=_owned_cut_id(db, user, body.cut_id),
        project_id=_owned_project_id(db, user, body.project_id),
    )
    return GenerationOut.model_validate(gen)


@router.post("/camera", response_model=GenerationOut, status_code=202)
def camera(body: CameraIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    if not body.cut_id and not body.input_asset_url:
        raise ApiError(400, "missing_source", "Informe um corte (cutId) ou um vídeo (inputAssetUrl) para dirigir a câmera.")
    gen = _create_generation(
        db, user,
        function="camera",
        prompt=body.prompt,
        params=body.params.model_dump(by_alias=True),
        input_asset_url=body.input_asset_url,
        cut_id=_owned_cut_id(db, user, body.cut_id),
        project_id=_owned_project_id(db, user, body.project_id),
    )
    return GenerationOut.model_validate(gen)


@router.post("/effect", response_model=GenerationOut, status_code=202)
def effect(body: EffectIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    gen = _create_generation(
        db, user,
        function="effect_template",
        prompt=None,
        params=body.params.model_dump(by_alias=True),
        input_asset_url=body.input_asset_url,
        project_id=_owned_project_id(db, user, body.project_id),
    )
    return GenerationOut.model_validate(gen)


# ---------------------------------------------------------------------------
# gallery / templates / to-cut
# ---------------------------------------------------------------------------

@router.get("/generations", response_model=list[GenerationOut])
def list_generations(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[GenerationOut]:
    gens = (
        db.execute(
            sa.select(Generation).where(Generation.user_id == user.id).order_by(Generation.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [GenerationOut.model_validate(g) for g in gens]


@router.get("/effect-templates", response_model=EffectTemplatesOut)
def effect_templates(user: User = Depends(get_current_user)) -> EffectTemplatesOut:
    templates = [
        EffectTemplateOut(
            id=t["id"],
            label=t["label"],
            thumbnail_url=generative.build_thumbnail_svg("effect_template", t["label"], {"template": t["id"]}),
            preview_url=generative.build_thumbnail_svg("effect_template", f"{t['label']} preview", {"template": t["id"]}),
        )
        for t in generative.EFFECT_TEMPLATES
    ]
    return EffectTemplatesOut(templates=templates)


@router.get("/generations/{generation_id}", response_model=GenerationOut)
def get_generation(generation_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GenerationOut:
    return GenerationOut.model_validate(_owned_generation(db, user, generation_id))


def _studio_project(db: Session, user: User) -> Project:
    """Projeto guarda-chuva para cortes vindos do Estúdio IA (find-or-create)."""
    project = db.execute(
        sa.select(Project).where(Project.user_id == user.id, Project.title == "Estúdio IA")
    ).scalar_one_or_none()
    if project is None:
        project = Project(
            user_id=user.id,
            title="Estúdio IA",
            source_type="upload",
            status="ready",
            resolution="1080p",
            fps=30.0,
            language="pt-BR",
        )
        db.add(project)
        db.flush()
    return project


@router.post("/generations/{generation_id}/to-cut", response_model=CutOut, status_code=201)
def generation_to_cut(
    generation_id: str,
    body: ToCutIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CutOut:
    """Cria um Cut a partir da geração (integra com editor/biblioteca)."""
    gen = _owned_generation(db, user, generation_id)
    project_id = _owned_project_id(db, user, body.project_id) or gen.project_id
    if project_id is None:
        project_id = _studio_project(db, user).id

    duration = gen.duration_seconds or float((gen.params or {}).get("duration") or (gen.params or {}).get("seconds") or 5)
    label = generative.FUNCTION_LABELS.get(gen.function, "Geração IA")
    title = (gen.prompt or f"{label} — Estúdio IA")[:120]
    cut = Cut(
        project_id=project_id,
        title=title,
        start_seconds=0.0,
        end_seconds=round(duration, 2),
        viral_score=0.0,
        mode="manual",
        status="edited",
        edit_state={
            "source": "studio",
            "generationId": gen.id,
            "function": gen.function,
            "sourceVideoUrl": gen.result_url,
            "thumbnailUrl": gen.thumbnail_url,
            "params": gen.params,
        },
    )
    db.add(cut)
    db.commit()
    return CutOut.model_validate(cut)
