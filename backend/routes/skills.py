"""Skill routes: CRUD, upload, download, reverse associations."""
import io
import mimetypes
import zipfile
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
from config.config import OSS_BUCKET, OSS_ENDPOINT
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

    zip_key = f"skills/{skill_id}/users/{user.bohrium_id}/skill.zip"
    md_key = f"skills/{skill_id}/users/{user.bohrium_id}/skill.md"
    path_prefix = f"skills/{skill_id}/users/{user.bohrium_id}"

    try:
        sts = oss_service.get_sts_token(path_prefix, duration_seconds=3600)
    except Exception as e:
        raise HTTPException(500, f"Failed to generate upload credentials: {e}")

    endpoint = OSS_ENDPOINT.replace("https://", "").replace("http://", "")
    region = endpoint.split(".")[0].replace("oss-", "")

    return {
        "bucket": OSS_BUCKET,
        "region": region,
        "endpoint": OSS_ENDPOINT,
        "zip_object_key": zip_key,
        "md_object_key": md_key,
        "access_key_id": sts["access_key_id"],
        "access_key_secret": sts["access_key_secret"],
        "security_token": sts["security_token"],
        "expiration": sts["expiration"],
    }


@router.post("/{skill_id}/complete")
@limiter.limit("20/minute")
def complete_skill(
    request: Request,
    skill_id: int,
    oss_zip_key: Optional[str] = Query(None),
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


@router.get("/{skill_id}/readme")
def get_skill_readme(
    skill_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(404, "Skill not found")
    if not skill.oss_md_key:
        return {"content": ""}
    try:
        data = oss_service.get_object(skill.oss_md_key)
        return {"content": data.decode("utf-8", errors="replace")}
    except Exception:
        return {"content": ""}


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


@router.get("/{skill_id}/download-readme")
def download_skill_readme(
    skill_id: int,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(404, "Skill not found")
    if not skill.oss_md_key:
        raise HTTPException(400, "Markdown file not uploaded yet")

    download_url = oss_service.sign_download_url(skill.oss_md_key)
    return {"download_url": download_url}


@router.get("/{skill_id}/files")
def browse_skill_files(
    skill_id: int,
    path: str = Query(""),
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    """Browse uploaded zip: list directory or return file content."""
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(404, "Skill not found")
    if not skill.oss_zip_key:
        return {"entries": [], "path": path}

    try:
        zip_bytes = oss_service.get_object(skill.oss_zip_key)
    except Exception:
        raise HTTPException(404, "Skill zip not found in storage")

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(400, "Uploaded file is not a valid zip")

    # Normalize: strip leading ./ and trailing /
    all_names = [n.lstrip("./") for n in zf.namelist()]

    # If path points to a file, return its content
    if path:
        # Find matching entry in zip
        matched = None
        for info in zf.infolist():
            normalized = info.filename.lstrip("./")
            if normalized == path and not info.is_dir():
                matched = info
                break

        if matched:
            raw = zf.read(matched)
            mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
            is_text = mime.startswith("text/") or mime in (
                "application/json", "application/xml", "application/javascript",
                "application/x-yaml", "application/toml",
            ) or path.endswith((".py", ".js", ".ts", ".jsx", ".tsx", ".sh",
                                ".yml", ".yaml", ".toml", ".cfg", ".ini",
                                ".rs", ".go", ".c", ".cpp", ".h", ".java",
                                ".rb", ".php", ".swift", ".kt", ".r", ".R",
                                ".sql", ".css", ".scss", ".less", ".html",
                                ".vue", ".svelte", ".lua", ".pl", ".ex",
                                ".exs", ".zig", ".nim", ".dart", ".tf",
                                ".Makefile", ".Dockerfile", ".gitignore"))

            if is_text and len(raw) <= 1024 * 1024:
                content = raw.decode("utf-8", errors="replace")
            elif is_text:
                content = ""  # too large
            else:
                content = "[Binary file]"

            # For binary files (e.g. PDF, images), provide a signed download URL
            download_url = None
            if not is_text or len(raw) > 1024 * 1024:
                extracted_key = f"skills/{skill_id}/extracted/{path}"
                try:
                    # Upload extracted file to OSS for signed URL access
                    oss_service.put_object(extracted_key, raw)
                    download_url = oss_service.sign_download_url(extracted_key)
                except Exception:
                    pass

            return {
                "type": "file",
                "path": path,
                "content": content,
                "size": matched.file_size,
                "mime_type": mime,
                "truncated": is_text and len(raw) > 1024 * 1024,
                "download_url": download_url,
            }

    # Directory listing
    prefix = path.rstrip("/") + "/" if path else ""
    entries_map = {}

    for name in all_names:
        if not name or name == prefix.rstrip("/"):
            continue
        if not name.startswith(prefix):
            continue
        remainder = name[len(prefix):]
        if not remainder or remainder == "/":
            continue

        if "/" in remainder.rstrip("/"):
            dir_name = remainder.split("/")[0]
            if dir_name and dir_name not in entries_map:
                entries_map[dir_name] = {"name": dir_name, "type": "directory", "size": 0}
        elif not remainder.endswith("/"):
            info = None
            for zi in zf.infolist():
                if zi.filename.lstrip("./") == name:
                    info = zi
                    break
            entries_map[remainder] = {
                "name": remainder,
                "type": "file",
                "size": info.file_size if info else 0,
            }

    entries = sorted(entries_map.values(), key=lambda e: (0 if e["type"] == "directory" else 1, e["name"]))
    return {"entries": entries, "path": path}


@router.get("/{skill_id}/arm-versions")
def get_skill_arm_versions(skill_id: int, db: Session = Depends(get_db)):
    versions = (
        db.query(ARMVersion)
        .join(arm_version_skills, ARMVersion.id == arm_version_skills.c.arm_version_id)
        .filter(arm_version_skills.c.skill_id == skill_id)
        .all()
    )
    return [{"id": v.id, "version": v.version, "status": v.status, "series_id": v.series_id} for v in versions]
