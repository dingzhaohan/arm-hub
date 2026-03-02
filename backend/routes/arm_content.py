"""ARM content retrieval routes (login required for all).

Reads from OSS: manifest.json for directory tree, extracted/ for file content.
"""
import mimetypes
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from database import get_db, ARMVersion
from schemas import ContentEntry, ContentListOut, ContentFileOut
from auth import require_login
import oss_service

router = APIRouter(prefix="/api/arm-versions", tags=["arm-content"])

VALID_TABS = ["code", "report", "trace", "runtime"]

MAX_TEXT_SIZE = 1 * 1024 * 1024  # 1MB


@router.get("/{arm_version_id}/content/{tab}")
def get_arm_content(
    arm_version_id: int,
    tab: str,
    path: str = Query(""),
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    if tab not in VALID_TABS:
        raise HTTPException(400, f"Invalid tab. Must be one of: {', '.join(VALID_TABS)}")

    v = db.query(ARMVersion).filter(ARMVersion.id == arm_version_id).first()
    if not v:
        raise HTTPException(404, "ARM Version not found")
    if v.status != "ready":
        raise HTTPException(400, "ARM Version is not ready for browsing")

    # For code tab, use manifest for directory listing
    if tab == "code" and v.code_manifest_key:
        return _browse_code(v, path)

    # For report tab, return the markdown content directly
    if tab == "report" and v.report_md_key:
        if not path:
            content = oss_service.get_text_content(v.report_md_key)
            if content is None:
                raise HTTPException(404, "Report not found or too large")
            return ContentFileOut(
                tab="report",
                arm_version_id=arm_version_id,
                path="report.md",
                content=content,
                size=len(content.encode()),
                mime_type="text/markdown",
            )

    # For trace tab, just show the zip info
    if tab == "trace" and v.trace_zip_key:
        if not path:
            try:
                head = oss_service.head_object(v.trace_zip_key)
                return ContentListOut(
                    tab="trace",
                    arm_version_id=arm_version_id,
                    path="",
                    entries=[ContentEntry(
                        name="trace.zip",
                        type="file",
                        size=head["size"],
                        is_text=False,
                    )],
                )
            except Exception:
                raise HTTPException(404, "Trace file not found")

    # For runtime tab
    if tab == "runtime" and v.runtime_key:
        if not path:
            content = oss_service.get_text_content(v.runtime_key)
            if content is None:
                raise HTTPException(404, "Runtime config not found")
            return ContentFileOut(
                tab="runtime",
                arm_version_id=arm_version_id,
                path="runtime.json",
                content=content,
                size=len(content.encode()),
                mime_type="application/json",
            )

    return ContentListOut(tab=tab, arm_version_id=arm_version_id, path=path, entries=[])


def _browse_code(v: ARMVersion, path: str):
    """Browse code using manifest.json + extracted/ files from OSS."""
    manifest = oss_service.get_manifest(v.code_manifest_key)
    if not manifest:
        raise HTTPException(404, "Manifest not found")

    files = manifest.get("files", [])

    # If path points to a file, return its content
    if path:
        # Check if it matches a file in manifest
        matched = [f for f in files if f["path"] == path]
        if matched:
            f = matched[0]
            if f.get("is_text"):
                extracted_key = f"{v.storage_prefix}/code/extracted/{path}"
                content = oss_service.get_text_content(extracted_key, MAX_TEXT_SIZE)
                if content is None:
                    # File too large
                    download_url = oss_service.sign_download_url(extracted_key)
                    return ContentFileOut(
                        tab="code",
                        arm_version_id=v.id,
                        path=path,
                        content="",
                        size=f["size"],
                        mime_type=mimetypes.guess_type(path)[0] or "text/plain",
                        truncated=True,
                        download_url=download_url,
                    )
                return ContentFileOut(
                    tab="code",
                    arm_version_id=v.id,
                    path=path,
                    content=content,
                    size=f["size"],
                    mime_type=mimetypes.guess_type(path)[0] or "text/plain",
                )
            else:
                # Binary file — return download url
                extracted_key = f"{v.storage_prefix}/code/extracted/{path}"
                download_url = oss_service.sign_download_url(extracted_key)
                return ContentFileOut(
                    tab="code",
                    arm_version_id=v.id,
                    path=path,
                    content="[Binary file]",
                    size=f["size"],
                    mime_type=mimetypes.guess_type(path)[0] or "application/octet-stream",
                    truncated=True,
                    download_url=download_url,
                )

    # Directory listing: build from manifest
    # Normalize path
    prefix = path.rstrip("/") + "/" if path else ""

    entries_map = {}
    for f in files:
        fp = f["path"]
        if not fp.startswith(prefix):
            continue
        remainder = fp[len(prefix):]
        if "/" in remainder:
            # This is a subdirectory
            dir_name = remainder.split("/")[0]
            if dir_name not in entries_map:
                entries_map[dir_name] = ContentEntry(name=dir_name, type="directory", size=0, is_text=False)
        else:
            # This is a file at current level
            entries_map[remainder] = ContentEntry(
                name=remainder,
                type="file",
                size=f.get("size", 0),
                is_text=f.get("is_text", True),
                lang=f.get("lang"),
            )

    # Sort: directories first, then files
    entries = sorted(entries_map.values(), key=lambda e: (0 if e.type == "directory" else 1, e.name))

    return ContentListOut(
        tab="code",
        arm_version_id=v.id,
        path=path,
        entries=entries,
    )


@router.get("/{arm_version_id}/content/{tab}/download")
def download_arm_content(
    arm_version_id: int,
    tab: str,
    path: str = Query(...),
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    if tab not in VALID_TABS:
        raise HTTPException(400, f"Invalid tab. Must be one of: {', '.join(VALID_TABS)}")

    v = db.query(ARMVersion).filter(ARMVersion.id == arm_version_id).first()
    if not v:
        raise HTTPException(404, "ARM Version not found")

    # Determine the OSS key
    if tab == "code":
        if path == "code.zip" and v.code_zip_key:
            oss_key = v.code_zip_key
        else:
            oss_key = f"{v.storage_prefix}/code/extracted/{path}"
    elif tab == "report" and v.report_md_key:
        oss_key = v.report_md_key
    elif tab == "trace" and v.trace_zip_key:
        oss_key = v.trace_zip_key
    elif tab == "runtime" and v.runtime_key:
        oss_key = v.runtime_key
    else:
        raise HTTPException(404, "File not found")

    if not oss_service.object_exists(oss_key):
        raise HTTPException(404, "File not found in storage")

    # Increment download count
    v.downloads = (v.downloads or 0) + 1
    db.commit()

    download_url = oss_service.sign_download_url(oss_key)
    return {"download_url": download_url}
