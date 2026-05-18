# PhotoScout Schema

## Core Tables

### User
- `id`
- `email`
- `password_hash`
- `role`
- `is_active`
- `created_at`

### Profile
- `id`
- `user_id`
- `handle`
- `display_name`
- `bio`
- `base_city`
- `specialties`
- `website_url`
- `instagram_url`
- `licensing_available`
- `scout_for_hire`
- `hourly_rate_note`
- `created_at`
- `updated_at`

### AuthSession
- `id`
- `user_id`
- `token_hash`
- `created_at`
- `expires_at`

### Location
- `id`
- `creator_id`
- `name`
- `slug`
- `description`
- `latitude`
- `longitude`
- `visibility`
- `approximate_latitude`
- `approximate_longitude`
- `city`
- `region`
- `country`
- `is_featured`
- `created_at`
- `updated_at`

### Tag
- `id`
- `name`
- `slug`
- `kind`

### LocationTag
- `location_id`
- `tag_id`

### ImageAsset
- `id`
- `uploader_id`
- `location_id`
- `title`
- `caption`
- `storage_key`
- `source_url`
- `mime_type`
- `width`
- `height`
- `licensing_available`
- `featured`
- `created_at`

### ImageMetadata
- `id`
- `image_id`
- `camera_model`
- `lens_model`
- `focal_length`
- `aperture`
- `shutter_speed`
- `iso_speed`
- `white_balance`
- `exposure_compensation`
- `taken_at`
- `weather`
- `season`
- `sun_position`
- `camera_direction`
- `point_of_view`
- `distance_to_subject`
- `notes`

### ScoutService
- `id`
- `profile_id`
- `title`
- `description`
- `regions_served`
- `specialties`
- `day_rate_note`
- `is_active`

### Challenge
- `id`
- `title`
- `slug`
- `prompt`
- `starts_at`
- `ends_at`
- `is_active`
- `featured_image_url`
- `created_by`
- `created_at`

### ChallengeSubmission
- `id`
- `challenge_id`
- `user_id`
- `image_id`
- `caption`
- `vote_count`
- `rank`
- `is_winner`
- `is_featured`
- `created_at`

### ChallengeVote
- `id`
- `submission_id`
- `user_id`
- `created_at`

### AccessInquiry
- `id`
- `location_id`
- `requester_id`
- `owner_id`
- `message`
- `status`
- `created_at`

### LicenseInquiry
- `id`
- `image_id`
- `requester_id`
- `owner_id`
- `message`
- `status`
- `created_at`

### HireInquiry
- `id`
- `profile_id`
- `requester_id`
- `recipient_id`
- `message`
- `status`
- `created_at`

## Key Relationships
- One `User` has one `Profile`
- One `User` can upload many `ImageAsset` records
- One `User` can create many `Location` records
- One `Location` has many `ImageAsset` records
- One `ImageAsset` has one `ImageMetadata`
- One `Profile` can have many `ScoutService` rows
- One `Challenge` has many `ChallengeSubmission` rows
- One `ChallengeSubmission` has many `ChallengeVote` rows
- Private locations can receive `AccessInquiry` rows
- Scout-enabled profiles can receive `HireInquiry` rows

## Search Foundation
Phase 1 search indexes these fields through SQL keyword matching:
- location names and descriptions
- image titles and captions
- tag names
- profile handles and display names
- profile specialties
- challenge titles and prompts

Future ranking inputs reserved by schema:
- `vote_count`
- `rank`
- `is_winner`
- `is_featured`
- `created_at`
- contributor profile signals

