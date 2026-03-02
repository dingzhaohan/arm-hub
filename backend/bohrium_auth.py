"""Bohrium OAuth authentication - token verification and user info proxy.

Decodes the brmToken JWT (without signature verification — we rely on
the Bohrium user-info API call to validate the token), calls the Bohrium
account API to fetch user details, and returns a structured BohriumUser.
"""

import base64
import json
import logging
import time
import urllib.request
import urllib.error
from threading import Lock
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel

from app_config import limiter
from config.config import BOHRIUM_ACCOUNT_API, BOHRIUM_CORE_API

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth/bohrium", tags=["bohrium-auth"])

# ─── In-memory cache: bohrium_id → (BohriumUser, raw_data, expire_ts) ────
_cache: dict[int, tuple["BohriumUser", dict, float]] = {}
_cache_lock = Lock()
_CACHE_TTL = 300


def _cache_get(bohrium_id: int) -> Optional[tuple["BohriumUser", dict]]:
    with _cache_lock:
        entry = _cache.get(bohrium_id)
        if entry and entry[2] > time.time():
            return entry[0], entry[1]
        _cache.pop(bohrium_id, None)
    return None


def _cache_set(bohrium_id: int, user: "BohriumUser", raw: dict) -> None:
    with _cache_lock:
        _cache[bohrium_id] = (user, raw, time.time() + _CACHE_TTL)


class BohriumUser(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    org_id: Optional[int] = None


def _decode_jwt_payload(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Not a valid JWT (expected 3 parts)")
    payload_b64 = parts[1]
    padding = 4 - len(payload_b64) % 4
    if padding != 4:
        payload_b64 += "=" * padding
    payload_bytes = base64.urlsafe_b64decode(payload_b64)
    return json.loads(payload_bytes)


def _extract_identity(token: str) -> tuple[int, int]:
    payload = _decode_jwt_payload(token)
    identity = payload.get("identity") or {}
    user_id = identity.get("userId")
    org_id = identity.get("orgId")
    if not user_id:
        raise ValueError("JWT payload missing identity.userId")
    return int(user_id), int(org_id) if org_id else 0


def _fetch_bohrium_user_info(token: str, user_id: int, org_id: int) -> dict:
    url = f"{BOHRIUM_ACCOUNT_API}/account_api/users/{user_id}?orgId={org_id}"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        logger.warning("Bohrium API returned %s for userId=%s", e.code, user_id)
        raise HTTPException(status_code=401, detail="Bohrium token invalid or expired")
    except Exception as e:
        logger.error("Bohrium API request failed: %s", e)
        raise HTTPException(status_code=502, detail="Failed to reach Bohrium API")

    if body.get("code") != 0:
        raise HTTPException(status_code=401, detail="Bohrium API rejected the token")

    return body.get("data", {})


def verify_bohrium_token(token: str) -> BohriumUser:
    try:
        user_id, org_id = _extract_identity(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    cached = _cache_get(user_id)
    if cached is not None:
        return cached[0]

    data = _fetch_bohrium_user_info(token, user_id, org_id)

    orgs = data.get("orgs") or []
    first_org_id = orgs[0]["id"] if orgs else org_id

    brm_user = BohriumUser(
        id=data.get("id", user_id),
        username=data.get("userNo", str(user_id)),
        email=data.get("email"),
        display_name=data.get("nickname"),
        avatar_url=data.get("profilePhoto") or None,
        org_id=first_org_id,
    )

    _cache_set(user_id, brm_user, data)
    return brm_user


def verify_bohrium_token_raw(token: str) -> dict:
    try:
        user_id, org_id = _extract_identity(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    cached = _cache_get(user_id)
    if cached is not None:
        return cached[1]

    data = _fetch_bohrium_user_info(token, user_id, org_id)

    orgs = data.get("orgs") or []
    first_org_id = orgs[0]["id"] if orgs else org_id
    brm_user = BohriumUser(
        id=data.get("id", user_id),
        username=data.get("userNo", str(user_id)),
        email=data.get("email"),
        display_name=data.get("nickname"),
        avatar_url=data.get("profilePhoto") or None,
        org_id=first_org_id,
    )

    _cache_set(user_id, brm_user, data)
    return data


def get_user_access_key(bohrium_user_id: int, bohrium_org_id: int) -> str:
    url = f"{BOHRIUM_CORE_API}/api/v1/ak/list"
    req = urllib.request.Request(url, method="GET")
    req.add_header("X-User-Id", str(bohrium_user_id))
    req.add_header("X-Org-Id", str(bohrium_org_id))
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read())
    except Exception as e:
        logger.error("Failed to fetch AK for userId=%s: %s", bohrium_user_id, e)
        raise HTTPException(status_code=502, detail="Failed to fetch Bohrium access key")

    if body.get("code") != 0:
        raise HTTPException(status_code=502, detail="Bohrium AK API returned an error")

    ak_list = body.get("data") or []
    if not ak_list:
        raise HTTPException(status_code=404, detail="No Bohrium access key found for this user")

    return ak_list[0]["accessKey"]


# ─── Route: GET /api/auth/bohrium/me ────────────────────────

@router.get("/me")
@limiter.limit("30/minute")
def get_bohrium_user(request: Request, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "No token provided")
    token = authorization[7:]
    return verify_bohrium_token_raw(token)
