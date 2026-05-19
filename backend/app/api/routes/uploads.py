import io
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import ExifTags, Image as PILImage
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import ImageAsset, ImageMetadata, ImageRole, User
from app.schemas.common import ImageRead
from app.services.auth import get_current_user
from app.services.serializers import image_to_read

router = APIRouter()


def _normalize_image_role(value: str | None) -> str:
    allowed_roles = {role.value for role in ImageRole}
    if not value:
        return ImageRole.general.value
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

def _rational_to_string(value) -> str | None:
    if value is None:
        return None
    try:
        numerator = value.numerator
        denominator = value.denominator
        if denominator == 1:
            return str(numerator)
        return f"{numerator}/{denominator}"
    except AttributeError:
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            return str(value)
        if numeric_value.is_integer():
            return str(int(numeric_value))
        return f"{numeric_value:.2f}".rstrip("0").rstrip(".")


def _format_ratio_as_aperture(value) -> str | None:
    ratio = _rational_to_string(value)
    if not ratio:
        return None
    return f"f/{ratio}"


def _format_exposure_time(value) -> str | None:
    if value is None:
        return None
    try:
        numerator = value.numerator
        denominator = value.denominator
        if numerator == 1:
            return f"1/{denominator}"
        return f"{numerator}/{denominator}s"
    except AttributeError:
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            return str(value)
        if numeric_value < 1:
            denominator = round(1 / numeric_value)
            return f"1/{denominator}"
        if numeric_value.is_integer():
            return f"{int(numeric_value)}s"
        return f"{numeric_value:.2f}s".rstrip("0").rstrip(".")


def _parse_taken_at(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    if isinstance(value, str):
        for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def _parse_form_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return _parse_taken_at(value)


def _parse_float_value(value: str | None) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid numeric metadata value")


def extract_exif_metadata(image_bytes: bytes) -> dict[str, str | datetime | None]:
    try:
        with PILImage.open(io.BytesIO(image_bytes)) as image:
            exif = image.getexif()
            if not exif:
                return {}
            tags = {
                ExifTags.TAGS.get(key, key): value
                for key, value in exif.items()
            }
    except Exception:
        return {}

    make = tags.get("Make")
    model = tags.get("Model")
    lens_model = tags.get("LensModel")
    focal_length = _rational_to_string(tags.get("FocalLength"))
    aperture = _format_ratio_as_aperture(tags.get("FNumber"))
    shutter_speed = _format_exposure_time(tags.get("ExposureTime"))
    iso_speed = tags.get("ISOSpeedRatings") or tags.get("PhotographicSensitivity")
    white_balance_map = {0: "Auto", 1: "Manual"}
    white_balance = tags.get("WhiteBalance")
    exposure_compensation = _rational_to_string(tags.get("ExposureBiasValue"))
    taken_at = _parse_taken_at(tags.get("DateTimeOriginal") or tags.get("DateTimeDigitized") or tags.get("DateTime"))
    camera_direction = _rational_to_string(tags.get("GPSImgDirection")) or tags.get("GPSImgDirectionRef")

    camera_model = " ".join(str(part).strip() for part in [make, model] if part).strip() or None
    if not camera_model:
        camera_model = str(model or make or "").strip() or None

    if white_balance in white_balance_map:
        white_balance = white_balance_map[white_balance]
    elif white_balance is not None:
        white_balance = str(white_balance)

    if isinstance(iso_speed, (list, tuple)) and iso_speed:
        iso_speed = iso_speed[0]
    if iso_speed is not None:
        iso_speed = str(iso_speed)

    if camera_direction and isinstance(camera_direction, str) and camera_direction.endswith("Ref"):
        camera_direction = camera_direction.replace("Ref", "").strip() or None

    return {
        "camera_model": camera_model,
        "lens_model": str(lens_model).strip() if lens_model else None,
        "focal_length": focal_length,
        "aperture": aperture,
        "shutter_speed": shutter_speed,
        "iso_speed": iso_speed,
        "white_balance": white_balance,
        "exposure_compensation": exposure_compensation,
        "taken_at": taken_at,
        "camera_direction": camera_direction,
    }


@router.post("/images", response_model=ImageRead, status_code=status.HTTP_201_CREATED)
async def upload_image(
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
) -> ImageRead:
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    image_bytes = await file.read()
    exif_metadata = extract_exif_metadata(image_bytes)

    extension = Path(file.filename).suffix.lower() or ".jpg"
    storage_key = f"{uuid4().hex}{extension}"
    destination = Path(settings.upload_dir) / storage_key
    destination.write_bytes(image_bytes)

    camera_model_value = camera_model or exif_metadata.get("camera_model")
    lens_model_value = lens_model or exif_metadata.get("lens_model")
    focal_length_value = focal_length or exif_metadata.get("focal_length")
    aperture_value = aperture or exif_metadata.get("aperture")
    shutter_speed_value = shutter_speed or exif_metadata.get("shutter_speed")
    iso_speed_value = iso_speed or exif_metadata.get("iso_speed")
    white_balance_value = white_balance or exif_metadata.get("white_balance")
    exposure_compensation_value = exposure_compensation or exif_metadata.get("exposure_compensation")
    taken_at_value = taken_at or (
        exif_metadata.get("taken_at").isoformat(timespec="seconds") if exif_metadata.get("taken_at") else None
    )
    sun_position_value = sun_position or exif_metadata.get("sun_position")
    camera_direction_value = camera_direction or exif_metadata.get("camera_direction")

    image = ImageAsset(
        uploader_id=current_user.id,
        image_role=_normalize_image_role(image_role),
        title=title,
        caption=caption,
        storage_key=storage_key,
        source_url=f"/uploads/{storage_key}",
        mime_type=file.content_type or "image/jpeg",
        licensing_available=licensing_available,
        featured=featured,
    )
    metadata = ImageMetadata(
        image=image,
        gps_latitude=_parse_float_value(gps_latitude),
        gps_longitude=_parse_float_value(gps_longitude),
        captured_at_device=_parse_form_datetime(captured_at_device),
        camera_heading_degrees=_parse_float_value(camera_heading_degrees),
        camera_heading_label=camera_heading_label or None,
        camera_pitch_degrees=_parse_float_value(camera_pitch_degrees),
        camera_roll_degrees=_parse_float_value(camera_roll_degrees),
        heading_source=_normalize_heading_source(heading_source),
        camera_model=camera_model_value,
        lens_model=lens_model_value,
        focal_length=focal_length_value,
        aperture=aperture_value,
        shutter_speed=shutter_speed_value,
        iso_speed=iso_speed_value,
        white_balance=white_balance_value,
        exposure_compensation=exposure_compensation_value,
        taken_at=_parse_form_datetime(taken_at_value),
        weather=weather,
        season=season,
        sun_position=sun_position_value,
        camera_direction=camera_direction_value,
        point_of_view=point_of_view,
        distance_to_subject=distance_to_subject,
        notes=notes,
    )
    db.add_all([image, metadata])
    db.commit()
    db.refresh(image)
    return image_to_read(image)
