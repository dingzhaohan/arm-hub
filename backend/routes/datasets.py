"""Dataset routes: CRUD, upload, download, reverse associations."""
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import (
    get_db, Dataset, ARMVersion, Paper, User,
    arm_version_datasets,
)
from schemas import DatasetCreateIn, DatasetOut, DatasetBrief, ARMVersionOut, PaperOut
from app_config import limiter
from auth import get_current_user, require_login
from config.config import OSS_BUCKET
import oss_service

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


def _dataset_to_out(d: Dataset) -> DatasetOut:
    out = DatasetOut.model_validate(d)
    out.uploader_name = d.uploader.display_name or d.uploader.username if d.uploader else None
    return out


@router.post("", response_model=DatasetOut)
@limiter.limit("20/minute")
def create_dataset(
    request: Request,
    data: DatasetCreateIn,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    ds = Dataset(
        name=data.name,
        description=data.description,
        uploader_user_id=user.id,
        oss_bucket=OSS_BUCKET,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return _dataset_to_out(ds)


@router.post("/{dataset_id}/upload-credential")
@limiter.limit("30/minute")
def dataset_upload_credential(
    request: Request,
    dataset_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    if ds.uploader_user_id != user.id:
        raise HTTPException(403, "Not the owner")

    object_key = f"datasets/{dataset_id}/users/{user.bohrium_id}/dataset.zip"
    upload_url = oss_service.sign_upload_url(object_key, expires=3600)

    return {
        "bucket": OSS_BUCKET,
        "object_key": object_key,
        "upload_url": upload_url,
        "expire_at": "",
    }


@router.post("/{dataset_id}/complete")
@limiter.limit("20/minute")
def complete_dataset(
    request: Request,
    dataset_id: int,
    oss_key: str = Query(...),
    size_bytes: int = Query(0),
    checksum: Optional[str] = Query(None),
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    if ds.uploader_user_id != user.id:
        raise HTTPException(403, "Not the owner")

    ds.oss_key = oss_key
    ds.size_bytes = size_bytes
    ds.checksum = checksum
    db.commit()
    db.refresh(ds)
    return _dataset_to_out(ds)


@router.get("")
def list_datasets(
    search: Optional[str] = None,
    limit: int = Query(default=20, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Dataset)
    if search:
        safe = search.replace("%", "\\%").replace("_", "\\_")
        q = q.filter(or_(
            Dataset.name.ilike(f"%{safe}%", escape='\\'),
            Dataset.description.ilike(f"%{safe}%", escape='\\'),
        ))
    total = q.count()
    items = q.order_by(Dataset.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": [_dataset_to_out(d) for d in items],
        "total": total, "limit": limit, "offset": offset,
    }


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return _dataset_to_out(ds)


@router.get("/{dataset_id}/download")
def download_dataset(
    dataset_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")

    ds.downloads = (ds.downloads or 0) + 1
    db.commit()

    if not ds.oss_key:
        raise HTTPException(400, "Dataset file not uploaded yet")

    download_url = oss_service.sign_download_url(ds.oss_key)
    return {"download_url": download_url}


@router.get("/{dataset_id}/arm-versions")
def get_dataset_arm_versions(dataset_id: int, db: Session = Depends(get_db)):
    versions = (
        db.query(ARMVersion)
        .join(arm_version_datasets, ARMVersion.id == arm_version_datasets.c.arm_version_id)
        .filter(arm_version_datasets.c.dataset_id == dataset_id)
        .all()
    )
    return [{"id": v.id, "version": v.version, "status": v.status, "series_id": v.series_id} for v in versions]


@router.get("/{dataset_id}/papers")
def get_dataset_papers(dataset_id: int, db: Session = Depends(get_db)):
    """Dataset → arm_version_datasets → ARM Versions → Paper (distinct)."""
    papers = (
        db.query(Paper)
        .join(ARMVersion, ARMVersion.paper_id == Paper.id)
        .join(arm_version_datasets, ARMVersion.id == arm_version_datasets.c.arm_version_id)
        .filter(arm_version_datasets.c.dataset_id == dataset_id)
        .distinct()
        .all()
    )
    return [{"id": p.id, "title": p.title, "bohrium_paper_id": p.bohrium_paper_id} for p in papers]
