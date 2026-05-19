from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class UserRole(str, Enum):
    photographer = "photographer"
    studio = "studio"
    scout = "scout"
    property_owner = "property_owner"
    admin = "admin"


class LocationVisibility(str, Enum):
    public = "public"
    private = "private"


class TagKind(str, Enum):
    category = "category"
    specialty = "specialty"
    challenge = "challenge"


class InquiryStatus(str, Enum):
    open = "open"
    reviewed = "reviewed"
    closed = "closed"


location_tags = Table(
    "location_tags",
    Base.metadata,
    Column("location_id", ForeignKey("locations.id"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profile: Mapped[Profile | None] = relationship(back_populates="user", uselist=False)
    sessions: Mapped[list[AuthSession]] = relationship(back_populates="user", cascade="all, delete-orphan")
    locations: Mapped[list[Location]] = relationship(back_populates="creator")
    images: Mapped[list[ImageAsset]] = relationship(back_populates="uploader")


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    handle: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    bio: Mapped[str] = mapped_column(Text, default="")
    base_city: Mapped[str] = mapped_column(String(120), default="")
    specialties: Mapped[str] = mapped_column(Text, default="")
    website_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    instagram_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    licensing_available: Mapped[bool] = mapped_column(Boolean, default=False)
    scout_for_hire: Mapped[bool] = mapped_column(Boolean, default=False)
    hourly_rate_note: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="profile")
    scout_services: Mapped[list[ScoutService]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    hire_inquiries: Mapped[list[HireInquiry]] = relationship(back_populates="profile")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="sessions")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text)
    street_address: Mapped[str] = mapped_column(String(255), default="")
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    visibility: Mapped[str] = mapped_column(String(20), default=LocationVisibility.public.value)
    approximate_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    approximate_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    city: Mapped[str] = mapped_column(String(120), default="")
    region: Mapped[str] = mapped_column(String(120), default="")
    country: Mapped[str] = mapped_column(String(120), default="")
    zip_code: Mapped[str] = mapped_column(String(20), default="")
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    creator: Mapped[User] = relationship(back_populates="locations")
    images: Mapped[list[ImageAsset]] = relationship(back_populates="location")
    tags: Mapped[list[Tag]] = relationship(secondary=location_tags, back_populates="locations")
    access_inquiries: Mapped[list[AccessInquiry]] = relationship(back_populates="location")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(30), default=TagKind.category.value)

    locations: Mapped[list[Location]] = relationship(secondary=location_tags, back_populates="tags")


class ImageAsset(Base):
    __tablename__ = "image_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    caption: Mapped[str] = mapped_column(Text, default="")
    storage_key: Mapped[str] = mapped_column(String(255))
    source_url: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(120), default="image/jpeg")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    licensing_available: Mapped[bool] = mapped_column(Boolean, default=False)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    uploader: Mapped[User] = relationship(back_populates="images")
    location: Mapped[Location | None] = relationship(back_populates="images")
    image_metadata: Mapped[ImageMetadata | None] = relationship(back_populates="image", uselist=False, cascade="all, delete-orphan")
    submissions: Mapped[list[ChallengeSubmission]] = relationship(back_populates="image")
    license_inquiries: Mapped[list[LicenseInquiry]] = relationship(back_populates="image")


class ImageMetadata(Base):
    __tablename__ = "image_metadata"

    id: Mapped[int] = mapped_column(primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("image_assets.id"), unique=True)
    camera_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    lens_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    focal_length: Mapped[str | None] = mapped_column(String(50), nullable=True)
    aperture: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shutter_speed: Mapped[str | None] = mapped_column(String(50), nullable=True)
    iso_speed: Mapped[str | None] = mapped_column(String(50), nullable=True)
    white_balance: Mapped[str | None] = mapped_column(String(80), nullable=True)
    exposure_compensation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    weather: Mapped[str | None] = mapped_column(String(80), nullable=True)
    season: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sun_position: Mapped[str | None] = mapped_column(String(80), nullable=True)
    camera_direction: Mapped[str | None] = mapped_column(String(80), nullable=True)
    point_of_view: Mapped[str | None] = mapped_column(String(120), nullable=True)
    distance_to_subject: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    image: Mapped[ImageAsset] = relationship(back_populates="image_metadata")


class ScoutService(Base):
    __tablename__ = "scout_services"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    regions_served: Mapped[str] = mapped_column(Text, default="")
    specialties: Mapped[str] = mapped_column(Text, default="")
    day_rate_note: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    profile: Mapped[Profile] = relationship(back_populates="scout_services")


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160), index=True)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    prompt: Mapped[str] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    featured_image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    submissions: Mapped[list[ChallengeSubmission]] = relationship(back_populates="challenge")


class ChallengeSubmission(Base):
    __tablename__ = "challenge_submissions"
    __table_args__ = (UniqueConstraint("challenge_id", "user_id", name="uq_challenge_user_submission"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("image_assets.id"), index=True)
    caption: Mapped[str] = mapped_column(Text, default="")
    vote_count: Mapped[int] = mapped_column(Integer, default=0)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_winner: Mapped[bool] = mapped_column(Boolean, default=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    challenge: Mapped[Challenge] = relationship(back_populates="submissions")
    image: Mapped[ImageAsset] = relationship(back_populates="submissions")
    votes: Mapped[list[ChallengeVote]] = relationship(back_populates="submission", cascade="all, delete-orphan")


class ChallengeVote(Base):
    __tablename__ = "challenge_votes"
    __table_args__ = (UniqueConstraint("submission_id", "user_id", name="uq_vote_submission_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("challenge_submissions.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    direction: Mapped[str] = mapped_column(String(8), default="up")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    submission: Mapped[ChallengeSubmission] = relationship(back_populates="votes")


class AccessInquiry(Base):
    __tablename__ = "access_inquiries"

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=InquiryStatus.open.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    location: Mapped[Location] = relationship(back_populates="access_inquiries")


class LicenseInquiry(Base):
    __tablename__ = "license_inquiries"

    id: Mapped[int] = mapped_column(primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("image_assets.id"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=InquiryStatus.open.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    image: Mapped[ImageAsset] = relationship(back_populates="license_inquiries")


class HireInquiry(Base):
    __tablename__ = "hire_inquiries"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=InquiryStatus.open.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profile: Mapped[Profile] = relationship(back_populates="hire_inquiries")
