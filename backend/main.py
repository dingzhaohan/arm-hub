"""ARM Hub — FastAPI application entry point."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from database import Base, engine
from app_config import limiter

# Route modules
from routes import papers, arms, arm_content, datasets, skills, profile, scoring
from routes import bohrclaw as bohrclaw_routes
from auth import router as auth_router
from bohrium_auth import router as bohrium_auth_router

# Bootstrap
try:
    Base.metadata.create_all(bind=engine)
except Exception:
    pass

# Migrate: add arm_zip_key column if missing
try:
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns("arm_versions")]
    if "arm_zip_key" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE arm_versions ADD COLUMN arm_zip_key VARCHAR(500) NULL"))
except Exception:
    pass

app = FastAPI(title="ARM Hub", version="1.0.0")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ─── Rate Limiting ────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Mount Routers ────────────────────────────────────────
app.include_router(auth_router)
app.include_router(bohrium_auth_router)
app.include_router(papers.router)
app.include_router(arms.router_series)
app.include_router(arms.router_versions)
app.include_router(arm_content.router)
app.include_router(datasets.router)
app.include_router(skills.router)
app.include_router(profile.router)
app.include_router(scoring.router)
app.include_router(bohrclaw_routes.router)

# ─── SPA Fallback ─────────────────────────────────────────
STATIC_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = STATIC_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(STATIC_DIR / "index.html"))
else:
    @app.get("/")
    async def no_frontend():
        return {"error": "Frontend dist/ not found", "static_dir": str(STATIC_DIR)}
