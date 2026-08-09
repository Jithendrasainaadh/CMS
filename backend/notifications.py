"""
notifications.py — Notification creation and broadcast.
High cohesion: ONLY handles creating / reading Notification records.
Low coupling: stateless functions; callers inject the db session and commit.
"""
from sqlalchemy.orm import Session
from datetime import datetime
from . import models


def create_one(db: Session, community_id: int, user_id: int,
               type: str, title: str, message: str,
               reference_id: int = None) -> models.Notification:
    """Create a single notification record (caller must commit)."""
    notif = models.Notification(
        community_id=community_id,
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        reference_id=reference_id,
        is_read=False,
        created_at=datetime.utcnow(),
    )
    db.add(notif)
    return notif


def broadcast(db: Session, community_id: int, type: str,
              title: str, message: str, reference_id: int = None,
              exclude_user_id: int = None):
    """Send a notification to every user in a community. Caller must commit."""
    users = db.query(models.User).filter(
        models.User.community_id == community_id,
        models.User.is_active == True,
    ).all()
    for user in users:
        if exclude_user_id and user.id == exclude_user_id:
            continue
        create_one(db, community_id, user.id, type, title, message, reference_id)


def get_for_user(db: Session, user_id: int, limit: int = 30) -> list:
    """Return the latest notifications for a user, newest first."""
    return (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user_id)
        .order_by(models.Notification.created_at.desc())
        .limit(limit)
        .all()
    )


def unread_count(db: Session, user_id: int) -> int:
    return db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.is_read == False,
    ).count()


def mark_read(db: Session, notif_id: int, user_id: int) -> bool:
    notif = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.user_id == user_id,
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
        return True
    return False


def mark_all_read(db: Session, user_id: int):
    db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
