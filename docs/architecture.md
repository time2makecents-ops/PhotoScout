# PhotoScout Architecture

## Proposed App Architecture

### Frontend
- Next.js App Router for mobile-first navigation and future SSR/SEO support
- Route-level pages for discovery, auth, profile, locations, search, and challenges
- A small API adapter layer in `frontend/lib/` to keep UI components separate from raw fetch logic

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
- `/images/[id]`: image detail with metadata
- `/challenges`: challenge index
- `/challenges/[slug]`: challenge detail, submissions, voting, submit form
- `/search`: keyword search and filter results

### Backend API
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/profiles`
- `GET /api/profiles/{handle}`
- `PATCH /api/profiles/me`
- `GET /api/locations`
- `GET /api/locations/{slug}`
- `POST /api/locations`
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
1. Upload at least one image
2. Confirm a map pin
3. Name the location
4. Choose public or private
5. Add a short description
6. Add tags or category
7. Optionally attach richer shoot metadata and notes

## Sensible Phase Plan
1. Foundation: repo, docs, environment files, models, seed strategy
2. Backend slice: auth, profiles, locations, images, challenges, search
3. Frontend slice: mobile-first pages wired to live API data
4. Polish: validation hardening, better empty states, pagination, Postgres switch, migrations

