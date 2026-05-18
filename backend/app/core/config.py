import os
from dataclasses import dataclass


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./photoscout.db")
    session_ttl_hours: int = int(os.getenv("SESSION_TTL_HOURS", "168"))
    upload_dir: str = os.getenv("UPLOAD_DIR", "uploads")
    app_origin: str = os.getenv("APP_ORIGIN", "http://localhost:3000")


settings = Settings()

