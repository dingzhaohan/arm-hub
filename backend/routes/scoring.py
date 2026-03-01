"""Scoring routes (reserved for future agent integration)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db, ARMVersion, ARMScoreJob, ARMScoreResult
from schemas import ScoreRequestOut, ScoreOut, ScoreCallbackIn
from app_config import limiter
from auth import require_login

router = APIRouter(tags=["scoring"])


@router.post("/api/arm-versions/{arm_version_id}/score/request", response_model=ScoreRequestOut)
@limiter.limit("5/minute")
def request_score(
    request: Request,
    arm_version_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    v = db.query(ARMVersion).filter(ARMVersion.id == arm_version_id).first()
    if not v:
        raise HTTPException(404, "ARM Version not found")
    if v.owner_user_id != user.id:
        raise HTTPException(403, "Not the owner")
    if v.status != "ready":
        raise HTTPException(400, "ARM Version must be ready before scoring")

    # Check for existing pending job
    existing = db.query(ARMScoreJob).filter(
        ARMScoreJob.arm_version_id == arm_version_id,
        ARMScoreJob.status.in_(["pending", "running"]),
    ).first()
    if existing:
        return ScoreRequestOut(job_id=existing.id, status=existing.status)

    job = ARMScoreJob(
        arm_version_id=arm_version_id,
        status="pending",
        triggered_by=user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return ScoreRequestOut(job_id=job.id, status=job.status)


@router.get("/api/arm-versions/{arm_version_id}/score", response_model=ScoreOut)
def get_score(arm_version_id: int, db: Session = Depends(get_db)):
    v = db.query(ARMVersion).filter(ARMVersion.id == arm_version_id).first()
    if not v:
        raise HTTPException(404, "ARM Version not found")

    latest_job = (
        db.query(ARMScoreJob)
        .filter(ARMScoreJob.arm_version_id == arm_version_id)
        .order_by(ARMScoreJob.created_at.desc())
        .first()
    )

    result = None
    if latest_job:
        result = (
            db.query(ARMScoreResult)
            .filter(ARMScoreResult.job_id == latest_job.id)
            .first()
        )

    return ScoreOut(
        arm_version_id=arm_version_id,
        score_total=v.score_total,
        status=latest_job.status if latest_job else None,
        dimensions_json=result.dimensions_json if result else None,
        report_md_key=result.report_md_key if result else None,
    )


@router.post("/api/scoring/jobs/{job_id}/callback")
def score_callback(
    job_id: int,
    data: ScoreCallbackIn,
    db: Session = Depends(get_db),
):
    # TODO: Add service-to-service authentication
    job = db.query(ARMScoreJob).filter(ARMScoreJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Score job not found")
    if job.status == "completed":
        raise HTTPException(400, "Job already completed")

    # Create result
    result = ARMScoreResult(
        job_id=job.id,
        arm_version_id=job.arm_version_id,
        total_score=data.total_score,
        dimensions_json=data.dimensions_json,
        report_md_key=data.report_md_key,
    )
    db.add(result)

    # Update job status
    job.status = "completed"

    # Update ARM version score
    v = db.query(ARMVersion).filter(ARMVersion.id == job.arm_version_id).first()
    if v:
        v.score_total = data.total_score

    db.commit()
    return {"status": "ok"}
