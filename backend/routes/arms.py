"""ARM Series and Version routes: CRUD, upload credential, complete."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session

from database import (
    get_db, ARMSeries, ARMVersion, Paper, User,
)
from schemas import (
    ARMSeriesCreateIn, ARMSeriesOut, ARMVersionCreateIn, ARMVersionOut,
    UploadCredentialIn, ModuleCompleteIn,
    DatasetBrief, SkillBrief,
)
from app_config import limiter
from auth import get_current_user, require_login
from config.config import OSS_BUCKET, OSS_ENDPOINT
import oss_service

logger = logging.getLogger(__name__)

router_series = APIRouter(prefix="/api/arm-series", tags=["arm-series"])
router_versions = APIRouter(prefix="/api/arm-versions", tags=["arm-versions"])


def _series_to_out(s: ARMSeries) -> ARMSeriesOut:
    out = ARMSeriesOut.model_validate(s)
    out.owner_name = s.owner.display_name or s.owner.username if s.owner else None
    out.version_count = len(s.versions)
    if s.versions:
        latest = sorted(s.versions, key=lambda v: v.created_at, reverse=True)[0]
        out.latest_version = latest.version
        out.latest_status = latest.status
        out.latest_score = latest.score_total
    return out


def _version_to_out(v: ARMVersion) -> ARMVersionOut:
    out = ARMVersionOut.model_validate(v)
    out.owner_name = v.owner.display_name or v.owner.username if v.owner else None
    out.datasets = [DatasetBrief.model_validate(d) for d in v.datasets]
    out.skills = [SkillBrief.model_validate(s) for s in v.skills]
    return out


# ═══════════════════════════════════════════════════════════
# ARM Series
# ═══════════════════════════════════════════════════════════

@router_series.post("", response_model=ARMSeriesOut)
@limiter.limit("10/minute")
def create_arm_series(
    request: Request,
    data: ARMSeriesCreateIn,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == data.paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")

    series = ARMSeries(
        paper_id=paper.id,
        bohrium_paper_id=paper.bohrium_paper_id,
        owner_user_id=user.id,
        title=data.title,
        description=data.description,
    )
    db.add(series)
    db.commit()
    db.refresh(series)
    return _series_to_out(series)


@router_series.get("")
def list_arm_series(
    paper_id: Optional[int] = None,
    limit: int = Query(default=20, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(ARMSeries)
    if paper_id:
        q = q.filter(ARMSeries.paper_id == paper_id)
    total = q.count()
    items = q.order_by(ARMSeries.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": [_series_to_out(s) for s in items], "total": total, "limit": limit, "offset": offset}


@router_series.get("/{series_id}", response_model=ARMSeriesOut)
def get_arm_series(series_id: int, db: Session = Depends(get_db)):
    s = db.query(ARMSeries).filter(ARMSeries.id == series_id).first()
    if not s:
        raise HTTPException(404, "ARM Series not found")
    return _series_to_out(s)


@router_series.delete("/{series_id}")
def delete_arm_series(
    series_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    s = db.query(ARMSeries).filter(ARMSeries.id == series_id).first()
    if not s:
        raise HTTPException(404, "ARM Series not found")
    if s.owner_user_id != user.id:
        raise HTTPException(403, "Not the owner")
    db.delete(s)
    db.commit()
    return {"detail": "Deleted"}


# ═══════════════════════════════════════════════════════════
# ARM Versions
# ═══════════════════════════════════════════════════════════

@router_series.get("/{series_id}/versions")
def list_arm_versions(
    series_id: int,
    db: Session = Depends(get_db),
):
    series = db.query(ARMSeries).filter(ARMSeries.id == series_id).first()
    if not series:
        raise HTTPException(404, "ARM Series not found")
    versions = (
        db.query(ARMVersion)
        .filter(ARMVersion.series_id == series_id)
        .order_by(ARMVersion.created_at.desc())
        .all()
    )
    return [_version_to_out(v) for v in versions]


@router_series.post("/{series_id}/versions", response_model=ARMVersionOut)
@limiter.limit("10/minute")
def create_arm_version(
    request: Request,
    series_id: int,
    data: ARMVersionCreateIn,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    series = db.query(ARMSeries).filter(ARMSeries.id == series_id).first()
    if not series:
        raise HTTPException(404, "ARM Series not found")
    if series.owner_user_id != user.id:
        raise HTTPException(403, "Not the owner")

    existing = db.query(ARMVersion).filter(
        ARMVersion.series_id == series_id, ARMVersion.version == data.version
    ).first()
    if existing:
        raise HTTPException(409, f"Version '{data.version}' already exists in this series")

    storage_prefix = (
        f"papers/{series.paper_id}/bohrium/{series.bohrium_paper_id}"
        f"/users/{user.bohrium_id}/arm_versions"
    )

    version = ARMVersion(
        series_id=series_id,
        paper_id=series.paper_id,
        bohrium_paper_id=series.bohrium_paper_id,
        owner_user_id=user.id,
        version=data.version,
        status="draft",
        entry_command=data.entry_command,
        runtime_env=data.runtime_env,
    )
    db.add(version)
    db.flush()

    version.storage_prefix = f"{storage_prefix}/{version.id}"
    db.commit()
    db.refresh(version)
    return _version_to_out(version)


@router_versions.get("/{arm_version_id}", response_model=ARMVersionOut)
def get_arm_version(arm_version_id: int, db: Session = Depends(get_db)):
    v = db.query(ARMVersion).filter(ARMVersion.id == arm_version_id).first()
    if not v:
        raise HTTPException(404, "ARM Version not found")
    return _version_to_out(v)


@router_versions.delete("/{arm_version_id}")
def delete_arm_version(
    arm_version_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    v = db.query(ARMVersion).filter(ARMVersion.id == arm_version_id).first()
    if not v:
        raise HTTPException(404, "ARM Version not found")
    if v.owner_user_id != user.id:
        raise HTTPException(403, "Not the owner")
    db.delete(v)
    db.commit()
    return {"detail": "Deleted"}


# ─── Upload Credential (STS Token) ─────────────────────────

@router_versions.post("/{arm_version_id}/upload-credential")
@limiter.limit("30/minute")
def get_upload_credential(
    request: Request,
    arm_version_id: int,
    data: UploadCredentialIn,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    v = db.query(ARMVersion).filter(ARMVersion.id == arm_version_id).first()
    if not v:
        raise HTTPException(404, "ARM Version not found")
    if v.owner_user_id != user.id:
        raise HTTPException(403, "Not the owner")

    # Build object key based on module
    module_paths = {
        "arm": f"{v.storage_prefix}/arm/{data.filename}",
        "code": f"{v.storage_prefix}/code/{data.filename}",
        "report": f"{v.storage_prefix}/report/{data.filename}",
        "trace": f"{v.storage_prefix}/trace/{data.filename}",
        "runtime": f"{v.storage_prefix}/runtime/{data.filename}",
        "dataset": f"datasets/pending/users/{user.bohrium_id}/{data.filename}",
    }
    object_key = module_paths.get(data.module)
    if not object_key:
        raise HTTPException(400, f"Invalid module: {data.module}")

    # Path prefix for STS policy scoping
    path_prefix = object_key.rsplit("/", 1)[0]

    # Update status to uploading
    if v.status == "draft":
        v.status = "uploading"
        db.commit()

    # Get STS temporary credentials
    try:
        sts = oss_service.get_sts_token(path_prefix, duration_seconds=3600)
    except Exception as e:
        logger.error("STS token generation failed: %s", e)
        raise HTTPException(500, f"Failed to generate upload credentials: {e}")

    # Extract region/endpoint for frontend
    endpoint = OSS_ENDPOINT.replace("https://", "").replace("http://", "")
    region = endpoint.split(".")[0].replace("oss-", "")

    return {
        "bucket": OSS_BUCKET,
        "region": region,
        "endpoint": OSS_ENDPOINT,
        "object_key": object_key,
        "access_key_id": sts["access_key_id"],
        "access_key_secret": sts["access_key_secret"],
        "security_token": sts["security_token"],
        "expiration": sts["expiration"],
    }


# ─── Complete ──────────────────────────────────────────────

@router_versions.post("/{arm_version_id}/complete")
@limiter.limit("10/minute")
def complete_arm_version(
    request: Request,
    arm_version_id: int,
    data: ModuleCompleteIn,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    v = db.query(ARMVersion).filter(ARMVersion.id == arm_version_id).first()
    if not v:
        raise HTTPException(404, "ARM Version not found")
    if v.owner_user_id != user.id:
        raise HTTPException(403, "Not the owner")
    if v.status not in ("draft", "uploading"):
        raise HTTPException(400, f"Cannot complete: current status is '{v.status}'")

    # Verify arm.zip exists in OSS
    if not oss_service.object_exists(data.arm_zip_key):
        raise HTTPException(400, f"arm.zip not found in OSS at key: {data.arm_zip_key}")

    # Store original zip key and update status
    v.arm_zip_key = data.arm_zip_key
    v.status = "processing"
    db.commit()

    # Extract arm.zip → validate structure, extract all modules
    try:
        result = oss_service.extract_arm_zip(data.arm_zip_key, v.storage_prefix)
        v.code_zip_key = result["code_zip_key"]
        v.code_manifest_key = result["code_manifest_key"]
        v.report_md_key = result["report_md_key"]
        v.trace_zip_key = result["trace_zip_key"]
        v.status = "ready"
        logger.info(
            "ARM version %s: extracted %d code files, manifest generated",
            v.id, result["manifest"]["total_files"],
        )
    except ValueError as e:
        v.status = "failed"
        v.error_message = str(e)
        logger.error("ARM version %s extraction failed: %s", v.id, e)
    except Exception as e:
        v.status = "failed"
        v.error_message = f"Extraction error: {e}"
        logger.error("ARM version %s extraction error: %s", v.id, e)

    db.commit()
    db.refresh(v)

    return {"status": v.status, "arm_version_id": v.id, "error": v.error_message}
