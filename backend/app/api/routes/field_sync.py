from __future__ import annotations

import json
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.routes.locations import write_location_bundle
from app.api.routes.uploads import extract_exif_metadata, validate_image_bytes
from app.core.config import settings
from app.core.utils import slugify
from app.db.session import get_db
from app.models import FieldCaptureReceipt, FieldDevice, ImageAsset, ImageMetadata, ImageSourceType, Location, Tag, TagKind
from app.schemas.field import FieldCaptureManifest, FieldCaptureReceiptRead
from app.services.field_auth import get_current_field_device

router = APIRouter()


def _receipt_response(receipt: FieldCaptureReceipt) -> FieldCaptureReceiptRead:
    return FieldCaptureReceiptRead(
        receipt_id=receipt.id,
        location_id=receipt.location_id,
        slug=receipt.location.slug,
        image_count=receipt.image_count,
    )


def _get_receipt(db: Session, user_id: int, client_capture_id: str) -> FieldCaptureReceipt | None:
    return db.scalar(
        select(FieldCaptureReceipt)
        .options(joinedload(FieldCaptureReceipt.location))
        .where(FieldCaptureReceipt.user_id == user_id, FieldCaptureReceipt.client_capture_id == client_capture_id)
    )


@router.get("/captures/{client_capture_id}", response_model=FieldCaptureReceiptRead)
def get_capture_receipt(
    client_capture_id: str,
    device: FieldDevice = Depends(get_current_field_device),
    db: Session = Depends(get_db),
) -> FieldCaptureReceiptRead:
    receipt = _get_receipt(db, device.user_id, client_capture_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Capture has not been synced")
    db.commit()
    return _receipt_response(receipt)


@router.post("/captures", response_model=FieldCaptureReceiptRead, status_code=status.HTTP_201_CREATED)
async def sync_capture(
    manifest: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    device: FieldDevice = Depends(get_current_field_device),
    db: Session = Depends(get_db),
) -> FieldCaptureReceiptRead:
    try:
        payload = FieldCaptureManifest.model_validate_json(manifest)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=json.loads(exc.json())) from exc

    existing = _get_receipt(db, device.user_id, payload.client_capture_id)
    if existing:
        db.commit()
        return _receipt_response(existing)
    if len(files) != len(payload.photos):
        raise HTTPException(status_code=400, detail="The photo manifest and uploaded files do not match")
    if any(not upload.filename for upload in files):
        raise HTTPException(status_code=400, detail="Every uploaded photo needs a file name")

    staging_dir = Path(settings.upload_dir) / ".field-staging" / uuid4().hex
    staging_dir.mkdir(parents=True, exist_ok=False)
    staged: list[tuple[Path, str, str, dict]] = []
    moved_root_files: list[Path] = []
    created_location_dir: Path | None = None
    try:
        for upload in files:
            image_bytes = await upload.read()
            extension, mime_type = validate_image_bytes(image_bytes)
            file_name = f"{uuid4().hex}{extension}"
            stage_path = staging_dir / file_name
            stage_path.write_bytes(image_bytes)
            staged.append((stage_path, file_name, mime_type, extract_exif_metadata(image_bytes)))

        base_slug = slugify(payload.name)
        location_slug = base_slug
        suffix = 2
        while db.scalar(select(Location.id).where(Location.slug == location_slug)):
            location_slug = f"{base_slug}-{suffix}"
            suffix += 1

        location = Location(
            creator_id=device.user_id,
            name=payload.name,
            slug=location_slug,
            description=payload.notes,
            street_address="",
            latitude=payload.latitude,
            longitude=payload.longitude,
            visibility=payload.visibility,
            approximate_latitude=payload.latitude,
            approximate_longitude=payload.longitude,
            city=payload.city,
            region=payload.region,
            country=payload.country,
            zip_code=payload.zip_code,
        )
        tags: list[Tag] = []
        for tag_name in payload.tags:
            tag_slug = slugify(tag_name)
            tag = db.scalar(select(Tag).where(Tag.slug == tag_slug))
            if not tag:
                tag = Tag(name=tag_name.title(), slug=tag_slug, kind=TagKind.category.value)
                db.add(tag)
            tags.append(tag)
        location.tags = tags
        db.add(location)
        db.flush()

        images: list[ImageAsset] = []
        for index, photo in enumerate(payload.photos):
            stage_path, file_name, mime_type, exif = staged[index]
            root_path = Path(settings.upload_dir) / file_name
            shutil.move(str(stage_path), str(root_path))
            moved_root_files.append(root_path)
            image = ImageAsset(
                uploader_id=device.user_id,
                location_id=location.id,
                image_role=photo.image_role,
                image_source_type=ImageSourceType.original_edited.value,
                source_note="Captured offline with PhotoScout Field",
                title=photo.title,
                caption="",
                storage_key=file_name,
                source_url=f"/uploads/{file_name}",
                mime_type=mime_type,
                licensing_available=False,
                featured=photo.image_role == "area_image" or (index == 0 and not any(item.image_role == "area_image" for item in payload.photos)),
            )
            image.image_metadata = ImageMetadata(
                gps_latitude=payload.latitude,
                gps_longitude=payload.longitude,
                captured_at_device=photo.captured_at_device,
                camera_heading_degrees=photo.camera_heading_degrees if photo.camera_heading_degrees is not None else payload.heading_degrees,
                camera_heading_label=photo.camera_heading_label,
                heading_source=photo.heading_source or ("sensor" if payload.heading_degrees is not None else "unavailable"),
                camera_model=exif.get("camera_model"),
                lens_model=exif.get("lens_model"),
                focal_length=exif.get("focal_length"),
                aperture=exif.get("aperture"),
                shutter_speed=exif.get("shutter_speed"),
                iso_speed=exif.get("iso_speed"),
                white_balance=exif.get("white_balance"),
                exposure_compensation=exif.get("exposure_compensation"),
                taken_at=exif.get("taken_at"),
                camera_direction=exif.get("camera_direction"),
                notes=f"Field GPS accuracy: {payload.accuracy_meters:.1f} m" if payload.accuracy_meters is not None else None,
            )
            db.add(image)
            images.append(image)

        db.flush()
        created_location_dir = Path(settings.upload_dir) / location.slug
        write_location_bundle(location, images)
        receipt = FieldCaptureReceipt(
            user_id=device.user_id,
            device_id=device.id,
            client_capture_id=payload.client_capture_id,
            location_id=location.id,
            image_count=len(images),
        )
        db.add(receipt)
        db.commit()
        db.refresh(receipt)
        receipt.location = location
        return _receipt_response(receipt)
    except HTTPException:
        db.rollback()
        if created_location_dir and created_location_dir.exists():
            shutil.rmtree(created_location_dir, ignore_errors=True)
        raise
    except Exception as exc:
        db.rollback()
        if created_location_dir and created_location_dir.exists():
            shutil.rmtree(created_location_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="The capture could not be saved") from exc
    finally:
        for root_file in moved_root_files:
            if root_file.exists():
                root_file.unlink()
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
