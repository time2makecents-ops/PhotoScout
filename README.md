# PhotoScout

PhotoScout is a mobile-first discovery and marketplace app for photographers, studios, location scouts, and private property owners. This repo is structured as a clean MVP foundation: a Next.js frontend, a FastAPI backend, a relational data model ready for PostgreSQL, and seed data so the product can be explored early.

## Architecture Summary

### Stack
- Frontend: Next.js App Router, TypeScript, mobile-first CSS
- Backend: FastAPI, SQLAlchemy, Pydantic
- Database: SQLAlchemy models designed for PostgreSQL, defaulting to SQLite for frictionless local bootstrap
- Media storage: local file storage in MVP with a storage abstraction path for S3-compatible object storage later

### Why SQLite locally and PostgreSQL-ready models
The product target remains PostgreSQL. For phase 1, local setup defaults to SQLite so the app can boot from zero without Docker or a separately managed database. The backend is structured around SQLAlchemy and environment-driven database URLs, so moving to PostgreSQL later is a configuration and migration step rather than a rewrite.

## Repository Structure

```text
photoscout/
  frontend/                  Next.js mobile-first client
  backend/                   FastAPI API, models, seed data
  docs/                      Architecture, schema, product notes
  infra/                     Deployment/local infra placeholders
  AGENTS.md                  Repo guidance for future Codex sessions
  README.md                  Setup, architecture, runbook
  .gitignore
```

## Phase 1 Deliverables In This Scaffold
- Auth foundation with register, login, session token, and current-user endpoint
- Profiles with public profile fields and scout-for-hire support
- Location creation and listing
- Public/private location visibility behavior
- Image upload model with metadata support
- Weekly challenges, submissions, and voting
- Basic search across profiles, locations, images, tags, and challenges
- Seed data for local demo flows

## Core Domain Model
- `User`
- `Profile`
- `AuthSession`
- `Location`
- `ImageAsset`
- `ImageMetadata`
- `Tag`
- `Challenge`
- `ChallengeSubmission`
- `ChallengeVote`
- `ScoutService`
- `AccessInquiry`
- `LicenseInquiry`
- `HireInquiry`

See [docs/schema.md](/C:/photoscout/docs/schema.md) for detailed relationships.

## Page Foundation
- `/` landing and discovery
- `/login`
- `/signup`
- `/dashboard`
- `/profile`
- `/locations/new`
- `/locations/[slug]`
- `/images/[id]`
- `/challenges`
- `/challenges/[slug]`
- `/search`

See [docs/architecture.md](/C:/photoscout/docs/architecture.md) for routing and API notes.

## Local Setup

### Backend
1. `cd backend`
2. `python -m venv .venv`
3. `.venv\Scripts\activate`
4. `python -m pip install -r requirements.txt`
5. `Copy-Item .env.example .env`
6. `python -m app.seed.seed_demo`
7. `uvicorn app.main:app --port 8001`

### Frontend
1. Open a second terminal
2. `cd frontend`
3. `Copy-Item .env.local.example .env.local`
4. `npm.cmd install`
5. `npm.cmd run dev`

Frontend runs on `http://localhost:3000` and expects the API at `http://localhost:8001`.

## Demo Accounts
- Admin: `admin@photoscout.example.com` / `password123`
- Photographer: `maya@photoscout.example.com` / `password123`
- Studio: `hello@northlightstudio.example.com` / `password123`
- Scout: `evan@photoscout.example.com` / `password123`

## Exact Local Git Initialization
Run these commands from `C:\photoscout` after reviewing the scaffold:

```powershell
git init
git add .
git commit -m "Initial PhotoScout MVP foundation"
```

## Exact GitHub Repo Creation And First Push
If you use the GitHub CLI:

```powershell
gh repo create PhotoScout --private --source . --remote origin --push
```

If you create the repo in the GitHub web UI first, then push manually:

```powershell
git branch -M main
git remote add origin https://github.com/<your-username>/PhotoScout.git
git push -u origin main
```

## Current MVP Boundaries
- File uploads are stored locally in `backend/uploads/`
- Inquiry flows are placeholders with persisted records, not full messaging workflows
- Access fees and image licensing payments are explicitly deferred
- Ranking is basic for now and leaves room for challenge wins, relevance, recency, and reputation signals later
