from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, issue_session_token, verify_password
from app.core.utils import slugify
from app.db.session import get_db
from app.models import AuthSession, Profile, User
from app.schemas.auth import AuthResponse, LoginRequest, MeResponse, RegisterRequest
from app.services.auth import get_current_user

router = APIRouter()


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise HTTPException(status_code=400, detail="Email already registered")

    normalized_handle = slugify(payload.handle)
    if db.scalar(select(Profile).where(Profile.handle == normalized_handle)):
        raise HTTPException(status_code=400, detail="Handle already taken")

    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password), role=payload.role)
    profile = Profile(
        user=user,
        handle=normalized_handle,
        display_name=payload.display_name,
        bio=payload.bio or "",
        base_city=payload.base_city or "",
        specialties=payload.specialties or "",
        website_url=payload.website_url,
        instagram_url=payload.instagram_url,
        licensing_available=payload.licensing_available,
        scout_for_hire=payload.scout_for_hire,
        hourly_rate_note=payload.hourly_rate_note,
    )
    raw_token, token_hash, expires_at = issue_session_token()
    session = AuthSession(user=user, token_hash=token_hash, expires_at=expires_at)
    db.add_all([user, profile, session])
    db.commit()
    db.refresh(user)
    return AuthResponse(token=raw_token, user_id=user.id, role=user.role, handle=profile.handle)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    raw_token, token_hash, expires_at = issue_session_token()
    db.add(AuthSession(user=user, token_hash=token_hash, expires_at=expires_at))
    db.commit()
    handle = user.profile.handle if user.profile else "unknown"
    return AuthResponse(token=raw_token, user_id=user.id, role=user.role, handle=handle)


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        handle=current_user.profile.handle if current_user.profile else None,
    )
