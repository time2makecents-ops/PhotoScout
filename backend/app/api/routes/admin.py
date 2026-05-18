from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.utils import slugify
from app.db.session import get_db
from app.models import Challenge, User
from app.schemas.domain import ChallengeCreateRequest, ChallengeDetailRead
from app.services.auth import get_current_user
from app.services.serializers import challenge_detail_to_read

router = APIRouter()


@router.post("/challenges", response_model=ChallengeDetailRead, status_code=status.HTTP_201_CREATED)
def create_challenge(
    payload: ChallengeCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChallengeDetailRead:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    base_slug = slugify(payload.title)
    slug = base_slug
    suffix = 2
    while db.scalar(select(Challenge).where(Challenge.slug == slug)):
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    challenge = Challenge(
        title=payload.title,
        slug=slug,
        prompt=payload.prompt,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        is_active=True,
        featured_image_url=payload.featured_image_url,
        created_by=current_user.id,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return challenge_detail_to_read(challenge)

