from app.models import Challenge, ChallengeSubmission, ImageAsset, Location, Profile
from app.schemas.common import ImageRead
from app.schemas.domain import ChallengeDetailRead, ChallengeRead, ChallengeSubmissionRead, LocationRead, ProfileRead


def profile_to_read(profile: Profile) -> ProfileRead:
    uploaded_images = [image_to_read(image) for image in profile.user.images] if profile.user and profile.user.images else []
    return ProfileRead.model_validate(profile).model_copy(update={"uploaded_images": uploaded_images})


def image_to_read(image: ImageAsset) -> ImageRead:
    return ImageRead.model_validate(image)


def location_to_read(location: Location, include_exact_coordinates: bool) -> LocationRead:
    images = sorted(
        location.images,
        key=lambda image: (
            0 if image.featured else 1,
            image.created_at,
            image.id,
        ),
    )
    return LocationRead(
        id=location.id,
        name=location.name,
        slug=location.slug,
        description=location.description,
        latitude=location.latitude if include_exact_coordinates else location.approximate_latitude,
        longitude=location.longitude if include_exact_coordinates else location.approximate_longitude,
        visibility=location.visibility,
        city=location.city,
        region=location.region,
        country=location.country,
        zip_code=location.zip_code,
        is_featured=location.is_featured,
        created_at=location.created_at,
        tags=[tag for tag in location.tags],
        images=[image_to_read(image) for image in images],
        creator_handle=location.creator.profile.handle if location.creator.profile else "unknown",
        creator_name=location.creator.profile.display_name if location.creator.profile else location.creator.email,
    )


def submission_to_read(submission: ChallengeSubmission) -> ChallengeSubmissionRead:
    profile = submission.image.uploader.profile
    return ChallengeSubmissionRead(
        id=submission.id,
        caption=submission.caption,
        vote_count=submission.vote_count,
        rank=submission.rank,
        is_winner=submission.is_winner,
        is_featured=submission.is_featured,
        created_at=submission.created_at,
        user_handle=profile.handle if profile else submission.image.uploader.email,
        user_display_name=profile.display_name if profile else submission.image.uploader.email,
        image=image_to_read(submission.image),
    )


def challenge_to_read(challenge: Challenge) -> ChallengeRead:
    return ChallengeRead.model_validate(challenge)


def challenge_detail_to_read(challenge: Challenge) -> ChallengeDetailRead:
    ranked = sorted(challenge.submissions, key=lambda item: (-item.vote_count, item.created_at))
    return ChallengeDetailRead(
        **challenge_to_read(challenge).model_dump(),
        submissions=[submission_to_read(item) for item in ranked],
    )
