# PhotoScout Repo Guidance

## Product Guardrails
- PhotoScout is a mobile-first discovery and marketplace app for photographers, studios, scouts, and private property owners.
- Preserve clear boundaries between `frontend/` and `backend/`.
- Do not present placeholders as complete production-grade features.
- Keep MVP decisions pragmatic and extensible. Prefer simple implementations with clear TODOs over premature abstractions.

## Current Stack Direction
- Frontend: Next.js App Router with TypeScript and plain CSS modules/global CSS.
- Backend: FastAPI with SQLAlchemy and Pydantic.
- Database: SQLAlchemy storage layer designed for PostgreSQL, with SQLite allowed for zero-friction local bootstrap.
- Media: local filesystem storage in MVP, behind an object-storage-ready image abstraction.

## Repo Structure Expectations
- `frontend/`: UI, page routes, components, client-side state, API adapters.
- `backend/`: API, domain models, schemas, services, seed logic.
- `docs/`: architecture, schema, API notes, phased plans.
- `infra/`: future deployment and local service config.

## Engineering Conventions
- Keep mobile-first as the default layout assumption.
- Model public/private location visibility explicitly. Private locations must never expose exact coordinates to unauthorized users.
- Treat auth as a real boundary even if MVP sessions are lightweight.
- Search should stay basic keyword/filter search for now. Do not add semantic/vector search until explicitly requested.
- Weekly challenge logic should preserve vote counts and future ranking fields.
- Seed data must stay usable for demos and regression checks.

## When Extending The App
- Prefer additive API endpoints over coupling frontend directly to database assumptions.
- Keep image metadata separate from the image asset record.
- Use TODOs only for real deferred work with clear intent.
- Update `README.md` and `docs/` when architecture or run instructions materially change.

## MVP Priorities
1. Auth foundation
2. Profiles
3. Location pins and visibility behavior
4. Image assets and metadata
5. Search and discovery
6. Challenge submissions and voting
7. Inquiry placeholders

