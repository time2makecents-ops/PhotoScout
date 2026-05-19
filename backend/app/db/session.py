from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.base import Base


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    Base.metadata.create_all(bind=engine)


def _sqlite_columns(connection, table_name: str) -> set[str]:
    rows = connection.execute(text(f"PRAGMA table_info({table_name})")).mappings().all()
    return {row["name"] for row in rows}


def ensure_sqlite_compatibility() -> None:
    if not settings.database_url.startswith("sqlite"):
        return

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        if "locations" in tables:
            location_columns = _sqlite_columns(connection, "locations")
            if "street_address" not in location_columns:
                connection.execute(text("ALTER TABLE locations ADD COLUMN street_address VARCHAR(255) NOT NULL DEFAULT ''"))
            if "zip_code" not in location_columns:
                connection.execute(text("ALTER TABLE locations ADD COLUMN zip_code VARCHAR(20) NOT NULL DEFAULT ''"))
        if "image_assets" in tables:
            image_columns = _sqlite_columns(connection, "image_assets")
            if "image_role" not in image_columns:
                connection.execute(text("ALTER TABLE image_assets ADD COLUMN image_role VARCHAR(40) NOT NULL DEFAULT 'general'"))
        if "image_metadata" in tables:
            metadata_columns = _sqlite_columns(connection, "image_metadata")
            if "gps_latitude" not in metadata_columns:
                connection.execute(text("ALTER TABLE image_metadata ADD COLUMN gps_latitude FLOAT"))
            if "gps_longitude" not in metadata_columns:
                connection.execute(text("ALTER TABLE image_metadata ADD COLUMN gps_longitude FLOAT"))
            if "captured_at_device" not in metadata_columns:
                connection.execute(text("ALTER TABLE image_metadata ADD COLUMN captured_at_device DATETIME"))
            if "camera_heading_degrees" not in metadata_columns:
                connection.execute(text("ALTER TABLE image_metadata ADD COLUMN camera_heading_degrees FLOAT"))
            if "camera_heading_label" not in metadata_columns:
                connection.execute(text("ALTER TABLE image_metadata ADD COLUMN camera_heading_label VARCHAR(20)"))
            if "camera_pitch_degrees" not in metadata_columns:
                connection.execute(text("ALTER TABLE image_metadata ADD COLUMN camera_pitch_degrees FLOAT"))
            if "camera_roll_degrees" not in metadata_columns:
                connection.execute(text("ALTER TABLE image_metadata ADD COLUMN camera_roll_degrees FLOAT"))
            if "heading_source" not in metadata_columns:
                connection.execute(text("ALTER TABLE image_metadata ADD COLUMN heading_source VARCHAR(20)"))
        if "challenge_votes" in tables:
            vote_columns = _sqlite_columns(connection, "challenge_votes")
            if "direction" not in vote_columns:
                connection.execute(text("ALTER TABLE challenge_votes ADD COLUMN direction VARCHAR(8) NOT NULL DEFAULT 'up'"))
