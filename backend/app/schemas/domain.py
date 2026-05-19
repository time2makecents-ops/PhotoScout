from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ImageRead, TagRead


class ScoutServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    regions_served: str
    specialties: str
    day_rate_note: str | None = None
    is_active: bool


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    handle: str
    display_name: str
    bio: str
    base_city: str
    specialties: str
    website_url: str | None = None
    instagram_url: str | None = None
    licensing_available: bool
    scout_for_hire: bool
    hourly_rate_note: str | None = None
    scout_services: list[ScoutServiceRead] = []
    uploaded_images: list[ImageRead] = []


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    bio: str | None = None
    base_city: str | None = None
    specialties: str | None = None
    website_url: str | None = None
    instagram_url: str | None = None
    licensing_available: bool | None = None
    scout_for_hire: bool | None = None
    hourly_rate_note: str | None = None


class LocationCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10)
    street_address: str | None = Field(default=None, max_length=255)
    latitude: float
    longitude: float
    visibility: str
    city: str | None = ""
    region: str | None = ""
    country: str | None = ""
    zip_code: str | None = ""
    approximate_latitude: float | None = None
    approximate_longitude: float | None = None
    tags: list[str] = Field(min_length=1)
    uploaded_image_ids: list[int] = Field(min_length=1)


class LocationRead(BaseModel):
    id: int
    name: str
    slug: str
    description: str
    street_address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    visibility: str
    city: str
    region: str
    country: str
    zip_code: str
    is_featured: bool
    created_at: datetime
    tags: list[TagRead]
    images: list[ImageRead]
    creator_handle: str
    creator_name: str


class ChallengeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    prompt: str
    starts_at: datetime
    ends_at: datetime
    is_active: bool
    featured_image_url: str | None = None


class ChallengeSubmissionRead(BaseModel):
    id: int
    caption: str
    vote_count: int
    rank: int | None = None
    is_winner: bool
    is_featured: bool
    created_at: datetime
    user_handle: str
    user_display_name: str
    image: ImageRead


class ChallengeDetailRead(ChallengeRead):
    submissions: list[ChallengeSubmissionRead]


class ChallengeSubmissionCreateRequest(BaseModel):
    image_id: int
    caption: str | None = ""


class ChallengeVoteRequest(BaseModel):
    direction: str = Field(pattern="^(up|down)$")


class ChallengeCreateRequest(BaseModel):
    title: str = Field(min_length=4, max_length=160)
    prompt: str = Field(min_length=10)
    starts_at: datetime
    ends_at: datetime
    featured_image_url: str | None = None


class InquiryCreateRequest(BaseModel):
    target_id: int
    message: str = Field(min_length=8)


class SearchResultItem(BaseModel):
    id: int
    type: str
    title: str
    subtitle: str
    href: str


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]
