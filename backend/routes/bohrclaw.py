"""BohrClaw routes — provision and manage personal OpenClaw instances.

Fetches the user's personal access key from bohrium-core (via user ID),
then uses it for all openapi calls (project list, node provisioning).
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db, BohrClawInstance, User
from schemas import BohrClawStatusOut
from auth import get_current_user
from app_config import limiter
from bohrium_auth import get_user_access_key
from bohrclaw_provisioner import provision_bohrclaw, get_user_project_id

router = APIRouter(prefix="/api/bohrclaw", tags=["bohrclaw"])


def _require_user(user: User | None) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.get("/status", response_model=BohrClawStatusOut | None)
def get_bohrclaw_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _require_user(user)
    instance = db.query(BohrClawInstance).filter(
        BohrClawInstance.bohrium_user_id == user.bohrium_id
    ).first()
    if not instance:
        return None
    return BohrClawStatusOut.model_validate(instance)


@router.post("/launch", response_model=BohrClawStatusOut)
@limiter.limit("2/minute")
def launch_bohrclaw(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _require_user(user)
    if not user.bohrium_id or not user.bohrium_org_id:
        raise HTTPException(
            status_code=400,
            detail="Bohrium account info incomplete — please re-login",
        )

    # Check for existing instance
    existing = db.query(BohrClawInstance).filter(
        BohrClawInstance.bohrium_user_id == user.bohrium_id
    ).first()
    if existing:
        if existing.status == "ready":
            return BohrClawStatusOut.model_validate(existing)
        # Failed or stale — delete and re-provision
        db.delete(existing)
        db.commit()

    # Step 1: Fetch the user's personal access key from bohrium-core
    access_key = get_user_access_key(user.bohrium_id, user.bohrium_org_id)

    # Step 2: Dynamically resolve the user's project ID via openapi
    try:
        project_id = get_user_project_id(access_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to resolve project: {e}")

    # Create a provisioning record
    instance = BohrClawInstance(bohrium_user_id=user.bohrium_id, status="provisioning")
    db.add(instance)
    db.commit()
    db.refresh(instance)

    # Step 3: Run the full provisioning pipeline
    try:
        result = provision_bohrclaw(
            email=user.email,
            access_key=access_key,
            project_id=str(project_id),
        )
    except TimeoutError as e:
        instance.status = "failed"
        db.commit()
        raise HTTPException(status_code=504, detail=str(e))
    except Exception as e:
        instance.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Provisioning failed: {e}")

    instance.instance_url = result.get("instance_url")
    instance.node_id = result.get("node_id")
    instance.node_ip = result.get("node_ip")
    instance.status = "ready" if instance.instance_url else "failed"
    db.commit()
    db.refresh(instance)

    if instance.status == "failed":
        raise HTTPException(
            status_code=500,
            detail="Provisioning completed but no URL was returned",
        )

    return BohrClawStatusOut.model_validate(instance) 
