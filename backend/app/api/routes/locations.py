import json
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.utils import slugify
from app.db.session import get_db
from app.models import ImageAsset, Location, LocationVisibility, Tag, TagKind, User
from app.schemas.domain import LocationCreateRequest, LocationRead
from app.services.auth import get_current_user, get_optional_user
from app.services.serializers import location_to_read

router = APIRouter()


def can_view_exact_location(location: Location, current_user: User | None) -> bool:
    if location.visibility == LocationVisibility.public.value:
        return True
    if not current_user:
        return False
    return current_user.id == location.creator_id or current_user.role == "admin"


def write_location_bundle(location: Location, images: list[ImageAsset]) -> None:
    location_dir = Path(settings.upload_dir) / location.slug
    location_dir.mkdir(parents=True, exist_ok=True)

    for image in images:
        current_path = Path(settings.upload_dir) / image.storage_key
        target_name = Path(image.storage_key).name
        target_path = location_dir / target_name
        if current_path.exists():
            shutil.move(str(current_path), str(target_path))
        image.storage_key = f"{location.slug}/{target_name}"
        image.source_url = f"/uploads/{location.slug}/{target_name}"

    manifest = {
        "location": {
            "id": location.id,
            "name": location.name,
            "slug": location.slug,
            "description": location.description,
            "visibility": location.visibility,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "approximate_latitude": location.approximate_latitude,
            "approximate_longitude": location.approximate_longitude,
            "city": location.city,
            "region": location.region,
            "country": location.country,
            "zip_code": location.zip_code,
            "creator_id": location.creator_id,
        },
        "tags": [{"id": tag.id, "name": tag.name, "slug": tag.slug, "kind": tag.kind} for tag in location.tags],
        "images": [
            {
                "id": image.id,
                "title": image.title,
                "caption": image.caption,
                "storage_key": image.storage_key,
                "source_url": image.source_url,
                "mime_type": image.mime_type,
                "licensing_available": image.licensing_available,
                "featured": image.featured,
                "metadata": {
                    "camera_model": image.image_metadata.camera_model if image.image_metadata else None,
                    "lens_model": image.image_metadata.lens_model if image.image_metadata else None,
                    "focal_length": image.image_metadata.focal_length if image.image_metadata else None,
                    "aperture": image.image_metadata.aperture if image.image_metadata else None,
                    "shutter_speed": image.image_metadata.shutter_speed if image.image_metadata else None,
                    "iso_speed": image.image_metadata.iso_speed if image.image_metadata else None,
                    "white_balance": image.image_metadata.white_balance if image.image_metadata else None,
                    "exposure_compensation": image.image_metadata.exposure_compensation if image.image_metadata else None,
                    "taken_at": image.image_metadata.taken_at.isoformat() if image.image_metadata and image.image_metadata.taken_at else None,
                    "weather": image.image_metadata.weather if image.image_metadata else None,
                    "season": image.image_metadata.season if image.image_metadata else None,
                    "sun_position": image.image_metadata.sun_position if image.image_metadata else None,
                    "camera_direction": image.image_metadata.camera_direction if image.image_metadata else None,
                    "point_of_view": image.image_metadata.point_of_view if image.image_metadata else None,
                    "distance_to_subject": image.image_metadata.distance_to_subject if image.image_metadata else None,
                    "notes": image.image_metadata.notes if image.image_metadata else None,
                },
            }
            for image in images
        ],
    }
    (location_dir / "location.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


@router.get("", response_model=list[LocationRead])
def list_locations(
    visibility: str | None = None,
    tag: str | None = None,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> list[LocationRead]:
    query = (
        select(Location)
        .options(
            joinedload(Location.tags),
            joinedload(Location.images).joinedload(ImageAsset.image_metadata),
            joinedload(Location.creator).joinedload(User.profile),
        )
        .order_by(Location.created_at.desc())
    )
    if visibility:
        query = query.where(Location.visibility == visibility)
    if tag:
        query = query.join(Location.tags).where(Tag.slug == tag)
    locations = db.scalars(query).unique().all()
    return [location_to_read(location, can_view_exact_location(location, current_user)) for location in locations]


@router.get("/{slug}", response_model=LocationRead)
def get_location(
    slug: str,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> LocationRead:
    location = db.scalar(
        select(Location)
        .options(
            joinedload(Location.tags),
            joinedload(Location.images).joinedload(ImageAsset.image_metadata),
            joinedload(Location.creator).joinedload(User.profile),
        )
        .where(Location.slug == slug)
    )
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location_to_read(location, can_view_exact_location(location, current_user))


@router.post("", response_model=LocationRead, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: LocationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationRead:
    if payload.visibility not in {LocationVisibility.public.value, LocationVisibility.private.value}:
        raise HTTPException(status_code=400, detail="Visibility must be public or private")

    images = db.scalars(
        select(ImageAsset).where(
            ImageAsset.id.in_(payload.uploaded_image_ids),
            ImageAsset.uploader_id == current_user.id,
            ImageAsset.location_id.is_(None),
        )
    ).all()
    if len(images) != len(payload.uploaded_image_ids):
        raise HTTPException(status_code=400, detail="One or more uploaded images are missing or already attached")

    base_slug = slugify(payload.name)
    slug = base_slug
    suffix = 2
    while db.scalar(select(Location).where(Location.slug == slug)):
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    location = Location(
        creator_id=current_user.id,
        name=payload.name,
        slug=slug,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        visibility=payload.visibility,
        approximate_latitude=payload.approximate_latitude if payload.visibility == "private" else payload.latitude,
        approximate_longitude=payload.approximate_longitude if payload.visibility == "private" else payload.longitude,
        city=payload.city or "",
        region=payload.region or "",
        country=payload.country or "",
        zip_code=payload.zip_code or "",
    )

    tags: list[Tag] = []
    for name in payload.tags:
        normalized = slugify(name)
        tag_record = db.scalar(select(Tag).where(Tag.slug == normalized))
        if not tag_record:
            tag_record = Tag(name=name.strip().title(), slug=normalized, kind=TagKind.category.value)
            db.add(tag_record)
        tags.append(tag_record)

    location.tags = tags
    db.add(location)
    db.flush()
    for image in images:
        image.location_id = location.id
    write_location_bundle(location, images)
    db.commit()

    hydrated = db.scalar(
        select(Location)
        .options(
            joinedload(Location.tags),
            joinedload(Location.images).joinedload(ImageAsset.image_metadata),
            joinedload(Location.creator).joinedload(User.profile),
        )
        .where(Location.id == location.id)
    )
    return location_to_read(hydrated, True)
