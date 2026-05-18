from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.domain import SearchResponse
from app.services.search import run_search

router = APIRouter()


@router.get("", response_model=SearchResponse)
def search(
    q: str,
    visibility: str | None = None,
    licensing_available: bool | None = None,
    scout_for_hire: bool | None = None,
    tag: str | None = None,
    challenge_related: bool | None = None,
    db: Session = Depends(get_db),
) -> SearchResponse:
    return run_search(
        db=db,
        query=q,
        visibility=visibility,
        licensing_available=licensing_available,
        scout_for_hire=scout_for_hire,
        tag_slug=tag,
        challenge_related=challenge_related,
    )

