"""Skill routes: CRUD, upload, download, reverse associations."""
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import (
    get_db, Skill, ARMVersion, arm_version_skills,
)
from schemas import SkillCreateIn, SkillOut, SkillBrief
from app_config import limiter
from auth import get_current_user, require_login
from config.config import OSS_BUCKET
import oss_service

router = APIRouter(prefix="/api/skills", tags=["skills"])


def _skill_to_out(s: Skill) -> SkillOut:
    out = SkillOut.model_validate(s)
    out.uploader_name = s.uploader.display_name or s.uploader.username if s.uploader else None
    return out


@router.post("", response_model=SkillOut)
@limiter.limit("20/minute")
def create_skill(
    request: Request,
    data: SkillCreateIn,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    skill = Skill(
        name=data.name,
        description=data.description,
        tags=data.tags,
        version=data.version,
        uploader_user_id=user.id,
        oss_bucket=OSS_BUCKET,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return _skill_to_out(skill)


@router.post("/{skill_id}/upload-credential")
@limiter.limit("30/minute")
def skill_upload_credential(
    request: Request,
    skill_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(404, "Skill not found")
    if skill.uploader_user_id != user.id:
        raise HTTPException(403, "Not the owner")

    # Generate signed PUT URLs for zip and md
    zip_key = f"skills/{skill_id}/users/{user.bohrium_id}/skill.zip"
    md_key = f"skills/{skill_id}/users/{user.bohrium_id}/skill.md"
    return {
        "bucket": OSS_BUCKET,
        "zip_object_key": zip_key,
        "md_object_key": md_key,
        "zip_upload_url": oss_service.sign_upload_url(zip_key, expires=3600),
        "md_upload_url": oss_service.sign_upload_url(md_key, expires=3600),
        "expire_at": "",
    }


@router.post("/{skill_id}/complete")
@limiter.limit("20/minute")
def complete_skill(
    request: Request,
    skill_id: int,
    oss_zip_key: str = Query(...),
    oss_md_key: Optional[str] = Query(None),
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(404, "Skill not found")
    if skill.uploader_user_id != user.id:
        raise HTTPException(403, "Not the owner")

    skill.oss_zip_key = oss_zip_key
    skill.oss_md_key = oss_md_key
    db.commit()
    db.refresh(skill)
    return _skill_to_out(skill)


@router.get("")
def list_skills(
    search: Optional[str] = None,
    limit: int = Query(default=20, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Skill)
    if search:
        safe = search.replace("%", "\\%").replace("_", "\\_")
        q = q.filter(or_(
            Skill.name.ilike(f"%{safe}%", escape='\\'),
            Skill.description.ilike(f"%{safe}%", escape='\\'),
        ))
    total = q.count()
    items = q.order_by(Skill.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": [_skill_to_out(s) for s in items],
        "total": total, "limit": limit, "offset": offset,
    }


@router.get("/{skill_id}", response_model=SkillOut)
def get_skill(skill_id: int, db: Session = Depends(get_db)):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(404, "Skill not found")
    return _skill_to_out(skill)


@router.get("/{skill_id}/download")
def download_skill(
    skill_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(404, "Skill not found")

    skill.downloads = (skill.downloads or 0) + 1
    db.commit()

    if not skill.oss_zip_key:
        raise HTTPException(400, "Skill file not uploaded yet")

    download_url = oss_service.sign_download_url(skill.oss_zip_key)
    return {"download_url": download_url}


@router.get("/{skill_id}/arm-versions")
def get_skill_arm_versions(skill_id: int, db: Session = Depends(get_db)):
    versions = (
        db.query(ARMVersion)
        .join(arm_version_skills, ARMVersion.id == arm_version_skills.c.arm_version_id)
        .filter(arm_version_skills.c.skill_id == skill_id)
        .all()
    )
    return [{"id": v.id, "version": v.version, "status": v.status, "series_id": v.series_id} for v in versions]
