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


def ensure_sqlite_compatibility() -> None:
    if not settings.database_url.startswith("sqlite"):
        return

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        if "locations" in tables:
            location_columns = {column["name"] for column in inspector.get_columns("locations")}
            if "zip_code" not in location_columns:
                connection.execute(text("ALTER TABLE locations ADD COLUMN zip_code VARCHAR(20) NOT NULL DEFAULT ''"))
        if "challenge_votes" in tables:
            vote_columns = {column["name"] for column in inspector.get_columns("challenge_votes")}
            if "direction" not in vote_columns:
                connection.execute(text("ALTER TABLE challenge_votes ADD COLUMN direction VARCHAR(8) NOT NULL DEFAULT 'up'"))
