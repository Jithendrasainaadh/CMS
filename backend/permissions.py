"""
permissions.py — Resident permission management.
High cohesion: ONLY handles reading / writing ResidentPermission records.
Low coupling: stateless functions; callers inject the db session.
"""
from sqlalchemy.orm import Session
from . import models


def get_or_create(db: Session, user_id: int, community_id: int) -> models.ResidentPermission:
    """Return existing permissions for a user, or create defaults (all True)."""
    perm = db.query(models.ResidentPermission).filter(
        models.ResidentPermission.user_id == user_id
    ).first()
    if not perm:
        perm = models.ResidentPermission(
            user_id=user_id,
            community_id=community_id,
            can_message_general=True,
            can_vote_poll=True,
            can_vote_formal=True,
        )
        db.add(perm)
        db.commit()
        db.refresh(perm)
    return perm


def check(db: Session, user_id: int, permission: str) -> bool:
    """Return True if the user has the named permission (defaults to True if no record)."""
    perm = db.query(models.ResidentPermission).filter(
        models.ResidentPermission.user_id == user_id
    ).first()
    if not perm:
        return True
    return bool(getattr(perm, permission, True))


def update(db: Session, user_id: int, community_id: int, **flags) -> models.ResidentPermission:
    """Set one or more permission flags for a user. Returns updated record."""
    perm = get_or_create(db, user_id, community_id)
    changed = False
    for key, value in flags.items():
        if hasattr(perm, key):
            setattr(perm, key, bool(value))
            changed = True
    if changed:
        db.commit()
        db.refresh(perm)
    return perm


def get_community_permissions(db: Session, community_id: int) -> list:
    """Return permissions for all users in a community (joined with user data)."""
    users = db.query(models.User).filter(
        models.User.community_id == community_id,
        models.User.role == "resident"
    ).all()
    result = []
    for user in users:
        perm = get_or_create(db, user.id, community_id)
        result.append({"user": user, "perm": perm})
    return result
