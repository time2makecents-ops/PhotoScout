from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models import Challenge, ChallengeSubmission, ChallengeVote, ImageAsset, User
from app.schemas.domain import ChallengeDetailRead, ChallengeRead, ChallengeSubmissionCreateRequest, ChallengeVoteRequest
from app.services.auth import get_current_user
from app.services.serializers import challenge_detail_to_read, challenge_to_read

router = APIRouter()


@router.get("", response_model=list[ChallengeRead])
def list_challenges(db: Session = Depends(get_db)) -> list[ChallengeRead]:
    challenges = db.scalars(select(Challenge).order_by(Challenge.starts_at.desc())).all()
    return [challenge_to_read(challenge) for challenge in challenges]


@router.get("/{slug}", response_model=ChallengeDetailRead)
def get_challenge(slug: str, db: Session = Depends(get_db)) -> ChallengeDetailRead:
    challenge = db.scalar(
        select(Challenge)
        .options(
            joinedload(Challenge.submissions)
            .joinedload(ChallengeSubmission.image)
            .joinedload(ImageAsset.image_metadata),
            joinedload(Challenge.submissions)
            .joinedload(ChallengeSubmission.image)
            .joinedload(ImageAsset.uploader)
            .joinedload(User.profile),
        )
        .where(Challenge.slug == slug)
    )
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return challenge_detail_to_read(challenge)


@router.post("/{challenge_id}/submissions", response_model=ChallengeDetailRead, status_code=status.HTTP_201_CREATED)
def submit_to_challenge(
    challenge_id: int,
    payload: ChallengeSubmissionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChallengeDetailRead:
    challenge = db.scalar(select(Challenge).where(Challenge.id == challenge_id))
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    image = db.scalar(select(ImageAsset).where(ImageAsset.id == payload.image_id, ImageAsset.uploader_id == current_user.id))
    if not image:
        raise HTTPException(status_code=400, detail="Image not found for current user")

    submission = ChallengeSubmission(
        challenge_id=challenge_id,
        user_id=current_user.id,
        image_id=image.id,
        caption=payload.caption or "",
    )
    db.add(submission)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="User already submitted to this challenge") from exc

    return get_challenge(challenge.slug, db)


@router.post("/submissions/{submission_id}/vote", response_model=ChallengeDetailRead)
def vote_submission(
    submission_id: int,
    payload: ChallengeVoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChallengeDetailRead:
    submission = db.scalar(
        select(ChallengeSubmission)
        .options(joinedload(ChallengeSubmission.challenge))
        .where(ChallengeSubmission.id == submission_id)
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Users cannot vote for their own submission")

    existing_vote = db.scalar(
        select(ChallengeVote).where(
            ChallengeVote.submission_id == submission.id,
            ChallengeVote.user_id == current_user.id,
        )
    )
    if existing_vote:
        if existing_vote.direction == payload.direction:
            submission.vote_count += -1 if payload.direction == "up" else 1
            db.delete(existing_vote)
            db.add(submission)
            db.commit()
            return get_challenge(submission.challenge.slug, db)

        submission.vote_count += 2 if payload.direction == "up" else -2
        existing_vote.direction = payload.direction
        db.add(existing_vote)
        db.add(submission)
        db.commit()
        return get_challenge(submission.challenge.slug, db)

    submission.vote_count += 1 if payload.direction == "up" else -1
    db.add(ChallengeVote(submission_id=submission.id, user_id=current_user.id, direction=payload.direction))
    db.add(submission)
    db.commit()

    return get_challenge(submission.challenge.slug, db)
