"""Authentication utilities and auth-related API routes.

Bohrium is the single identity source. get_current_user() verifies a
brmToken JWT via the Bohrium API, upserts a local User row, and returns it.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db, User
from schemas import UserOut
from app_config import limiter
from bohrium_auth import verify_bohrium_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Extract & verify the brmToken, upsert the local User, return it.

    Returns None when no token is present (anonymous access).
    Raises HTTPException(401) when the token is present but invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization[7:]
    brm = verify_bohrium_token(token)

    user = db.query(User).filter(User.bohrium_id == brm.id).first()

    if user:
        changed = False
        if brm.display_name and user.display_name != brm.display_name:
            user.display_name = brm.display_name
            changed = True
        if brm.avatar_url and user.avatar_url != brm.avatar_url:
            user.avatar_url = brm.avatar_url
            changed = True
        if brm.email and user.email != brm.email:
            user.email = brm.email
            changed = True
        if brm.org_id and user.bohrium_org_id != brm.org_id:
            user.bohrium_org_id = brm.org_id
            changed = True
        if changed:
            db.commit()
            db.refresh(user)
    else:
        user = User(
            username=brm.username,
            email=brm.email or f"{brm.username}@bohrium.dp.tech",
            display_name=brm.display_name or brm.username,
            avatar_url=brm.avatar_url,
            bohrium_id=brm.id,
            bohrium_org_id=brm.org_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Auto-registered Bohrium user %s (bohrium_id=%s)", brm.username, brm.id)

    return user


def require_login(user=Depends(get_current_user)):
    """Dependency that enforces login. Returns User or raises 401."""
    if not user:
        raise HTTPException(401, "Authentication required")
    return user


# ─── Auth Routes ────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def get_me(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Not authenticated")
    return UserOut.model_validate(user)
