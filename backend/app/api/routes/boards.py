from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models import Board, BoardLocation, ImageAsset, Location, SavedLocation, User
from app.schemas.domain import BoardCreateRequest, BoardRead, BoardUpdateRequest
from app.services.auth import get_current_user
from app.services.serializers import location_to_read

router = APIRouter()


def _can_view_exact(location: Location, user: User) -> bool:
    return location.visibility == "public" or user.id == location.creator_id or user.role == "admin"


def _board_options():
    return (
        joinedload(Board.location_entries).joinedload(BoardLocation.location).joinedload(Location.tags),
        joinedload(Board.location_entries)
        .joinedload(BoardLocation.location)
        .joinedload(Location.images)
        .joinedload(ImageAsset.image_metadata),
        joinedload(Board.location_entries)
        .joinedload(BoardLocation.location)
        .joinedload(Location.creator)
        .joinedload(User.profile),
    )


def _get_board(db: Session, board_id: int, user_id: int) -> Board | None:
    return db.scalar(
        select(Board)
        .options(*_board_options())
        .where(Board.id == board_id, Board.user_id == user_id)
    )


def _serialize_board(board: Board, user: User) -> BoardRead:
    entries = sorted(board.location_entries, key=lambda item: (item.created_at, item.id), reverse=True)
    return BoardRead(
        id=board.id,
        name=board.name,
        description=board.description,
        created_at=board.created_at,
        updated_at=board.updated_at,
        locations=[location_to_read(item.location, _can_view_exact(item.location, user)) for item in entries],
    )


@router.get("", response_model=list[BoardRead])
def list_boards(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BoardRead]:
    boards = db.scalars(
        select(Board)
        .options(*_board_options())
        .where(Board.user_id == current_user.id)
        .order_by(Board.updated_at.desc(), Board.id.desc())
    ).unique().all()
    return [_serialize_board(board, current_user) for board in boards]


@router.post("", response_model=BoardRead, status_code=status.HTTP_201_CREATED)
def create_board(
    payload: BoardCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BoardRead:
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Board name must contain at least two characters")
    board = Board(
        user_id=current_user.id,
        name=name,
        description=payload.description.strip(),
    )
    db.add(board)
    db.commit()
    hydrated = _get_board(db, board.id, current_user.id)
    return _serialize_board(hydrated, current_user)


@router.get("/{board_id}", response_model=BoardRead)
def get_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BoardRead:
    board = _get_board(db, board_id, current_user.id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return _serialize_board(board, current_user)


@router.patch("/{board_id}", response_model=BoardRead)
def update_board(
    board_id: int,
    payload: BoardUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BoardRead:
    board = _get_board(db, board_id, current_user.id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    if payload.name is not None:
        name = payload.name.strip()
        if len(name) < 2:
            raise HTTPException(status_code=422, detail="Board name must contain at least two characters")
        board.name = name
    if payload.description is not None:
        board.description = payload.description.strip()
    db.commit()
    hydrated = _get_board(db, board.id, current_user.id)
    return _serialize_board(hydrated, current_user)


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    board = _get_board(db, board_id, current_user.id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    db.delete(board)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{board_id}/locations/{location_id}", response_model=BoardRead)
def add_location_to_board(
    board_id: int,
    location_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BoardRead:
    board = _get_board(db, board_id, current_user.id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    saved = db.scalar(
        select(SavedLocation).where(
            SavedLocation.user_id == current_user.id,
            SavedLocation.location_id == location_id,
        )
    )
    if not saved:
        raise HTTPException(status_code=400, detail="Save this place before adding it to a board")
    existing = db.scalar(
        select(BoardLocation).where(
            BoardLocation.board_id == board.id,
            BoardLocation.location_id == location_id,
        )
    )
    if not existing:
        db.add(BoardLocation(board_id=board.id, location_id=location_id))
        board.updated_at = datetime.now(UTC)
        db.commit()
    hydrated = _get_board(db, board.id, current_user.id)
    return _serialize_board(hydrated, current_user)


@router.delete("/{board_id}/locations/{location_id}", response_model=BoardRead)
def remove_location_from_board(
    board_id: int,
    location_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BoardRead:
    board = _get_board(db, board_id, current_user.id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    entry = db.scalar(
        select(BoardLocation).where(
            BoardLocation.board_id == board.id,
            BoardLocation.location_id == location_id,
        )
    )
    if entry:
        db.delete(entry)
        board.updated_at = datetime.now(UTC)
        db.commit()
    hydrated = _get_board(db, board.id, current_user.id)
    return _serialize_board(hydrated, current_user)
