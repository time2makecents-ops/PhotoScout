from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Challenge, ImageAsset, Location, Profile, Tag
from app.schemas.domain import SearchResponse, SearchResultItem


def run_search(
    db: Session,
    query: str,
    visibility: str | None = None,
    licensing_available: bool | None = None,
    scout_for_hire: bool | None = None,
    tag_slug: str | None = None,
    challenge_related: bool | None = None,
) -> SearchResponse:
    q = query.strip()
    like = f"%{q}%"
    results: list[SearchResultItem] = []

    profile_query = select(Profile).where(
        or_(Profile.handle.ilike(like), Profile.display_name.ilike(like), Profile.specialties.ilike(like))
    )
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

    location_query = select(Location).where(
        or_(Location.name.ilike(like), Location.description.ilike(like), Location.city.ilike(like), Location.zip_code.ilike(like))
    )
    if visibility:
        location_query = location_query.where(Location.visibility == visibility)
    if tag_slug:
        location_query = location_query.join(Location.tags).where(Tag.slug == tag_slug)
    for location in db.scalars(location_query.limit(8)).unique().all():
        results.append(
            SearchResultItem(
                id=location.id,
                type="location",
                title=location.name,
                subtitle=" ".join(part for part in [f"{location.city}, {location.region}".strip(", "), location.zip_code] if part),
                href=f"/locations/{location.slug}",
            )
        )

    image_query = select(ImageAsset).where(or_(ImageAsset.title.ilike(like), ImageAsset.caption.ilike(like)))
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

    challenge_query = select(Challenge).where(or_(Challenge.title.ilike(like), Challenge.prompt.ilike(like)))
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
