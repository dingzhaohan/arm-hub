"""Paper routes: search, ensure, CRUD, aggregated associations."""
import hashlib
import json
import logging
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional

import pytz
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from database import get_db, Paper, ARMSeries, ARMVersion, Dataset, Skill, User
from database import arm_version_datasets, arm_version_skills
from schemas import (
    PaperEnsureIn, PaperOut, BohriumSearchIn,
    ARMSeriesOut, DatasetBrief, SkillBrief,
)
from app_config import limiter
from auth import get_current_user, require_login
from config.config import BOHRIUM_BASE_URL, BOHRIUM_RAG_ACCESS_KEY, BOHRIUM_RAG_ACCESS_SECRET

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/papers", tags=["papers"])


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _paper_to_out(p: Paper, db: Session) -> PaperOut:
    out = PaperOut.model_validate(p)
    out.arm_series_count = db.query(func.count(ARMSeries.id)).filter(ARMSeries.paper_id == p.id).scalar()
    return out


# ─── Bohrium RAG Paper Search ─────────────────────────────

def _get_digest():
    """SHA-512 digest: accessKey + accessSecret[:10] + currentMinutes (Shanghai TZ)."""
    shanghai_tz = pytz.timezone("Asia/Shanghai")
    current_minutes = datetime.now(shanghai_tz).strftime("%Y%m%d%H%M")
    data = BOHRIUM_RAG_ACCESS_KEY + BOHRIUM_RAG_ACCESS_SECRET[:10] + current_minutes
    return hashlib.sha512(data.encode()).hexdigest()


@router.post("/search/bohrium")
@limiter.limit("10/minute")
def search_bohrium_papers(
    request: Request,
    data: BohriumSearchIn,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    if not BOHRIUM_RAG_ACCESS_KEY or not BOHRIUM_RAG_ACCESS_SECRET:
        raise HTTPException(500, "Bohrium RAG credentials not configured")

    words = [w.strip() for w in data.query.split() if w.strip()]
    payload = json.dumps({
        "accessKey": BOHRIUM_RAG_ACCESS_KEY,
        "digester": _get_digest(),
        "userId": str(user.bohrium_id or user.id),
        "type": 3,
        "words": words,
        "areaIds": [],
        "question": data.query,
        "startTime": "",
        "endTime": "",
        "pageSize": data.page_size,
    }).encode()

    url = f"{BOHRIUM_BASE_URL}/rag/pass/keyword"
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode()[:500]
        except Exception:
            pass
        logger.error("Bohrium RAG search returned %s: %s", e.code, detail)
        raise HTTPException(502, "Bohrium paper search failed")
    except Exception as e:
        logger.error("Bohrium RAG search error: %s", e)
        raise HTTPException(502, "Failed to reach Bohrium paper search")

    raw_items = body.get("data") or []

    # Map RAG response fields to our format
    results = []
    for item in raw_items:
        paper_id = item.get("paperId") or item.get("id") or item.get("doi") or ""
        results.append({
            "paperId": paper_id,
            "title": item.get("enName") or item.get("zhName") or "",
            "titleZh": item.get("zhName") or "",
            "authors": item.get("authors") or "",
            "doi": item.get("doi") or "",
            "abstract": item.get("enAbstract") or item.get("zhAbstract") or "",
            "abstractZh": item.get("zhAbstract") or "",
            "impactFactor": item.get("impactFactor"),
            "publication": item.get("publicationEnName") or item.get("publicationZhName") or "",
            "coverDateStart": item.get("coverDateStart") or "",
            "citationNums": item.get("citationNums") or 0,
            "paperUrl": item.get("paperUrl") or "",
        })

    return {"items": results, "total": len(results)}


# ─── Ensure (upsert) ───────────────────────────────────────

@router.post("/ensure", response_model=PaperOut)
@limiter.limit("30/minute")
def ensure_paper(
    request: Request,
    data: PaperEnsureIn,
    user=Depends(require_login),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.bohrium_paper_id == data.bohrium_paper_id).first()
    if paper:
        for key, value in data.model_dump(exclude_unset=True, exclude={"bohrium_paper_id"}).items():
            if value is not None:
                setattr(paper, key, value)
        db.commit()
        db.refresh(paper)
    else:
        paper = Paper(**data.model_dump())
        db.add(paper)
        db.commit()
        db.refresh(paper)
    return _paper_to_out(paper, db)


# ─── List / Detail (anonymous) ─────────────────────────────

@router.get("")
def list_papers(
    search: Optional[str] = None,
    year: Optional[int] = None,
    sort: str = "newest",
    limit: int = Query(default=20, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Paper)
    if search:
        safe = _escape_like(search)
        q = q.filter(or_(
            Paper.title.ilike(f"%{safe}%", escape='\\'),
            Paper.authors.ilike(f"%{safe}%", escape='\\'),
        ))
    if year:
        q = q.filter(Paper.year == year)
    total = q.count()
    order = {
        "newest": Paper.created_at.desc(),
        "year": Paper.year.desc(),
        "title": Paper.title.asc(),
        "citation": Paper.citation_nums.desc(),
    }.get(sort, Paper.created_at.desc())
    papers = q.order_by(order).offset(offset).limit(limit).all()
    items = [_paper_to_out(p, db) for p in papers]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/{paper_id}", response_model=PaperOut)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    p = db.query(Paper).filter(Paper.id == paper_id).first()
    if not p:
        raise HTTPException(404, "Paper not found")
    return _paper_to_out(p, db)


# ─── Paper aggregated associations ─────────────────────────

@router.get("/{paper_id}/arm-series")
def get_paper_arm_series(paper_id: int, db: Session = Depends(get_db)):
    p = db.query(Paper).filter(Paper.id == paper_id).first()
    if not p:
        raise HTTPException(404, "Paper not found")
    series_list = db.query(ARMSeries).filter(ARMSeries.paper_id == paper_id).all()
    result = []
    for s in series_list:
        out = ARMSeriesOut.model_validate(s)
        out.owner_name = s.owner.display_name or s.owner.username if s.owner else None
        out.version_count = len(s.versions)
        if s.versions:
            latest = sorted(s.versions, key=lambda v: v.created_at, reverse=True)[0]
            out.latest_version = latest.version
            out.latest_status = latest.status
            out.latest_score = latest.score_total
        result.append(out)
    return result


@router.get("/{paper_id}/datasets")
def get_paper_datasets(paper_id: int, db: Session = Depends(get_db)):
    """Paper → ARM Versions → Datasets (distinct)."""
    datasets = (
        db.query(Dataset)
        .join(arm_version_datasets, Dataset.id == arm_version_datasets.c.dataset_id)
        .join(ARMVersion, ARMVersion.id == arm_version_datasets.c.arm_version_id)
        .filter(ARMVersion.paper_id == paper_id)
        .distinct()
        .all()
    )
    return [DatasetBrief.model_validate(d) for d in datasets]


@router.get("/{paper_id}/skills")
def get_paper_skills(paper_id: int, db: Session = Depends(get_db)):
    """Paper → ARM Versions → Skills (distinct)."""
    skills = (
        db.query(Skill)
        .join(arm_version_skills, Skill.id == arm_version_skills.c.skill_id)
        .join(ARMVersion, ARMVersion.id == arm_version_skills.c.arm_version_id)
        .filter(ARMVersion.paper_id == paper_id)
        .distinct()
        .all()
    )
    return [SkillBrief.model_validate(s) for s in skills]
