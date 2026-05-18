from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_session_token
from app.db.session import get_db
from app.models import AuthSession, User


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    raw_token = authorization.split(" ", 1)[1].strip()
    token_hash = hash_session_token(raw_token)
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash))
    if not session or session.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return session.user


def get_optional_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    raw_token = authorization.split(" ", 1)[1].strip()
    token_hash = hash_session_token(raw_token)
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash))
    return session.user if session else None

