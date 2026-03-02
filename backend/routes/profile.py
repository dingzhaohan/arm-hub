"""Follow + Profile + Stats routes."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import (
    get_db, Paper, ARMSeries, ARMVersion, Dataset, Skill, User,
    UserFollowPaper, UserFollowDataset, UserFollowSkill,
)
from schemas import (
    FollowToggleOut, ProfileOut, StatsOut,
    UserOut, PaperOut, ARMSeriesOut, DatasetBrief, SkillBrief,
)
from app_config import limiter
from auth import require_login

router = APIRouter(tags=["profile"])


# ─── Follow Toggle ──────────────────────────────────────────

@router.post("/api/me/follows/papers/{paper_id}", response_model=FollowToggleOut)
def toggle_follow_paper(paper_id: int, user=Depends(require_login), db: Session = Depends(get_db)):
    if not db.query(Paper).filter(Paper.id == paper_id).first():
        raise HTTPException(404, "Paper not found")
    existing = db.query(UserFollowPaper).filter(
        UserFollowPaper.user_id == user.id, UserFollowPaper.paper_id == paper_id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return FollowToggleOut(followed=False)
    db.add(UserFollowPaper(user_id=user.id, paper_id=paper_id))
    db.commit()
    return FollowToggleOut(followed=True)


@router.post("/api/me/follows/datasets/{dataset_id}", response_model=FollowToggleOut)
def toggle_follow_dataset(dataset_id: int, user=Depends(require_login), db: Session = Depends(get_db)):
    if not db.query(Dataset).filter(Dataset.id == dataset_id).first():
        raise HTTPException(404, "Dataset not found")
    existing = db.query(UserFollowDataset).filter(
        UserFollowDataset.user_id == user.id, UserFollowDataset.dataset_id == dataset_id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return FollowToggleOut(followed=False)
    db.add(UserFollowDataset(user_id=user.id, dataset_id=dataset_id))
    db.commit()
    return FollowToggleOut(followed=True)


@router.post("/api/me/follows/skills/{skill_id}", response_model=FollowToggleOut)
def toggle_follow_skill(skill_id: int, user=Depends(require_login), db: Session = Depends(get_db)):
    if not db.query(Skill).filter(Skill.id == skill_id).first():
        raise HTTPException(404, "Skill not found")
    existing = db.query(UserFollowSkill).filter(
        UserFollowSkill.user_id == user.id, UserFollowSkill.skill_id == skill_id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return FollowToggleOut(followed=False)
    db.add(UserFollowSkill(user_id=user.id, skill_id=skill_id))
    db.commit()
    return FollowToggleOut(followed=True)


# ─── Profile ───────────────────────────────────────────────

@router.get("/api/me/profile", response_model=ProfileOut)
def get_profile(user=Depends(require_login), db: Session = Depends(get_db)):
    # Followed papers
    followed_paper_ids = [
        r.paper_id for r in
        db.query(UserFollowPaper).filter(UserFollowPaper.user_id == user.id).all()
    ]
    followed_papers = db.query(Paper).filter(Paper.id.in_(followed_paper_ids)).all() if followed_paper_ids else []

    # Followed datasets
    followed_dataset_ids = [
        r.dataset_id for r in
        db.query(UserFollowDataset).filter(UserFollowDataset.user_id == user.id).all()
    ]
    followed_datasets = db.query(Dataset).filter(Dataset.id.in_(followed_dataset_ids)).all() if followed_dataset_ids else []

    # Followed skills
    followed_skill_ids = [
        r.skill_id for r in
        db.query(UserFollowSkill).filter(UserFollowSkill.user_id == user.id).all()
    ]
    followed_skills = db.query(Skill).filter(Skill.id.in_(followed_skill_ids)).all() if followed_skill_ids else []

    # My ARM series
    my_series = db.query(ARMSeries).filter(ARMSeries.owner_user_id == user.id).all()

    # My datasets
    my_datasets = db.query(Dataset).filter(Dataset.uploader_user_id == user.id).all()

    # My skills
    my_skills = db.query(Skill).filter(Skill.uploader_user_id == user.id).all()

    return ProfileOut(
        user=UserOut.model_validate(user),
        followed_papers=[PaperOut.model_validate(p) for p in followed_papers],
        followed_datasets=[DatasetBrief.model_validate(d) for d in followed_datasets],
        followed_skills=[SkillBrief.model_validate(s) for s in followed_skills],
        my_arm_series=[ARMSeriesOut.model_validate(s) for s in my_series],
        my_datasets=[DatasetBrief.model_validate(d) for d in my_datasets],
        my_skills=[SkillBrief.model_validate(s) for s in my_skills],
    )


# ─── Stats (home page) ────────────────────────────────────

@router.get("/api/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    return StatsOut(
        total_papers=db.query(func.count(Paper.id)).scalar(),
        total_arms=db.query(func.count(ARMVersion.id)).scalar(),
        total_datasets=db.query(func.count(Dataset.id)).scalar(),
        total_skills=db.query(func.count(Skill.id)).scalar(),
    )
