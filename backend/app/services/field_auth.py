from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_session_token
from app.db.session import get_db
from app.models import FieldDevice


def get_current_field_device(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> FieldDevice:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Field device authentication required")

    raw_token = authorization.split(" ", 1)[1].strip()
    device = db.scalar(
        select(FieldDevice)
        .options(joinedload(FieldDevice.user))
        .where(FieldDevice.token_hash == hash_session_token(raw_token), FieldDevice.revoked_at.is_(None))
    )
    if not device or not device.user or not device.user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked field device")
    device.last_seen_at = datetime.now(UTC)
    db.add(device)
    return device
