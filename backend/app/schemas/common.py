from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    kind: str


class ImageMetadataRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    gps_latitude: float | None = None
    gps_longitude: float | None = None
    captured_at_device: datetime | None = None
    camera_heading_degrees: float | None = None
    camera_heading_label: str | None = None
    camera_pitch_degrees: float | None = None
    camera_roll_degrees: float | None = None
    heading_source: str | None = None
    camera_model: str | None = None
    lens_model: str | None = None
    focal_length: str | None = None
    aperture: str | None = None
    shutter_speed: str | None = None
    iso_speed: str | None = None
    white_balance: str | None = None
    exposure_compensation: str | None = None
    taken_at: datetime | None = None
    weather: str | None = None
    season: str | None = None
    sun_position: str | None = None
    camera_direction: str | None = None
    point_of_view: str | None = None
    distance_to_subject: str | None = None
    notes: str | None = None


class ImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    location_id: int | None = None
    image_role: str
    title: str
    caption: str
    source_url: str
    mime_type: str
    licensing_available: bool
    featured: bool
    created_at: datetime
    image_metadata: ImageMetadataRead | None = None
