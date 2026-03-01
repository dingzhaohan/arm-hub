from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ─── User ───────────────────────────────────────────────────

class UserOut(BaseModel):
    id: int
    username: str
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True


# ─── Paper ──────────────────────────────────────────────────

class PaperEnsureIn(BaseModel):
    bohrium_paper_id: str = Field(..., min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=500)
    doi: Optional[str] = Field(None, max_length=200)
    authors: Optional[str] = None
    abstract: Optional[str] = None
    citation_nums: Optional[int] = 0
    impact_factor: Optional[float] = None
    impact_score: Optional[float] = None
    publication: Optional[str] = Field(None, max_length=300)
    year: Optional[int] = None
    cover_date_start: Optional[str] = Field(None, max_length=20)


class PaperOut(BaseModel):
    id: int
    bohrium_paper_id: str
    doi: Optional[str] = None
    title: str
    authors: Optional[str] = None
    abstract: Optional[str] = None
    citation_nums: int = 0
    impact_factor: Optional[float] = None
    impact_score: Optional[float] = None
    publication: Optional[str] = None
    year: Optional[int] = None
    cover_date_start: Optional[str] = None
    arm_series_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True


class BohriumSearchIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    page_size: int = Field(10, ge=1, le=50)


# ─── ARM Series ────────────────────────────────────────────

class ARMSeriesCreateIn(BaseModel):
    paper_id: int
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=10000)


class ARMSeriesOut(BaseModel):
    id: int
    paper_id: int
    bohrium_paper_id: str
    owner_user_id: int
    owner_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    version_count: int = 0
    latest_version: Optional[str] = None
    latest_status: Optional[str] = None
    latest_score: Optional[float] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# ─── ARM Version ───────────────────────────────────────────

class ARMVersionCreateIn(BaseModel):
    version: str = Field(..., min_length=1, max_length=50)
    entry_command: Optional[str] = Field(None, max_length=2000)
    runtime_env: Optional[str] = Field(None, max_length=5000)


class ARMVersionOut(BaseModel):
    id: int
    series_id: int
    paper_id: int
    bohrium_paper_id: str
    owner_user_id: int
    owner_name: Optional[str] = None
    version: str
    status: str
    storage_prefix: Optional[str] = None
    code_zip_key: Optional[str] = None
    code_manifest_key: Optional[str] = None
    report_md_key: Optional[str] = None
    trace_zip_key: Optional[str] = None
    runtime_key: Optional[str] = None
    entry_command: Optional[str] = None
    runtime_env: Optional[str] = None
    score_total: Optional[float] = None
    downloads: int = 0
    error_message: Optional[str] = None
    datasets: List["DatasetBrief"] = []
    skills: List["SkillBrief"] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True


class UploadCredentialIn(BaseModel):
    module: str = Field(..., pattern=r"^(code|report|trace|runtime|dataset)$")
    filename: str = Field(..., min_length=1, max_length=200)


class UploadCredentialOut(BaseModel):
    bucket: str
    region: str
    endpoint: str
    object_key: str
    access_key_id: str
    access_key_secret: str
    security_token: str
    expiration: str


class ModuleCompleteIn(BaseModel):
    code_zip_key: Optional[str] = None
    report_md_key: Optional[str] = None
    trace_zip_key: Optional[str] = None
    runtime_key: Optional[str] = None
    dataset_ids: List[int] = []


# ─── ARM Content ───────────────────────────────────────────

class ContentEntry(BaseModel):
    name: str
    type: str  # "file" or "directory"
    size: int = 0
    is_text: bool = True
    lang: Optional[str] = None


class ContentListOut(BaseModel):
    tab: str
    arm_version_id: int
    path: str
    entries: List[ContentEntry]


class ContentFileOut(BaseModel):
    tab: str
    arm_version_id: int
    path: str
    content: str
    size: int
    mime_type: Optional[str] = None
    truncated: bool = False
    download_url: Optional[str] = None


# ─── Dataset ───────────────────────────────────────────────

class DatasetCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=10000)


class DatasetBrief(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    downloads: int = 0
    class Config:
        from_attributes = True


class DatasetOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    oss_bucket: Optional[str] = None
    oss_key: Optional[str] = None
    size_bytes: int = 0
    checksum: Optional[str] = None
    uploader_user_id: int
    uploader_name: Optional[str] = None
    is_private: bool = True
    downloads: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# ─── Skill ─────────────────────────────────────────────────

class SkillCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=10000)
    tags: Optional[str] = None
    version: Optional[str] = Field(None, max_length=50)


class SkillBrief(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    downloads: int = 0
    class Config:
        from_attributes = True


class SkillOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    tags: Optional[str] = None
    version: Optional[str] = None
    oss_bucket: Optional[str] = None
    oss_zip_key: Optional[str] = None
    oss_md_key: Optional[str] = None
    uploader_user_id: int
    uploader_name: Optional[str] = None
    is_private: bool = True
    downloads: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# ─── Follow ────────────────────────────────────────────────

class FollowToggleOut(BaseModel):
    followed: bool


# ─── Profile ───────────────────────────────────────────────

class ProfileOut(BaseModel):
    user: UserOut
    followed_papers: List[PaperOut] = []
    followed_datasets: List[DatasetBrief] = []
    followed_skills: List[SkillBrief] = []
    my_arm_series: List[ARMSeriesOut] = []
    my_datasets: List[DatasetBrief] = []
    my_skills: List[SkillBrief] = []


# ─── Stats ─────────────────────────────────────────────────

class StatsOut(BaseModel):
    total_papers: int
    total_arms: int
    total_datasets: int
    total_skills: int


# ─── Score ─────────────────────────────────────────────────

class ScoreRequestOut(BaseModel):
    job_id: int
    status: str


class ScoreOut(BaseModel):
    arm_version_id: int
    score_total: Optional[float] = None
    status: Optional[str] = None
    dimensions_json: Optional[str] = None
    report_md_key: Optional[str] = None


class ScoreCallbackIn(BaseModel):
    total_score: float
    dimensions_json: Optional[str] = None
    report_md_key: Optional[str] = None


# ─── Pagination ────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: list
    total: int
    limit: int
    offset: int
