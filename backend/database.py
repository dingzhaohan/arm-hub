import sqlalchemy
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, Float,
    ForeignKey, Table, Boolean, UniqueConstraint,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone

from config.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_size=10, pool_recycle=300, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utcnow():
    return datetime.now(timezone.utc)


# ─── Users (local mirror of Bohrium users) ──────────────────

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    display_name = Column(String(200))
    avatar_url = Column(String(500))
    bio = Column(Text)
    bohrium_id = Column(Integer, unique=True, nullable=True, index=True)
    bohrium_org_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow)


# ─── Papers ─────────────────────────────────────────────────

class Paper(Base):
    __tablename__ = "papers"
    id = Column(Integer, primary_key=True, index=True)
    bohrium_paper_id = Column(String(100), unique=True, nullable=False, index=True)
    doi = Column(String(200), nullable=True)
    title = Column(String(500), nullable=False)
    authors = Column(Text)
    abstract = Column(Text)
    citation_nums = Column(Integer, default=0)
    impact_factor = Column(Float, nullable=True)
    impact_score = Column(Float, nullable=True)
    publication = Column(String(300), nullable=True)
    year = Column(Integer, nullable=True)
    cover_date_start = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    arm_series = relationship("ARMSeries", back_populates="paper")


# ─── ARM Series ─────────────────────────────────────────────

class ARMSeries(Base):
    __tablename__ = "arm_series"
    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    bohrium_paper_id = Column(String(100), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    paper = relationship("Paper", back_populates="arm_series")
    owner = relationship("User", backref="arm_series")
    versions = relationship("ARMVersion", back_populates="series", cascade="all, delete-orphan")


# ─── ARM Versions ───────────────────────────────────────────

class ARMVersion(Base):
    __tablename__ = "arm_versions"
    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("arm_series.id"), nullable=False, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    bohrium_paper_id = Column(String(100), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    version = Column(String(50), nullable=False)
    status = Column(String(20), default="draft")  # draft/uploading/processing/ready/failed
    storage_prefix = Column(String(500), nullable=True)

    # Four modules
    code_zip_key = Column(String(500), nullable=True)
    code_manifest_key = Column(String(500), nullable=True)
    report_md_key = Column(String(500), nullable=True)
    trace_zip_key = Column(String(500), nullable=True)
    runtime_key = Column(String(500), nullable=True)

    # Display / sorting
    entry_command = Column(Text, nullable=True)
    runtime_env = Column(Text, nullable=True)
    score_total = Column(Float, nullable=True)
    downloads = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("series_id", "version", name="uq_series_version"),
    )

    series = relationship("ARMSeries", back_populates="versions")
    paper = relationship("Paper")
    owner = relationship("User")
    datasets = relationship("Dataset", secondary="arm_version_datasets", back_populates="arm_versions")
    skills = relationship("Skill", secondary="arm_version_skills", back_populates="arm_versions")


# ─── Datasets ───────────────────────────────────────────────

class Dataset(Base):
    __tablename__ = "datasets"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    oss_bucket = Column(String(100), nullable=True)
    oss_key = Column(String(500), nullable=True)
    size_bytes = Column(Integer, default=0)
    checksum = Column(String(128), nullable=True)
    uploader_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    is_private = Column(Boolean, default=True)
    downloads = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    uploader = relationship("User", backref="datasets")
    arm_versions = relationship("ARMVersion", secondary="arm_version_datasets", back_populates="datasets")


# ─── Skills ─────────────────────────────────────────────────

class Skill(Base):
    __tablename__ = "skills"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    tags = Column(Text, nullable=True)  # JSON array string
    version = Column(String(50), nullable=True)
    oss_bucket = Column(String(100), nullable=True)
    oss_zip_key = Column(String(500), nullable=True)
    oss_md_key = Column(String(500), nullable=True)
    uploader_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    is_private = Column(Boolean, default=True)
    downloads = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    uploader = relationship("User", backref="skills")
    arm_versions = relationship("ARMVersion", secondary="arm_version_skills", back_populates="skills")


# ─── Association Tables ─────────────────────────────────────

arm_version_datasets = Table(
    "arm_version_datasets", Base.metadata,
    Column("arm_version_id", Integer, ForeignKey("arm_versions.id"), primary_key=True),
    Column("dataset_id", Integer, ForeignKey("datasets.id"), primary_key=True),
    Column("created_at", DateTime, default=utcnow),
)

arm_version_skills = Table(
    "arm_version_skills", Base.metadata,
    Column("arm_version_id", Integer, ForeignKey("arm_versions.id"), primary_key=True),
    Column("skill_id", Integer, ForeignKey("skills.id"), primary_key=True),
    Column("created_at", DateTime, default=utcnow),
)


# ─── Follow Tables ──────────────────────────────────────────

class UserFollowPaper(Base):
    __tablename__ = "user_follow_papers"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), primary_key=True)
    created_at = Column(DateTime, default=utcnow)


class UserFollowDataset(Base):
    __tablename__ = "user_follow_datasets"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), primary_key=True)
    created_at = Column(DateTime, default=utcnow)


class UserFollowSkill(Base):
    __tablename__ = "user_follow_skills"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    skill_id = Column(Integer, ForeignKey("skills.id"), primary_key=True)
    created_at = Column(DateTime, default=utcnow)


# ─── Score Tables (reserved) ────────────────────────────────

class ARMScoreJob(Base):
    __tablename__ = "arm_score_jobs"
    id = Column(Integer, primary_key=True, index=True)
    arm_version_id = Column(Integer, ForeignKey("arm_versions.id"), nullable=False, index=True)
    status = Column(String(20), default="pending")  # pending/running/completed/failed
    triggered_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    arm_version = relationship("ARMVersion")


class ARMScoreResult(Base):
    __tablename__ = "arm_score_results"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("arm_score_jobs.id"), nullable=False, index=True)
    arm_version_id = Column(Integer, ForeignKey("arm_versions.id"), nullable=False, index=True)
    total_score = Column(Float, nullable=True)
    dimensions_json = Column(Text, nullable=True)
    report_md_key = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    job = relationship("ARMScoreJob")
    arm_version = relationship("ARMVersion")
