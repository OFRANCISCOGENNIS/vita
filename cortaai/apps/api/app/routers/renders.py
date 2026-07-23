from __future__ import annotations

import io
import zipfile

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.errors import ApiError, not_found
from app.models import Cut, Job, User
from app.routers.cuts import get_owned_cut
from app.schemas import BatchZipIn, BatchZipOut, JobOut, RenderBatchOut, RenderJobOut, RenderRequestIn
from app.services import storage
from app.workers.dispatch import dispatch_task
from app.workers.tasks_render import render_task

router = APIRouter(prefix="/renders", tags=["renders"])


@router.post("", response_model=RenderBatchOut, status_code=202)
def create_renders(
    body: RenderRequestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> RenderBatchOut:
    # Sem planos: qualquer resolução é permitida para qualquer usuário.
    cuts: list[Cut] = [get_owned_cut(db, user, cut_id) for cut_id in body.cut_ids]

    jobs: list[Job] = []
    for cut in cuts:
        job = Job(
            user_id=user.id,
            project_id=cut.project_id,
            cut_id=cut.id,
            type="render",
            status="queued",
            payload={
                "resolution": body.resolution,
                "fps": body.fps,
                "codec": body.codec,
                "preset": body.preset,
            },
        )
        db.add(job)
        jobs.append(job)
    db.commit()
    for job in jobs:
        dispatch_task(render_task, job.id)
    return RenderBatchOut(jobs=[JobOut.model_validate(j) for j in jobs])


def _render_job_out(job: Job) -> RenderJobOut:
    out = RenderJobOut.model_validate(job)
    outputs = (job.payload or {}).get("outputs") or {}
    if job.status == "done" and outputs:
        out.download_url = outputs.get("downloadUrl")
        out.srt_url = outputs.get("srtUrl")
        out.thumb_url = outputs.get("thumbUrl")
        out.meta_txt_url = outputs.get("metaTxtUrl")
    return out


@router.get("/{job_id}", response_model=RenderJobOut)
def get_render(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RenderJobOut:
    job = db.get(Job, job_id)
    if job is None or job.user_id != user.id or job.type != "render":
        raise not_found("Job de renderização não encontrado.")
    return _render_job_out(job)


@router.post("/batch-zip", response_model=BatchZipOut)
def batch_zip(body: BatchZipIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> BatchZipOut:
    """Builds a real .zip from the outputs of finished render jobs."""
    jobs: list[Job] = []
    for job_id in body.job_ids:
        job = db.get(Job, job_id)
        if job is None or job.user_id != user.id or job.type != "render":
            raise not_found(f"Job {job_id} não encontrado.")
        if job.status != "done":
            raise ApiError(409, "job_not_done", "Todos os jobs precisam estar concluídos para gerar o ZIP.")
        jobs.append(job)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, job in enumerate(jobs, start=1):
            keys = (job.payload or {}).get("storageKeys") or {}
            cut = db.get(Cut, job.cut_id) if job.cut_id else None
            base = f"corte-{i:02d}-{(cut.title if cut else job.id)[:40].replace('/', '-')}"
            name_map = {
                "video": f"{base}/video.mp4",
                "srt": f"{base}/legendas.srt",
                "thumb": f"{base}/capa.png",
                "metaTxt": f"{base}/descricao.txt",
            }
            for kind, arcname in name_map.items():
                key = keys.get(kind)
                data = storage.get_bytes(key) if key else None
                if data is None:  # tolerate missing objects (mock/offline mode)
                    data = f"CortaAí — arquivo indisponível ({kind})\n".encode()
                zf.writestr(arcname, data)

    zip_key = f"exports/{user.id}/cortaai-export-{jobs[0].id[:8]}.zip"
    zip_url = storage.put_bytes(zip_key, buffer.getvalue(), "application/zip")
    return BatchZipOut(zip_url=zip_url)
