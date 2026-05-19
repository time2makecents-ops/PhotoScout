import os
from dataclasses import dataclass


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./photoscout.db")
    session_ttl_hours: int = int(os.getenv("SESSION_TTL_HOURS", "168"))
    upload_dir: str = os.getenv("UPLOAD_DIR", "uploads")
    app_origin: str = os.getenv("APP_ORIGIN", "https://localhost:3003")

    @property
    def cors_origins(self) -> list[str]:
        configured_origins = [
            origin.strip()
            for origin in os.getenv("APP_ORIGINS", "").split(",")
            if origin.strip()
        ]
        defaults = [
            self.app_origin,
            "https://localhost:3003",
            "https://127.0.0.1:3003",
            "https://172.16.0.44:3003",
        ]
        return list(dict.fromkeys([*configured_origins, *defaults]))


settings = Settings()
