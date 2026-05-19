from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.routes.uploads import extract_exif_metadata
from app.core.config import settings
from app.core.utils import slugify
from app.db.session import get_db
from app.models import (
    AccessInquiry,
    ChallengeSubmission,
    ImageAsset,
    ImageMetadata,
    ImageRole,
    LicenseInquiry,
    Location,
    LocationVisibility,
    Tag,
    TagKind,
    User,
)
from app.schemas.domain import LocationCreateRequest, LocationRead, LocationUpdateRequest
from app.services.auth import get_current_user, get_optional_user
from app.services.serializers import location_to_read

router = APIRouter()


def _normalize_image_role(value: str | None, default: ImageRole) -> str:
    allowed_roles = {role.value for role in ImageRole}
    if not value:
        return default.value
    normalized = value.strip().lower()
    if normalized not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid image role")
    return normalized


def _normalize_heading_source(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized not in {"sensor", "manual", "unavailable"}:
        raise HTTPException(status_code=400, detail="Invalid heading source")
    return normalized


def _parse_float_value(value: str | None) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid numeric metadata value")


def can_view_exact_location(location: Location, current_user: User | None) -> bool:
    if location.visibility == LocationVisibility.public.value:
        return True
    if not current_user:
        return False
    return current_user.id == location.creator_id or current_user.role == "admin"


def can_edit_location(location: Location, current_user: User) -> bool:
    return current_user.id == location.creator_id or current_user.role == "admin"


def get_location_with_relations(db: Session, slug: str) -> Location | None:
    return db.scalar(
        select(Location)
        .options(
            joinedload(Location.tags),
            joinedload(Location.images).joinedload(ImageAsset.image_metadata),
            joinedload(Location.creator).joinedload(User.profile),
            joinedload(Location.access_inquiries),
        )
        .where(Location.slug == slug)
    )


def write_location_bundle(location: Location, images: list[ImageAsset]) -> None:
    location_dir = Path(settings.upload_dir) / location.slug
    location_dir.mkdir(parents=True, exist_ok=True)

    for image in images:
        current_path = Path(settings.upload_dir) / image.storage_key
        target_name = Path(image.storage_key).name
        target_path = location_dir / target_name
        if current_path.exists() and current_path.resolve() != target_path.resolve():
            shutil.move(str(current_path), str(target_path))
        image.storage_key = f"{location.slug}/{target_name}"
        image.source_url = f"/uploads/{location.slug}/{target_name}"

    manifest = {
        "location": {
            "id": location.id,
            "name": location.name,
            "slug": location.slug,
            "description": location.description,
            "street_address": location.street_address,
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
                "image_role": image.image_role,
                "title": image.title,
                "caption": image.caption,
                "storage_key": image.storage_key,
                "source_url": image.source_url,
                "mime_type": image.mime_type,
                "licensing_available": image.licensing_available,
                "featured": image.featured,
                "metadata": {
                    "gps_latitude": image.image_metadata.gps_latitude if image.image_metadata else None,
                    "gps_longitude": image.image_metadata.gps_longitude if image.image_metadata else None,
                    "captured_at_device": image.image_metadata.captured_at_device.isoformat() if image.image_metadata and image.image_metadata.captured_at_device else None,
                    "camera_heading_degrees": image.image_metadata.camera_heading_degrees if image.image_metadata else None,
                    "camera_heading_label": image.image_metadata.camera_heading_label if image.image_metadata else None,
                    "camera_pitch_degrees": image.image_metadata.camera_pitch_degrees if image.image_metadata else None,
                    "camera_roll_degrees": image.image_metadata.camera_roll_degrees if image.image_metadata else None,
                    "heading_source": image.image_metadata.heading_source if image.image_metadata else None,
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


def _parse_taken_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _parse_form_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return _parse_taken_at(value)


def _build_image_metadata(
    *,
    camera_model: str | None,
    lens_model: str | None,
    focal_length: str | None,
    aperture: str | None,
    shutter_speed: str | None,
    iso_speed: str | None,
    white_balance: str | None,
    exposure_compensation: str | None,
    taken_at: str | None,
    weather: str | None,
    season: str | None,
    sun_position: str | None,
    camera_direction: str | None,
    gps_latitude: str | None,
    gps_longitude: str | None,
    captured_at_device: str | None,
    camera_heading_degrees: str | None,
    camera_heading_label: str | None,
    camera_pitch_degrees: str | None,
    camera_roll_degrees: str | None,
    heading_source: str | None,
    point_of_view: str | None,
    distance_to_subject: str | None,
    notes: str | None,
    exif_metadata: dict[str, str | datetime | None],
) -> ImageMetadata:
    taken_at_value = taken_at or (
        exif_metadata.get("taken_at").isoformat(timespec="seconds") if exif_metadata.get("taken_at") else None
    )
    return ImageMetadata(
        gps_latitude=_parse_float_value(gps_latitude),
        gps_longitude=_parse_float_value(gps_longitude),
        captured_at_device=_parse_form_datetime(captured_at_device),
        camera_heading_degrees=_parse_float_value(camera_heading_degrees),
        camera_heading_label=camera_heading_label or None,
        camera_pitch_degrees=_parse_float_value(camera_pitch_degrees),
        camera_roll_degrees=_parse_float_value(camera_roll_degrees),
        heading_source=_normalize_heading_source(heading_source),
        camera_model=camera_model or exif_metadata.get("camera_model"),
        lens_model=lens_model or exif_metadata.get("lens_model"),
        focal_length=focal_length or exif_metadata.get("focal_length"),
        aperture=aperture or exif_metadata.get("aperture"),
        shutter_speed=shutter_speed or exif_metadata.get("shutter_speed"),
        iso_speed=iso_speed or exif_metadata.get("iso_speed"),
        white_balance=white_balance or exif_metadata.get("white_balance"),
        exposure_compensation=exposure_compensation or exif_metadata.get("exposure_compensation"),
        taken_at=_parse_form_datetime(taken_at_value),
        weather=weather,
        season=season or exif_metadata.get("season"),
        sun_position=sun_position or exif_metadata.get("sun_position"),
        camera_direction=camera_direction or exif_metadata.get("camera_direction"),
        point_of_view=point_of_view,
        distance_to_subject=distance_to_subject,
        notes=notes,
    )


def _delete_image_artifacts(db: Session, image: ImageAsset) -> None:
    for submission in list(image.submissions):
        for vote in list(submission.votes):
            db.delete(vote)
        db.delete(submission)
    for inquiry in list(image.license_inquiries):
        db.delete(inquiry)
    if image.image_metadata:
        db.delete(image.image_metadata)

    file_path = Path(settings.upload_dir) / image.storage_key
    if file_path.exists():
        file_path.unlink()

    db.delete(image)


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
    location = get_location_with_relations(db, slug)
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
        street_address=payload.street_address or "",
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

    hydrated = get_location_with_relations(db, location.slug)
    return location_to_read(hydrated, True)


@router.post("/{slug}/images", response_model=LocationRead, status_code=status.HTTP_201_CREATED)
async def add_location_image(
    slug: str,
    file: UploadFile = File(...),
    image_role: str | None = Form(default=None),
    title: str = Form(...),
    caption: str = Form(default=""),
    licensing_available: bool = Form(default=False),
    featured: bool = Form(default=False),
    camera_model: str | None = Form(default=None),
    lens_model: str | None = Form(default=None),
    focal_length: str | None = Form(default=None),
    aperture: str | None = Form(default=None),
    shutter_speed: str | None = Form(default=None),
    iso_speed: str | None = Form(default=None),
    white_balance: str | None = Form(default=None),
    exposure_compensation: str | None = Form(default=None),
    taken_at: str | None = Form(default=None),
    weather: str | None = Form(default=None),
    season: str | None = Form(default=None),
    sun_position: str | None = Form(default=None),
    camera_direction: str | None = Form(default=None),
    gps_latitude: str | None = Form(default=None),
    gps_longitude: str | None = Form(default=None),
    captured_at_device: str | None = Form(default=None),
    camera_heading_degrees: str | None = Form(default=None),
    camera_heading_label: str | None = Form(default=None),
    camera_pitch_degrees: str | None = Form(default=None),
    camera_roll_degrees: str | None = Form(default=None),
    heading_source: str | None = Form(default=None),
    point_of_view: str | None = Form(default=None),
    distance_to_subject: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationRead:
    location = get_location_with_relations(db, slug)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    if not can_edit_location(location, current_user):
        raise HTTPException(status_code=403, detail="You do not have permission to add photos to this location")
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    image_bytes = await file.read()
    exif_metadata = extract_exif_metadata(image_bytes)

    extension = Path(file.filename).suffix.lower() or ".jpg"
    storage_key = f"{uuid4().hex}{extension}"
    destination = Path(settings.upload_dir) / storage_key
    destination.write_bytes(image_bytes)

    image = ImageAsset(
        uploader_id=current_user.id,
        location=location,
        image_role=_normalize_image_role(image_role, ImageRole.location_photo),
        title=title,
        caption=caption,
        storage_key=storage_key,
        source_url=f"/uploads/{storage_key}",
        mime_type=file.content_type or "image/jpeg",
        licensing_available=licensing_available,
        featured=featured,
    )
    metadata = _build_image_metadata(
        camera_model=camera_model,
        lens_model=lens_model,
        focal_length=focal_length,
        aperture=aperture,
        shutter_speed=shutter_speed,
        iso_speed=iso_speed,
        white_balance=white_balance,
        exposure_compensation=exposure_compensation,
        taken_at=taken_at,
        weather=weather,
        season=season,
        sun_position=sun_position,
        camera_direction=camera_direction,
        gps_latitude=gps_latitude,
        gps_longitude=gps_longitude,
        captured_at_device=captured_at_device,
        camera_heading_degrees=camera_heading_degrees,
        camera_heading_label=camera_heading_label,
        camera_pitch_degrees=camera_pitch_degrees,
        camera_roll_degrees=camera_roll_degrees,
        heading_source=heading_source,
        point_of_view=point_of_view,
        distance_to_subject=distance_to_subject,
        notes=notes,
        exif_metadata=exif_metadata,
    )
    image.image_metadata = metadata
    db.add_all([image, metadata])
    db.flush()
    write_location_bundle(location, list(location.images))
    db.commit()

    hydrated = get_location_with_relations(db, slug)
    return location_to_read(hydrated, True)


@router.delete("/{slug}/images/{image_id}", response_model=LocationRead)
def delete_location_image(
    slug: str,
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationRead:
    location = get_location_with_relations(db, slug)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    if not can_edit_location(location, current_user):
        raise HTTPException(status_code=403, detail="You do not have permission to delete photos from this location")

    image = db.scalar(
        select(ImageAsset)
        .options(
            joinedload(ImageAsset.image_metadata),
            joinedload(ImageAsset.submissions).joinedload(ChallengeSubmission.votes),
            joinedload(ImageAsset.license_inquiries),
        )
        .where(ImageAsset.id == image_id, ImageAsset.location_id == location.id)
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    remaining_images = [item for item in location.images if item.id != image.id]
    _delete_image_artifacts(db, image)
    db.flush()
    write_location_bundle(location, remaining_images)
    db.commit()

    hydrated = get_location_with_relations(db, slug)
    return location_to_read(hydrated, True)


@router.patch("/{slug}", response_model=LocationRead)
def update_location(
    slug: str,
    payload: LocationUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationRead:
    location = get_location_with_relations(db, slug)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    if not can_edit_location(location, current_user):
        raise HTTPException(status_code=403, detail="You do not have permission to edit this location")

    payload_data = payload.model_dump(exclude_unset=True)

    if "name" in payload_data and payload_data["name"] is not None:
        location.name = payload_data["name"]
    if "description" in payload_data and payload_data["description"] is not None:
        location.description = payload_data["description"]
    if "street_address" in payload_data:
        location.street_address = payload_data["street_address"] or ""
    if "latitude" in payload_data and payload_data["latitude"] is not None:
        location.latitude = payload_data["latitude"]
    if "longitude" in payload_data and payload_data["longitude"] is not None:
        location.longitude = payload_data["longitude"]
    if "visibility" in payload_data:
        if payload_data["visibility"] not in {LocationVisibility.public.value, LocationVisibility.private.value}:
            raise HTTPException(status_code=400, detail="Visibility must be public or private")
        location.visibility = payload_data["visibility"]
    if "city" in payload_data:
        location.city = payload_data["city"] or ""
    if "region" in payload_data:
        location.region = payload_data["region"] or ""
    if "country" in payload_data:
        location.country = payload_data["country"] or ""
    if "zip_code" in payload_data:
        location.zip_code = payload_data["zip_code"] or ""
    if "approximate_latitude" in payload_data:
        location.approximate_latitude = payload_data["approximate_latitude"]
    if "approximate_longitude" in payload_data:
        location.approximate_longitude = payload_data["approximate_longitude"]

    if location.visibility == LocationVisibility.private.value:
        location.approximate_latitude = (
            location.approximate_latitude if location.approximate_latitude is not None else location.latitude
        )
        location.approximate_longitude = (
            location.approximate_longitude if location.approximate_longitude is not None else location.longitude
        )
    else:
        location.approximate_latitude = location.latitude
        location.approximate_longitude = location.longitude

    if payload_data.get("tags") is not None:
        if not payload.tags:
            raise HTTPException(status_code=400, detail="At least one tag is required")
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
    write_location_bundle(location, list(location.images))
    db.commit()

    hydrated = get_location_with_relations(db, slug)
    return location_to_read(hydrated, True)


@router.delete("/{slug}", status_code=status.HTTP_200_OK)
def delete_location(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    location = get_location_with_relations(db, slug)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    if not can_edit_location(location, current_user):
        raise HTTPException(status_code=403, detail="You do not have permission to delete this location")

    location_dir = Path(settings.upload_dir) / location.slug
    images = list(location.images)

    for image in images:
        _delete_image_artifacts(db, image)

    for inquiry in list(location.access_inquiries):
        db.delete(inquiry)

    location.tags = []
    db.flush()
    db.delete(location)
    db.commit()

    if location_dir.exists():
        shutil.rmtree(location_dir, ignore_errors=True)

    return {"detail": "Location deleted"}
