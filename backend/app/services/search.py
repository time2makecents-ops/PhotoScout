import re

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import Challenge, ImageAsset, Location, Profile, Tag
from app.schemas.domain import SearchResponse, SearchResultItem


def _query_terms(query: str) -> list[str]:
    terms = [term for term in re.split(r"\s+", query.strip()) if term]
    return terms or [query.strip()]


def _match_any(fields, term: str):
    like = f"%{term}%"
    return or_(*(field.ilike(like) for field in fields))


def _match_all_terms(fields, terms: list[str]):
    return and_(*(_match_any(fields, term) for term in terms))


def run_search(
    db: Session,
    query: str,
    visibility: str | None = None,
    licensing_available: bool | None = None,
    scout_for_hire: bool | None = None,
    tag_slug: str | None = None,
    zip_code: str | None = None,
    challenge_related: bool | None = None,
) -> SearchResponse:
    q = query.strip()
    terms = _query_terms(q)
    results: list[SearchResultItem] = []

    profile_fields = [Profile.handle, Profile.display_name, Profile.specialties, Profile.bio, Profile.base_city]
    profile_query = select(Profile).where(or_(_match_any(profile_fields, q), _match_all_terms(profile_fields, terms)))
    if scout_for_hire is not None:
        profile_query = profile_query.where(Profile.scout_for_hire == scout_for_hire)
    for profile in db.scalars(profile_query.limit(8)).all():
        results.append(
            SearchResultItem(
                id=profile.id,
                type="profile",
                title=profile.display_name,
                subtitle=profile.specialties or profile.base_city,
                href=f"/profile?handle={profile.handle}",
            )
        )

    location_fields = [
        Location.name,
        Location.description,
        Location.street_address,
        Location.city,
        Location.region,
        Location.country,
        Location.zip_code,
        Tag.name,
        Tag.slug,
    ]
    location_query = select(Location).outerjoin(Location.tags).where(or_(_match_any(location_fields, q), _match_all_terms(location_fields, terms)))
    if visibility:
        location_query = location_query.where(Location.visibility == visibility)
    if tag_slug:
        location_query = location_query.join(Location.tags).where(Tag.slug == tag_slug)
    if zip_code:
        location_query = location_query.where(Location.zip_code.ilike(f"%{zip_code.strip()}%"))
    for location in db.scalars(location_query.limit(8)).unique().all():
        results.append(
            SearchResultItem(
                id=location.id,
                type="location",
                title=location.name,
                subtitle=location.street_address or " ".join(
                    part for part in [f"{location.city}, {location.region}".strip(", "), location.zip_code] if part
                ),
                href=f"/locations/{location.slug}",
            )
        )

    image_fields = [ImageAsset.title, ImageAsset.caption]
    image_query = select(ImageAsset).where(or_(_match_any(image_fields, q), _match_all_terms(image_fields, terms)))
    if licensing_available is not None:
        image_query = image_query.where(ImageAsset.licensing_available == licensing_available)
    for image in db.scalars(image_query.limit(8)).all():
        results.append(
            SearchResultItem(
                id=image.id,
                type="image",
                title=image.title,
                subtitle=image.caption[:80],
                href=f"/images/{image.id}",
            )
        )

    challenge_fields = [Challenge.title, Challenge.prompt]
    challenge_query = select(Challenge).where(or_(_match_any(challenge_fields, q), _match_all_terms(challenge_fields, terms)))
    if challenge_related is False:
        challenge_query = challenge_query.where(False)
    for challenge in db.scalars(challenge_query.limit(6)).all():
        results.append(
            SearchResultItem(
                id=challenge.id,
                type="challenge",
                title=challenge.title,
                subtitle=challenge.prompt[:80],
                href=f"/challenges/{challenge.slug}",
            )
        )

    return SearchResponse(query=q, results=results[:20])
