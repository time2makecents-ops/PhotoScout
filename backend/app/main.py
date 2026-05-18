from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import admin, auth, challenges, images, inquiries, locations, profiles, search, uploads
from app.core.config import settings
from app.db.session import create_all, ensure_sqlite_compatibility

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    create_all()
    ensure_sqlite_compatibility()
    yield


app = FastAPI(title="PhotoScout API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.app_origin, "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(profiles.router, prefix="/api/profiles", tags=["profiles"])
app.include_router(locations.router, prefix="/api/locations", tags=["locations"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(challenges.router, prefix="/api/challenges", tags=["challenges"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(inquiries.router, prefix="/api/inquiries", tags=["inquiries"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
