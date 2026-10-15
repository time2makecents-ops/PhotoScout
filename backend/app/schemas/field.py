from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class FieldPairingRequestRead(BaseModel):
    pairing_payload: str
    api_base_url: str
    expires_at: datetime


class FieldPairRequest(BaseModel):
    pairing_secret: str = Field(min_length=20, max_length=200)
    name: str = Field(min_length=1, max_length=120)
    platform: Literal["ios", "android", "unknown"] = "unknown"


class FieldPairResponse(BaseModel):
    device_token: str
    device_id: int
    api_base_url: str


class FieldDeviceRead(BaseModel):
    id: int
    name: str
    platform: str
    created_at: datetime
    last_seen_at: datetime | None
    revoked_at: datetime | None

    model_config = {"from_attributes": True}


class FieldPhotoManifest(BaseModel):
    client_photo_id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=160)
    image_role: Literal["area_image", "location_photo"] = "location_photo"
    captured_at_device: datetime | None = None
    camera_heading_degrees: float | None = Field(default=None, ge=0, lt=360)
    camera_heading_label: str | None = Field(default=None, max_length=20)
    heading_source: Literal["sensor", "manual", "unavailable"] | None = None


class FieldCaptureManifest(BaseModel):
    version: Literal[1] = 1
    client_capture_id: str = Field(min_length=8, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    notes: str = Field(min_length=10, max_length=10000)
    tags: list[str] = Field(min_length=1, max_length=20)
    visibility: Literal["public", "private"] = "public"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_meters: float | None = Field(default=None, ge=0)
    heading_degrees: float | None = Field(default=None, ge=0, lt=360)
    city: str = Field(default="", max_length=120)
    region: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=120)
    zip_code: str = Field(default="", max_length=20)
    photos: list[FieldPhotoManifest] = Field(default_factory=list, max_length=12)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, values: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(value.strip() for value in values if value.strip()))
        if not cleaned:
            raise ValueError("At least one tag is required")
        if any(len(value) > 80 for value in cleaned):
            raise ValueError("Tags must be 80 characters or fewer")
        return cleaned

    @field_validator("photos")
    @classmethod
    def validate_photo_roles(cls, values: list[FieldPhotoManifest]) -> list[FieldPhotoManifest]:
        if sum(photo.image_role == "area_image" for photo in values) > 1:
            raise ValueError("Only one area image is allowed")
        identifiers = [photo.client_photo_id for photo in values]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("Photo identifiers must be unique")
        return values


class FieldCaptureReceiptRead(BaseModel):
    status: Literal["synced"] = "synced"
    receipt_id: int
    location_id: int
    slug: str
    image_count: int
