import json
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_session_token
from app.db.session import get_db
from app.models import FieldDevice, FieldPairingRequest, User
from app.schemas.field import FieldDeviceRead, FieldPairRequest, FieldPairResponse, FieldPairingRequestRead
from app.services.auth import get_current_user

router = APIRouter()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@router.post("/pairing-requests", response_model=FieldPairingRequestRead, status_code=status.HTTP_201_CREATED)
def create_pairing_request(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FieldPairingRequestRead:
    raw_secret = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(minutes=10)
    pairing = FieldPairingRequest(
        user_id=current_user.id,
        secret_hash=hash_session_token(raw_secret),
        api_base_url=settings.field_api_base_url.rstrip("/"),
        expires_at=expires_at,
    )
    db.add(pairing)
    db.commit()
    payload = json.dumps(
        {"version": 1, "api_base_url": pairing.api_base_url, "pairing_secret": raw_secret},
        separators=(",", ":"),
    )
    return FieldPairingRequestRead(pairing_payload=payload, api_base_url=pairing.api_base_url, expires_at=expires_at)


@router.post("/pair", response_model=FieldPairResponse)
def pair_device(payload: FieldPairRequest, db: Session = Depends(get_db)) -> FieldPairResponse:
    pairing = db.scalar(
        select(FieldPairingRequest).where(FieldPairingRequest.secret_hash == hash_session_token(payload.pairing_secret))
    )
    now = datetime.now(UTC)
    if not pairing or pairing.used_at or _aware(pairing.expires_at) <= now:
        raise HTTPException(status_code=400, detail="Pairing code is invalid, expired, or already used")

    raw_token = secrets.token_urlsafe(32)
    device = FieldDevice(
        user_id=pairing.user_id,
        name=payload.name.strip(),
        platform=payload.platform,
        token_hash=hash_session_token(raw_token),
        last_seen_at=now,
    )
    pairing.used_at = now
    db.add_all([pairing, device])
    db.commit()
    db.refresh(device)
    return FieldPairResponse(device_token=raw_token, device_id=device.id, api_base_url=pairing.api_base_url)


@router.get("", response_model=list[FieldDeviceRead])
def list_devices(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FieldDevice]:
    return list(db.scalars(select(FieldDevice).where(FieldDevice.user_id == current_user.id).order_by(FieldDevice.created_at.desc())).all())


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device(
    device_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    device = db.scalar(select(FieldDevice).where(FieldDevice.id == device_id, FieldDevice.user_id == current_user.id))
    if not device:
        raise HTTPException(status_code=404, detail="Field device not found")
    if not device.revoked_at:
        device.revoked_at = datetime.now(UTC)
        db.add(device)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
