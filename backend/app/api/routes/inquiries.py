from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import AccessInquiry, HireInquiry, ImageAsset, LicenseInquiry, Location, Profile, User
from app.schemas.domain import InquiryCreateRequest
from app.services.auth import get_current_user

router = APIRouter()


@router.post("/access", status_code=status.HTTP_201_CREATED)
def create_access_inquiry(
    payload: InquiryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    location = db.scalar(select(Location).where(Location.id == payload.target_id))
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    db.add(
        AccessInquiry(
            location_id=location.id,
            requester_id=current_user.id,
            owner_id=location.creator_id,
            message=payload.message,
        )
    )
    db.commit()
    return {"status": "created"}


@router.post("/license", status_code=status.HTTP_201_CREATED)
def create_license_inquiry(
    payload: InquiryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    image = db.scalar(select(ImageAsset).where(ImageAsset.id == payload.target_id))
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    db.add(
        LicenseInquiry(
            image_id=image.id,
            requester_id=current_user.id,
            owner_id=image.uploader_id,
            message=payload.message,
        )
    )
    db.commit()
    return {"status": "created"}


@router.post("/hire", status_code=status.HTTP_201_CREATED)
def create_hire_inquiry(
    payload: InquiryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    profile = db.scalar(select(Profile).where(Profile.id == payload.target_id))
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.add(
        HireInquiry(
            profile_id=profile.id,
            requester_id=current_user.id,
            recipient_id=profile.user_id,
            message=payload.message,
        )
    )
    db.commit()
    return {"status": "created"}

