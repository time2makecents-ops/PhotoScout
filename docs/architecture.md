# PhotoScout Architecture

## Proposed App Architecture

### Frontend
- Next.js App Router for mobile-first navigation and future SSR/SEO support
- Route-level pages for discovery, auth, profile, locations, search, and challenges
- A small API adapter layer in `frontend/lib/` to keep UI components separate from raw fetch logic

### Field App
- Expo Router application in `field-app/` for iOS and Android
- SQLite-backed drafts/outbox and filesystem-backed optimized JPEG upload copies
- SecureStore-backed, revocable field-device credential
- Foreground GPS, camera/library capture, review, and user-initiated sync only

### Backend
- FastAPI REST API with route modules grouped by domain
- SQLAlchemy ORM models for durable relational structure
- Pydantic request/response schemas
- Service layer for auth, search, and seed logic

### Data And Storage
- SQLAlchemy models remain PostgreSQL-friendly
- Local default database uses SQLite for frictionless setup
- Image assets are stored using a local filesystem strategy now, with storage fields that can later point to object storage

## Phase 1 Route Structure

### Frontend Pages
- `/`: featured locations, current weekly challenge, highlighted scouts
- `/login`: sign in
- `/signup`: create account
- `/dashboard`: current user summary, quick links, own locations, challenge activity
- `/profile`: current user profile edit/view
- `/locations/new`: add-pin flow
- `/locations/[slug]`: location details and attached images
- `/saved`: the current user's saved locations and project-based shoot boards
- `/images/[id]`: image detail with metadata
- `/challenges`: challenge index
- `/challenges/[slug]`: challenge detail, submissions, voting, submit form
- `/search`: keyword search and filter results

### Backend API
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/map-tiles/{z}/{x}/{y}.png` (LAN-friendly OpenStreetMap tile proxy)
- `GET /api/profiles`
- `GET /api/profiles/{handle}`
- `PATCH /api/profiles/me`
- `GET /api/locations`
- `GET /api/locations/{slug}`
- `POST /api/locations`
- `GET /api/saved-locations`
- `GET /api/saved-locations/{location_id}`
- `POST /api/saved-locations/{location_id}`
- `DELETE /api/saved-locations/{location_id}`
- `GET /api/boards`
- `POST /api/boards`
- `GET /api/boards/{board_id}`
- `PATCH /api/boards/{board_id}`
- `DELETE /api/boards/{board_id}`
- `POST /api/boards/{board_id}/locations/{location_id}`
- `DELETE /api/boards/{board_id}/locations/{location_id}`
- `POST /api/field-devices/pairing-requests`
- `POST /api/field-devices/pair`
- `GET /api/field-devices`
- `DELETE /api/field-devices/{device_id}`
- `GET /api/field-sync/captures/{client_capture_id}`
- `POST /api/field-sync/captures` (multipart manifest plus ordered JPEG files)
- `POST /api/uploads/images`
- `GET /api/images/{image_id}`
- `GET /api/challenges`
- `GET /api/challenges/{slug}`
- `POST /api/challenges/{challenge_id}/submissions`
- `POST /api/challenges/submissions/{submission_id}/vote`
- `POST /api/admin/challenges`
- `GET /api/search`

## Add Pin UX
The MVP add-pin flow is intentionally linear:
1. Confirm a map pin
2. Name the location
3. Choose public or private
4. Add a short description
5. Add tags or category
6. Optionally attach original or royalty-free reference images, richer shoot metadata, and notes

Unfinished add-pin details and the selected map position are saved in local browser storage. Refreshing or leaving the flow restores the same step on that device; a successful save clears the draft.

Image uploads accept JPG, PNG, and WebP files up to 10 MB. Every image carries a source type; royalty-free reference images require a source or usage note and cannot be licensed through PhotoScout.

## Offline Field Sync
The web app creates a one-use, 10-minute pairing payload containing the configured field API base URL. The companion exchanges it for a random device token whose hash is stored server-side. That token is accepted only by field-sync routes, not by general account APIs.

A field package is one GPS pin with shared title, notes, tags, visibility and optional place fields, plus zero to 12 ordered photos. At most one photo is the area shot. The backend validates the entire manifest and every image before creating the ordinary `Location`, `ImageAsset`, and `ImageMetadata` records. `(user_id, client_capture_id)` is unique, so an interrupted retry returns the original receipt instead of duplicating the location.

## Sensible Phase Plan
1. Foundation: repo, docs, environment files, models, seed strategy
2. Backend slice: auth, profiles, locations, images, challenges, search
3. Frontend slice: mobile-first pages wired to live API data
4. Polish: validation hardening, better empty states, pagination, Postgres switch, migrations
