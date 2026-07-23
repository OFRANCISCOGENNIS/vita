from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.errors import not_found
from app.models import Cut, Project, User
from app.schemas import CutOut, CutPatchIn
from app.services import llm
from app.services.scoring import compute_viral_score, transcript_to_text

router = APIRouter(prefix="/cuts", tags=["cuts"])


def get_owned_cut(db: Session, user: User, cut_id: str) -> Cut:
    cut = db.get(Cut, cut_id)
    if cut is None:
        raise not_found("Corte não encontrado.")
    project = db.get(Project, cut.project_id)
    if project is None or project.user_id != user.id:
        raise not_found("Corte não encontrado.")
    return cut


@router.patch("/{cut_id}", response_model=CutOut)
def patch_cut(
    cut_id: str, body: CutPatchIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> CutOut:
    cut = get_owned_cut(db, user, cut_id)
    changed = body.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(cut, field, value)
    if changed and cut.status == "suggested" and "status" not in changed:
        cut.status = "edited"
    # re-score when the cut boundaries change
    if "start_seconds" in changed or "end_seconds" in changed:
        score, breakdown = compute_viral_score(cut.transcript, max(cut.end_seconds - cut.start_seconds, 1.0))
        cut.viral_score, cut.score_breakdown = score, breakdown
    db.commit()
    return CutOut.model_validate(cut)


@router.post("/{cut_id}/regenerate", response_model=CutOut)
def regenerate_cut(cut_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> CutOut:
    """Regenerates AI copy (titles, description, hashtags) for the cut."""
    cut = get_owned_cut(db, user, cut_id)
    text = transcript_to_text(cut.transcript) or cut.title
    titles = llm.generate_titles(text + f" v{cut_id[:4]}")
    cut.title_options = titles
    cut.title = titles[0]
    cut.description = llm.generate_description(text)
    cut.hashtags = llm.generate_hashtags(text)
    db.commit()
    return CutOut.model_validate(cut)
