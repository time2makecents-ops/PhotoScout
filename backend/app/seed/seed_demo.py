from datetime import UTC, datetime, timedelta

from sqlalchemy import delete

from app.core.security import hash_password
from app.core.utils import slugify
from app.db.session import SessionLocal, create_all
from app.models import AccessInquiry, AuthSession, Challenge, ChallengeSubmission, ChallengeVote, HireInquiry, ImageAsset, ImageMetadata, LicenseInquiry, Location, Profile, ScoutService, Tag, User
from app.models.entities import location_tags


def seed() -> None:
    create_all()
    db = SessionLocal()
    try:
        db.execute(delete(location_tags))
        for model in [ChallengeVote, ChallengeSubmission, Challenge, AccessInquiry, LicenseInquiry, HireInquiry, AuthSession, ImageMetadata, ImageAsset, Location, ScoutService, Profile, Tag, User]:
            db.execute(delete(model))
        db.commit()

        users = [
            User(email="admin@photoscout.example.com", password_hash=hash_password("password123"), role="admin"),
            User(email="maya@photoscout.example.com", password_hash=hash_password("password123"), role="photographer"),
            User(email="hello@northlightstudio.example.com", password_hash=hash_password("password123"), role="studio"),
            User(email="evan@photoscout.example.com", password_hash=hash_password("password123"), role="scout"),
            User(email="owner@hillsideestate.example.com", password_hash=hash_password("password123"), role="property_owner"),
        ]
        db.add_all(users)
        db.flush()

        profiles = [
            Profile(user_id=users[0].id, handle="photoscout-admin", display_name="PhotoScout Admin", bio="Platform administrator.", base_city="Los Angeles", specialties="Operations, curation"),
            Profile(user_id=users[1].id, handle="maya-reyes", display_name="Maya Reyes", bio="Editorial and landscape photographer focused on cinematic dusk light.", base_city="Los Angeles", specialties="Landscape, dusk, travel", licensing_available=True),
            Profile(user_id=users[2].id, handle="northlight-studio", display_name="Northlight Studio", bio="Production team scouting premium west coast locations.", base_city="Burbank", specialties="Commercial, branded content"),
            Profile(user_id=users[3].id, handle="evan-scouts", display_name="Evan Brooks", bio="Independent location scout for remote roads, modernist homes, and rugged overlooks.", base_city="Ojai", specialties="Roadside, modernist, desert", scout_for_hire=True, hourly_rate_note="$850 day rate"),
            Profile(user_id=users[4].id, handle="hillside-estate", display_name="Hillside Estate", bio="Private owner open to curated productions with advance approval.", base_city="Malibu", specialties="Private property, event-friendly"),
        ]
        db.add_all(profiles)
        db.flush()

        db.add(
            ScoutService(
                profile_id=profiles[3].id,
                title="West Coast Location Scout",
                description="Half-day and full-day scouting for productions needing remote roads, cliff overlooks, and architectural exteriors.",
                regions_served="Southern California, Central Coast, high desert",
                specialties="Remote roads, cliff overlooks, modern architecture",
                day_rate_note="$850/day",
                is_active=True,
            )
        )

        tags = [
            Tag(name="Coastal", slug="coastal", kind="category"),
            Tag(name="Modernist", slug="modernist", kind="category"),
            Tag(name="Golden Hour", slug="golden-hour", kind="category"),
            Tag(name="Private Estate", slug="private-estate", kind="category"),
        ]
        db.add_all(tags)
        db.flush()

        public_location = Location(
            creator_id=users[1].id,
            name="Point Dume Bluff Trail",
            slug=slugify("Point Dume Bluff Trail"),
            description="Cliffside trail with layered ocean horizons, easy sunrise access, and strong golden-hour silhouettes.",
            street_address="Point Dume State Beach, Malibu, CA 90265, USA",
            latitude=34.0006,
            longitude=-118.8065,
            approximate_latitude=34.0006,
            approximate_longitude=-118.8065,
            visibility="public",
            city="Malibu",
            region="CA",
            country="USA",
            zip_code="90265",
            is_featured=True,
            tags=[tags[0], tags[2]],
        )
        private_location = Location(
            creator_id=users[4].id,
            name="Hillside Glass House",
            slug=slugify("Hillside Glass House"),
            description="Private ridge-top estate with clean glass walls, long drive entry, and broad canyon sunset coverage.",
            street_address="Hillside Glass House, Malibu, CA 90265, USA",
            latitude=34.0821,
            longitude=-118.7799,
            approximate_latitude=34.0780,
            approximate_longitude=-118.7710,
            visibility="private",
            city="Malibu",
            region="CA",
            country="USA",
            zip_code="90265",
            tags=[tags[1], tags[3]],
        )
        db.add_all([public_location, private_location])
        db.flush()

        image_public = ImageAsset(
            uploader_id=users[1].id,
            location_id=public_location.id,
            title="Bluff Trail At Sunset",
            caption="Warm cross-light over the ocean with layered haze and room for talent along the cliff edge.",
            storage_key="seed-bluff-sunset.jpg",
            source_url="https://picsum.photos/id/1018/1200/800",
            mime_type="image/jpeg",
            licensing_available=True,
            featured=True,
        )
        image_private = ImageAsset(
            uploader_id=users[4].id,
            location_id=private_location.id,
            title="Glass House Exterior",
            caption="Clean architectural lines, broad parking court, and sunset reflections across canyon-facing glass.",
            storage_key="seed-glass-house.jpg",
            source_url="https://picsum.photos/id/1035/1200/800",
            mime_type="image/jpeg",
            licensing_available=False,
            featured=True,
        )
        challenge_image = ImageAsset(
            uploader_id=users[3].id,
            location_id=public_location.id,
            title="Backlit Canyon Road",
            caption="Scout reference image from a winding road with layered backlight and practical shoulder access.",
            storage_key="seed-canyon-road.jpg",
            source_url="https://picsum.photos/id/1043/1200/800",
            mime_type="image/jpeg",
            licensing_available=True,
        )
        db.add_all([image_public, image_private, challenge_image])
        db.flush()

        db.add_all(
            [
                ImageMetadata(image_id=image_public.id, camera_model="Sony A7R V", lens_model="24-70mm GM II", focal_length="42mm", aperture="f/5.6", shutter_speed="1/250", iso_speed="200", white_balance="Daylight", exposure_compensation="+0.3", taken_at=datetime.now(UTC) - timedelta(days=12, hours=1), weather="Clear", season="Summer", sun_position="Low western sun over the Pacific horizon", camera_direction="Southwest", point_of_view="Trail edge looking west", distance_to_subject="30 meters", notes="Excellent silhouette opportunities in final 20 minutes of daylight."),
                ImageMetadata(image_id=image_private.id, camera_model="Canon R5", lens_model="RF 15-35mm", focal_length="18mm", aperture="f/8", shutter_speed="1/125", iso_speed="320", white_balance="Cloudy", exposure_compensation="-0.7", taken_at=datetime.now(UTC) - timedelta(days=27, hours=2), weather="Light marine haze", season="Spring", sun_position="Sunset side light striking facade glass", camera_direction="West", point_of_view="Drive court toward facade", distance_to_subject="50 meters", notes="Private estate. Exact entrance details withheld."),
                ImageMetadata(image_id=challenge_image.id, camera_model="Fujifilm X-T5", lens_model="33mm f/1.4", focal_length="33mm", aperture="f/2", shutter_speed="1/500", iso_speed="400", white_balance="Shade", exposure_compensation="+0.7", taken_at=datetime.now(UTC) - timedelta(days=4, hours=3), weather="Dry", season="Autumn", sun_position="Backlit ridge sun just above canyon edge", camera_direction="North", point_of_view="Road shoulder", distance_to_subject="80 meters", notes="Useful for automotive scout decks."),
            ]
        )

        challenge = Challenge(
            title="Golden Hour Geometry",
            slug=slugify("Golden Hour Geometry"),
            prompt="Submit an image that uses architecture, roads, or landscape lines to create strong geometry during golden hour.",
            starts_at=datetime.now(UTC) - timedelta(days=2),
            ends_at=datetime.now(UTC) + timedelta(days=5),
            is_active=True,
            featured_image_url="https://picsum.photos/id/1050/1200/800",
            created_by=users[0].id,
        )
        db.add(challenge)
        db.flush()

        submission = ChallengeSubmission(
            challenge_id=challenge.id,
            user_id=users[3].id,
            image_id=challenge_image.id,
            caption="Warm rim light on a canyon bend with enough negative space for a commercial car pass.",
            vote_count=2,
            rank=1,
            is_winner=False,
            is_featured=True,
        )
        db.add(submission)
        db.flush()
        db.add_all(
            [
                ChallengeVote(submission_id=submission.id, user_id=users[1].id, direction="up"),
                ChallengeVote(submission_id=submission.id, user_id=users[2].id, direction="up"),
            ]
        )

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
