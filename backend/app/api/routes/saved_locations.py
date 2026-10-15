from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models import Board, BoardLocation, ImageAsset, Location, SavedLocation, User
from app.schemas.domain import LocationRead
from app.services.auth import get_current_user
from app.services.serializers import location_to_read

router = APIRouter()


def _can_view_exact(location: Location, user: User) -> bool:
    return location.visibility == "public" or user.id == location.creator_id or user.role == "admin"


def _location_options():
    return (
        joinedload(SavedLocation.location).joinedload(Location.tags),
        joinedload(SavedLocation.location).joinedload(Location.images).joinedload(ImageAsset.image_metadata),
        joinedload(SavedLocation.location).joinedload(Location.creator).joinedload(User.profile),
    )


@router.get("", response_model=list[LocationRead])
def list_saved_locations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LocationRead]:
    saved = db.scalars(
        select(SavedLocation)
        .options(*_location_options())
        .where(SavedLocation.user_id == current_user.id)
        .order_by(SavedLocation.created_at.desc())
    ).unique().all()
    return [location_to_read(item.location, _can_view_exact(item.location, current_user)) for item in saved]


@router.get("/{location_id}")
def saved_location_state(
    location_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    saved = db.scalar(
        select(SavedLocation).where(
            SavedLocation.user_id == current_user.id,
            SavedLocation.location_id == location_id,
        )
    )
    return {"saved": saved is not None}


@router.post("/{location_id}", response_model=LocationRead)
def save_location(
    location_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationRead:
    location = db.scalar(
        select(Location)
        .options(
            joinedload(Location.tags),
            joinedload(Location.images).joinedload(ImageAsset.image_metadata),
            joinedload(Location.creator).joinedload(User.profile),
        )
        .where(Location.id == location_id)
    )
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    existing = db.scalar(
        select(SavedLocation).where(
            SavedLocation.user_id == current_user.id,
            SavedLocation.location_id == location_id,
        )
    )
    if not existing:
        db.add(SavedLocation(user_id=current_user.id, location_id=location_id))
        db.commit()

    return location_to_read(location, _can_view_exact(location, current_user))


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_location(
    location_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    saved = db.scalar(
        select(SavedLocation).where(
            SavedLocation.user_id == current_user.id,
            SavedLocation.location_id == location_id,
        )
    )
    if saved:
        board_entries = db.scalars(
            select(BoardLocation)
            .join(Board, Board.id == BoardLocation.board_id)
            .where(
                Board.user_id == current_user.id,
                BoardLocation.location_id == location_id,
            )
        ).all()
        for entry in board_entries:
            db.delete(entry)
        db.delete(saved)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
