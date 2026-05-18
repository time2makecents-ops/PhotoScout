from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models import ImageAsset
from app.schemas.common import ImageRead
from app.services.serializers import image_to_read

router = APIRouter()


@router.get("/{image_id}", response_model=ImageRead)
def get_image(image_id: int, db: Session = Depends(get_db)) -> ImageRead:
    image = db.scalar(select(ImageAsset).options(joinedload(ImageAsset.image_metadata)).where(ImageAsset.id == image_id))
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return image_to_read(image)

