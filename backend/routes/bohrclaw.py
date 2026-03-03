"""BohrClaw routes — provision and manage personal OpenClaw instances.

POST /launch kicks off provisioning in a background thread and returns
immediately. The frontend polls GET /status to track progress_step.
"""

import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db, BohrClawInstance, User, SessionLocal
from schemas import BohrClawStatusOut
from auth import get_current_user
from app_config import limiter
from bohrium_auth import get_user_access_key
from bohrclaw_provisioner import provision_bohrclaw_with_progress, get_user_project_id, delete_node

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bohrclaw", tags=["bohrclaw"])


def _require_user(user: User | None) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _update_instance(instance_id: int, **kwargs):
    """Update a BohrClawInstance in a fresh DB session (for use in threads)."""
    db = SessionLocal()
    try:
        inst = db.query(BohrClawInstance).filter(BohrClawInstance.id == instance_id).first()
        if inst:
            for k, v in kwargs.items():
                setattr(inst, k, v)
            db.commit()
    finally:
        db.close()


def _provision_background(instance_id: int, email: str, bohrium_user_id: int, bohrium_org_id: int):
    """Run the full provisioning pipeline in a background thread."""
    try:
        # Step 1: Fetch AK
        _update_instance(instance_id, progress_step="fetching_ak")
        access_key = get_user_access_key(bohrium_user_id, bohrium_org_id)

        # Step 2: Resolve project
        _update_instance(instance_id, progress_step="resolving_project")
        project_id = get_user_project_id(access_key)

        # Step 3-5: Provision (create node → wait → SSH start)
        def on_step(step: str):
            _update_instance(instance_id, progress_step=step)

        result = provision_bohrclaw_with_progress(
            email=email,
            access_key=access_key,
            project_id=str(project_id),
            on_step=on_step,
        )

        # Done
        url = result.get("instance_url")
        _update_instance(
            instance_id,
            instance_url=url,
            node_id=result.get("node_id"),
            node_ip=result.get("node_ip"),
            status="ready" if url else "failed",
            progress_step=None,
            error_message=None if url else "Provisioning completed but no URL was returned",
        )

    except Exception as e:
        logger.error("BohrClaw provisioning failed for instance %s: %s", instance_id, e)
        _update_instance(
            instance_id,
            status="failed",
            progress_step=None,
            error_message=str(e),
        )


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
        if existing.status == "provisioning":
            # Already in progress
            return BohrClawStatusOut.model_validate(existing)
        # Failed or stale — delete and re-provision
        db.delete(existing)
        db.commit()

    # Create a provisioning record
    instance = BohrClawInstance(
        bohrium_user_id=user.bohrium_id,
        status="provisioning",
        progress_step="fetching_ak",
    )
    db.add(instance)
    db.commit()
    db.refresh(instance)

    # Launch provisioning in background thread
    t = threading.Thread(
        target=_provision_background,
        args=(instance.id, user.email, user.bohrium_id, user.bohrium_org_id),
        daemon=True,
    )
    t.start()

    return BohrClawStatusOut.model_validate(instance)


@router.delete("/destroy")
@limiter.limit("3/minute")
def destroy_bohrclaw(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _require_user(user)
    instance = db.query(BohrClawInstance).filter(
        BohrClawInstance.bohrium_user_id == user.bohrium_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="No instance found")

    # Delete the Bohrium node if we have a node_id and user has valid credentials
    node_deleted = True
    if instance.node_id:
        try:
            access_key = get_user_access_key(user.bohrium_id, user.bohrium_org_id)
            delete_node(access_key, int(instance.node_id))
        except Exception as e:
            node_deleted = False
            logger.warning("Failed to delete Bohrium node %s: %s", instance.node_id, e)

    db.delete(instance)
    db.commit()
    if not node_deleted:
        return {"detail": "Instance record removed, but Bohrium node deletion failed — may need manual cleanup"}
    return {"detail": "Instance destroyed"}
