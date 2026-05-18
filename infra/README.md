# Infra Notes

Phase 1 keeps infra intentionally light:
- local backend process
- local frontend process
- SQLite by default for zero-friction bootstrap
- PostgreSQL migration path preserved through `DATABASE_URL`

Future additions can live here:
- Docker Compose
- PostgreSQL local service config
- object storage emulator config
- deployment manifests

