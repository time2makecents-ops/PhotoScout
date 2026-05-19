from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db.session import get_db
from app.models import ImageAsset, Location, Profile, User
from app.schemas.domain import ProfileRead, ProfileUpdateRequest
from app.services.auth import get_current_user, get_optional_user
from app.services.serializers import profile_to_read

router = APIRouter()


def _remove_existing_avatar_files(profile: Profile) -> None:
    avatar_dir = Path(settings.upload_dir) / "profiles" / profile.handle
    if not avatar_dir.exists():
        return
    for avatar_path in avatar_dir.iterdir():
        if avatar_path.is_file():
            avatar_path.unlink()


def _normalize_avatar_position(value: int) -> int:
    return max(0, min(100, value))


def _normalize_avatar_scale(value: float) -> float:
    return max(1.0, min(3.0, value))


def profile_query():
    return select(Profile).options(
        joinedload(Profile.scout_services),
        joinedload(Profile.user).joinedload(User.images).joinedload(ImageAsset.image_metadata),
        joinedload(Profile.user)
        .joinedload(User.locations)
        .joinedload(Location.images)
        .joinedload(ImageAsset.image_metadata),
        joinedload(Profile.user).joinedload(User.locations).joinedload(Location.tags),
        joinedload(Profile.user).joinedload(User.locations).joinedload(Location.creator).joinedload(User.profile),
    )


@router.get("", response_model=list[ProfileRead])
def list_profiles(
    scout_for_hire: bool | None = None,
    db: Session = Depends(get_db),
) -> list[ProfileRead]:
    query = profile_query()
    if scout_for_hire is not None:
        query = query.where(Profile.scout_for_hire == scout_for_hire)
    profiles = db.scalars(query.order_by(Profile.display_name)).unique().all()
    return [profile_to_read(profile) for profile in profiles]


@router.get("/me", response_model=ProfileRead)
def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileRead:
    profile = db.scalar(profile_query().where(Profile.user_id == current_user.id))
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile_to_read(profile, current_user)


@router.get("/{handle}", response_model=ProfileRead)
def get_profile(
    handle: str,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> ProfileRead:
    profile = db.scalar(profile_query().where(Profile.handle == handle))
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile_to_read(profile, current_user)


@router.patch("/me", response_model=ProfileRead)
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileRead:
    profile = db.scalar(profile_query().where(Profile.user_id == current_user.id))
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile_to_read(profile, current_user)


@router.post("/me/avatar", response_model=ProfileRead, status_code=status.HTTP_201_CREATED)
async def upload_profile_avatar(
    file: UploadFile = File(...),
    avatar_position_x: int = Form(default=50),
    avatar_position_y: int = Form(default=50),
    avatar_scale: float = Form(default=1.0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileRead:
    profile = db.scalar(profile_query().where(Profile.user_id == current_user.id))
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Avatar file name is required")

    image_bytes = await file.read()
    extension = Path(file.filename).suffix.lower() or ".jpg"
    avatar_dir = Path(settings.upload_dir) / "profiles" / profile.handle
    avatar_dir.mkdir(parents=True, exist_ok=True)

    _remove_existing_avatar_files(profile)

    storage_key = f"profiles/{profile.handle}/avatar{extension}"
    destination = Path(settings.upload_dir) / storage_key
    destination.write_bytes(image_bytes)

    profile.avatar_url = f"/uploads/{storage_key}"
    profile.avatar_position_x = _normalize_avatar_position(avatar_position_x)
    profile.avatar_position_y = _normalize_avatar_position(avatar_position_y)
    profile.avatar_scale = _normalize_avatar_scale(avatar_scale)

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile_to_read(profile, current_user)
