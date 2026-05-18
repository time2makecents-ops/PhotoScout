from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models import ImageAsset, Profile, User
from app.schemas.domain import ProfileRead, ProfileUpdateRequest
from app.services.auth import get_current_user
from app.services.serializers import profile_to_read

router = APIRouter()


@router.get("", response_model=list[ProfileRead])
def list_profiles(
    scout_for_hire: bool | None = None,
    db: Session = Depends(get_db),
) -> list[ProfileRead]:
    query = select(Profile).options(
        joinedload(Profile.scout_services),
        joinedload(Profile.user).joinedload(User.images).joinedload(ImageAsset.image_metadata),
    )
    if scout_for_hire is not None:
        query = query.where(Profile.scout_for_hire == scout_for_hire)
    profiles = db.scalars(query.order_by(Profile.display_name)).unique().all()
    return [profile_to_read(profile) for profile in profiles]


@router.get("/{handle}", response_model=ProfileRead)
def get_profile(handle: str, db: Session = Depends(get_db)) -> ProfileRead:
    profile = db.scalar(
        select(Profile)
        .options(
            joinedload(Profile.scout_services),
            joinedload(Profile.user).joinedload(User.images).joinedload(ImageAsset.image_metadata),
        )
        .where(Profile.handle == handle)
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile_to_read(profile)


@router.patch("/me", response_model=ProfileRead)
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileRead:
    profile = db.scalar(
        select(Profile)
        .options(
            joinedload(Profile.scout_services),
            joinedload(Profile.user).joinedload(User.images).joinedload(ImageAsset.image_metadata),
        )
        .where(Profile.user_id == current_user.id)
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile_to_read(profile)
