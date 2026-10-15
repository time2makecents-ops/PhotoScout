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
  field-app/                 Expo offline capture companion for iOS and Android
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
- Saved-location shortlists for returning to promising shoot locations
- Shoot boards for grouping saved locations by project or client
- Offline field capture with explicit review, pairing, and idempotent sync
- Seed data for local demo flows

## Core Domain Model
- `User`
- `Profile`
- `AuthSession`
- `FieldDevice`
- `FieldPairingRequest`
- `FieldCaptureReceipt`
- `Board`
- `BoardLocation`
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
- `/saved`
- `/images/[id]`
- `/challenges`
- `/challenges/[slug]`
- `/search`

See [docs/architecture.md](/C:/photoscout/docs/architecture.md) for routing and API notes.

## Local Setup

### Dedicated Local Ports
- Frontend: `https://localhost:3003` and the current LAN address on port `3003`
- Backend API: `http://127.0.0.1:8010`

Port `8000` is intentionally not used by PhotoScout so it can remain available for other local apps.

### One-command launcher

From the repository root, use the managed launcher:

```powershell
.\photoscout.ps1 start
.\photoscout.ps1 status
.\photoscout.ps1 restart
.\photoscout.ps1 stop
```

`start` launches the backend and HTTPS frontend as hidden processes, waits for both health checks, and opens the app in the default browser. It auto-detects the current LAN IPv4 address for phone testing. Runtime certificates, logs, and PID files stay under the ignored `.runtime/` directory.

Use `-NoBrowser` for a server-only start, `-LanHost none` to disable the phone URL, or `-LanHost <IPv4 address>` to select a specific interface. Cache removal is opt-in with `restart -ClearCache`; normal restarts preserve the Next.js cache. The older `scripts\restart-dev.ps1` command remains as a compatibility wrapper.

For PhotoScout Field phone sync, restart with the scoped LAN API enabled:

```powershell
.\photoscout.ps1 restart -EnableFieldSync -NoBrowser
```

The launcher binds the backend to the LAN only in this mode and configures new Profile pairing codes with `http://<LAN-IP>:8010`. The phone and computer must be on the same network. Windows Firewall may ask for permission the first time.

### Offline field app

`field-app/` is a focused Expo companion: it captures GPS, title, notes, tags, visibility, an optional area shot, and up to 12 location photos while disconnected. Drafts and the outbox live in on-device SQLite. Device credentials are kept in SecureStore. Sync is always explicit; after a successful sync, the app retains the receipt and thumbnails while deleting its full queued JPEG copies.

Field workflow:

1. Start PhotoScout with `-EnableFieldSync` while the computer and phone share a network.
2. In the web app, open **Profile → Field app**, generate a pairing code, and scan it in the phone app.
3. Capture locations offline on the phone, review the queued records, then choose **Sync now** when the server is reachable.
4. Review the synced pin and media in the web app. A retried capture is safe: the server recognizes the original client capture ID and returns its existing receipt.

The field sync endpoint is intentionally LAN-only for local testing. Use HTTPS and a public API base URL before operating it outside a trusted network.

```powershell
cd field-app
npm.cmd install
npx.cmd expo start
```

Use Expo Go for temporary iPhone testing. For an installable Android test APK, sign into Expo and run `npx.cmd eas-cli@latest build --platform android --profile preview`. The `eas.json` preview profile is configured for internal APK distribution. An installable iOS build still requires Apple signing credentials; its bundle and permission configuration are already present.

### First-time backend setup
1. `cd backend`
2. `python -m venv .venv`
3. `.venv\Scripts\activate`
4. `python -m pip install -r requirements.txt`
5. `Copy-Item .env.example .env`
6. `python -m app.seed.seed_demo`
7. `uvicorn app.main:app --port 8010`

### First-time frontend setup
1. Open a second terminal
2. `cd frontend`
3. `Copy-Item .env.local.example .env.local`
4. `npm.cmd install`
5. Return to the repository root and run `.\photoscout.ps1 start`

The frontend runs on `https://localhost:3003`; the launcher prints the current phone URL and proxies browser API requests to `http://127.0.0.1:8010`.

## Demo Accounts
- Admin: `admin@photoscout.example.com` / `password123`
- Photographer: `maya@photoscout.example.com` / `password123`
- Studio: `hello@northlightstudio.example.com` / `password123`
- Scout: `evan@photoscout.example.com` / `password123`

## Development checks

Run the relevant checks before sharing a change:

```powershell
cd backend
.venv\Scripts\python.exe -m unittest discover -v

cd ..\frontend
npm.cmd run build

cd ..\field-app
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

The Expo app can also be exported for an Android bundle smoke test with `npx.cmd expo export --platform android --clear`.

## Repository workflow

The repository is already configured with an `origin` remote. Review the working tree before committing so existing local work remains intact:

```powershell
git status
git diff --check
git add <intended files>
git commit -m "Describe the change"
git push origin main
```

Do not add `.runtime/`, `backend/uploads/`, device data, Expo build output, or environment files. They are local runtime state and are intentionally ignored.

## Current MVP Boundaries
- File uploads are stored locally in `backend/uploads/`
- Field pairing codes expire after 10 minutes and can be used once. Field device tokens are scoped to `/api/field-sync/*` and can be revoked from Profile.
- Pins may be created before photos are available. Attached images are labeled as original RAW capture, original edited image, or royalty-free reference; reference images require a source note and are never licensable.
- Inquiry flows are placeholders with persisted records, not full messaging workflows
- Access fees and image licensing payments are explicitly deferred
- Ranking is basic for now and leaves room for challenge wins, relevance, recency, and reputation signals later
