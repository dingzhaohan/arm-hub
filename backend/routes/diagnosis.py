"""Diagnosis report routes: create, upload, read (one per paper)."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db, Paper, DiagnosisReport
from schemas import DiagnosisReportOut
from app_config import limiter
from auth import require_login
from config.config import OSS_BUCKET, OSS_ENDPOINT
import oss_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/papers/{paper_id}/diagnosis", tags=["diagnosis"])


def _report_to_out(r: DiagnosisReport) -> DiagnosisReportOut:
    out = DiagnosisReportOut.model_validate(r)
    out.uploader_name = r.uploader.display_name or r.uploader.username if r.uploader else None
    return out


def _get_current_report(paper_id: int, db: Session):
    """Get the latest ready report for a paper, or None."""
    return (
        db.query(DiagnosisReport)
        .filter(DiagnosisReport.paper_id == paper_id, DiagnosisReport.status == "ready")
        .order_by(DiagnosisReport.created_at.desc())
        .first()
    )


# ─── Create (one per paper, reject if exists) ─────────────

@router.post("")
@limiter.limit("10/minute")
def create_diagnosis_report(
    request: Request,
    paper_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")

    # Reject if a ready report already exists
    existing = _get_current_report(paper_id, db)
    if existing:
        raise HTTPException(409, "This paper already has a diagnosis report. Delete the existing one first.")

    # Clean up any leftover non-ready records (failed/draft)
    stale = db.query(DiagnosisReport).filter(
        DiagnosisReport.paper_id == paper_id,
        DiagnosisReport.status != "ready",
    ).all()
    for s in stale:
        db.delete(s)
    db.flush()

    report = DiagnosisReport(
        paper_id=paper_id,
        uploader_user_id=user.id,
        status="draft",
    )
    db.add(report)
    db.flush()

    oss_prefix = f"papers/{paper_id}/diagnosis/{report.id}"
    object_key = f"{oss_prefix}/diagnosis.md"

    try:
        sts = oss_service.get_sts_token(oss_prefix, duration_seconds=3600)
    except Exception as e:
        logger.error("STS token generation failed: %s", e)
        raise HTTPException(500, f"Failed to generate upload credentials: {e}")

    report.status = "uploading"
    db.commit()
    db.refresh(report)

    endpoint = OSS_ENDPOINT.replace("https://", "").replace("http://", "")
    region = endpoint.split(".")[0].replace("oss-", "")

    return {
        "report": _report_to_out(report),
        "credential": {
            "bucket": OSS_BUCKET,
            "region": region,
            "endpoint": OSS_ENDPOINT,
            "object_key": object_key,
            "access_key_id": sts["access_key_id"],
            "access_key_secret": sts["access_key_secret"],
            "security_token": sts["security_token"],
            "expiration": sts["expiration"],
        },
    }


# ─── Complete (after frontend uploaded to OSS) ─────────────

@router.post("/{report_id}/complete")
@limiter.limit("20/minute")
def complete_diagnosis_report(
    request: Request,
    paper_id: int,
    report_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    report = db.query(DiagnosisReport).filter(
        DiagnosisReport.id == report_id,
        DiagnosisReport.paper_id == paper_id,
    ).first()
    if not report:
        raise HTTPException(404, "Diagnosis report not found")
    if report.uploader_user_id != user.id:
        raise HTTPException(403, "Not the uploader")

    object_key = f"papers/{paper_id}/diagnosis/{report_id}/diagnosis.md"
    if not oss_service.object_exists(object_key):
        raise HTTPException(400, "Diagnosis file not found in OSS")

    report.oss_key = object_key
    report.status = "ready"
    db.commit()
    db.refresh(report)
    return _report_to_out(report)


# ─── Get current report (latest ready one) ────────────────

@router.get("")
def get_diagnosis_report(
    paper_id: int,
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")

    report = _get_current_report(paper_id, db)
    if not report:
        return None

    content = oss_service.get_text_content(report.oss_key)
    if content is None:
        raise HTTPException(404, "Diagnosis report file not readable")

    return {
        "report": _report_to_out(report),
        "content": content,
    }


# ─── Delete ────────────────────────────────────────────────

@router.delete("/{report_id}")
def delete_diagnosis_report(
    paper_id: int,
    report_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    report = db.query(DiagnosisReport).filter(
        DiagnosisReport.id == report_id,
        DiagnosisReport.paper_id == paper_id,
    ).first()
    if not report:
        raise HTTPException(404, "Diagnosis report not found")
    if report.uploader_user_id != user.id:
        raise HTTPException(403, "Not allowed to delete this report")

    if report.oss_key:
        try:
            oss_service.delete_object(report.oss_key)
        except Exception as e:
            logger.error("Failed to delete oss key %s: %s", report.oss_key, e)

    db.delete(report)
    db.commit()
    return {"status": "ok"}
