from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import timedelta, datetime
import os

from . import models, schemas, auth, database, notifications as notif_svc

from .database import engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Gated Community Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

# ── Force browsers to always fetch fresh JS/CSS ────────────────────────────────
@app.middleware("http")
async def no_cache_js_css(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.endswith(".js") or request.url.path.endswith(".css"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Serve index.html with no-cache (must be before static mount) ──────────────
@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
async def serve_frontend_root():
    response = FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ── AUTH ──────────────────────────────────────────────────────────────────────

@app.post("/api/superadmin/register", response_model=schemas.SuperAdmin)
def register_superadmin(admin: schemas.SuperAdminCreate, db: Session = Depends(get_db)):
    if db.query(models.SuperAdmin).filter(models.SuperAdmin.email == admin.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    new_admin = models.SuperAdmin(email=admin.email, hashed_password=auth.get_password_hash(admin.password))
    db.add(new_admin); db.commit(); db.refresh(new_admin)
    return new_admin

@app.get("/api/public/communities", response_model=List[schemas.CommunityPublic])
def get_public_communities(db: Session = Depends(get_db)):
    return db.query(models.Community).all()


@app.post("/api/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Handle multi-community login: format expected "email|community_id"
    raw_username = form_data.username
    email = raw_username
    community_id = None
    if "|" in raw_username:
        email, comm_str = raw_username.split("|", 1)
        if comm_str.isdigit():
            community_id = int(comm_str)

    # Normalize email to lowercase and strip whitespace
    email = email.strip().lower()

    # Validate email format
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email format")
    if len(form_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Check for superadmin using the extracted email
    super_admin = db.query(models.SuperAdmin).filter(models.SuperAdmin.email == email).first()
    if super_admin and auth.verify_password(form_data.password, super_admin.hashed_password):
        token = auth.create_access_token(
            data={"sub": super_admin.email, "is_superadmin": True, "user_id": super_admin.id},
            expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return {"access_token": token, "token_type": "bearer", "is_superadmin": True, "role": "superadmin"}

    if community_id:
        user = db.query(models.User).filter(models.User.email == email, models.User.community_id == community_id).first()
    else:
        user = db.query(models.User).filter(models.User.email == email).first()
    if user and auth.verify_password(form_data.password, user.hashed_password):
        token = auth.create_access_token(
            data={"sub": user.email, "is_superadmin": False, "community_id": user.community_id, "role": user.role, "user_id": user.id},
            expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return {"access_token": token, "token_type": "bearer", "is_superadmin": False, "community_id": user.community_id, "role": user.role}

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Incorrect email or password. Please check your credentials.",
                        headers={"WWW-Authenticate": "Bearer"})


@app.get("/api/me", response_model=schemas.UserInfo)
def get_me(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        admin = db.query(models.SuperAdmin).filter(models.SuperAdmin.email == token_data["email"]).first()
        return schemas.UserInfo(id=admin.id if admin else None, email=token_data["email"],
                                name="Super Admin", role="superadmin", community_id=None, is_superadmin=True)
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found in database")
    return schemas.UserInfo(id=user.id, email=user.email, name=user.name,
                            role=user.role, community_id=user.community_id, is_superadmin=False)


# ── PROFILE ────────────────────────────────────────────────────────────────────

@app.get("/api/profile", response_model=schemas.UserProfile)
def get_profile(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        admin = db.query(models.SuperAdmin).filter(models.SuperAdmin.email == token_data["email"]).first()
        return schemas.UserProfile(id=admin.id, email=admin.email, name="Super Admin",
                                   role="superadmin", community_id=None, community_name=None)
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    community = db.query(models.Community).filter(models.Community.id == user.community_id).first()
    return schemas.UserProfile(id=user.id, email=user.email, name=user.name,
                               role=user.role, community_id=user.community_id,
                               community_name=community.name if community else None)


@app.put("/api/profile", response_model=schemas.UserProfile)
def update_profile(update: schemas.ProfileUpdate, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=400, detail="Super admin profile cannot be updated here")
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if update.name:
        if len(update.name.strip()) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
        user.name = update.name.strip()

    if update.new_password:
        if not update.current_password:
            raise HTTPException(status_code=400, detail="Current password required to set a new password")
        if not auth.verify_password(update.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        if len(update.new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
        user.hashed_password = auth.get_password_hash(update.new_password)

    db.commit(); db.refresh(user)
    community = db.query(models.Community).filter(models.Community.id == user.community_id).first()
    return schemas.UserProfile(id=user.id, email=user.email, name=user.name,
                               role=user.role, community_id=user.community_id,
                               community_name=community.name if community else None)


# ── SUPER ADMIN ────────────────────────────────────────────────────────────────

@app.post("/api/communities/", response_model=schemas.Community)
def create_community(community: schemas.CommunityCreate, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if not token_data["is_superadmin"]:
        raise HTTPException(status_code=403, detail="Only Super Admins can create communities")
    super_admin = db.query(models.SuperAdmin).filter(models.SuperAdmin.email == token_data["email"]).first()
    new_community = models.Community(**community.dict(), owner_id=super_admin.id)
    db.add(new_community); db.commit(); db.refresh(new_community)
    return new_community

@app.get("/api/communities/", response_model=List[schemas.Community])
def read_communities(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if not token_data["is_superadmin"]:
        raise HTTPException(status_code=403, detail="Only Super Admins can view all communities")
    super_admin = db.query(models.SuperAdmin).filter(models.SuperAdmin.email == token_data["email"]).first()
    return db.query(models.Community).filter(models.Community.owner_id == super_admin.id).all()


@app.get("/api/communities/{community_id}/members", response_model=List[schemas.User])
def get_community_members(community_id: int, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if not token_data["is_superadmin"]:
        raise HTTPException(status_code=403, detail="Only Super Admins can view community members")
    super_admin = db.query(models.SuperAdmin).filter(models.SuperAdmin.email == token_data["email"]).first()
    community = db.query(models.Community).filter(
        models.Community.id == community_id,
        models.Community.owner_id == super_admin.id
    ).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found or not owned by you")
    return db.query(models.User).filter(models.User.community_id == community_id).all()


@app.delete("/api/communities/{community_id}")
def delete_community(community_id: int, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if not token_data["is_superadmin"]:
        raise HTTPException(status_code=403, detail="Only Super Admins can delete communities")
    super_admin = db.query(models.SuperAdmin).filter(models.SuperAdmin.email == token_data["email"]).first()
    community = db.query(models.Community).filter(
        models.Community.id == community_id,
        models.Community.owner_id == super_admin.id
    ).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found or not owned by you")

    comm_name = community.name  # capture before deletion

    # Delete in correct dependency order using explicit SQL to avoid ORM cascade issues
    # caused by schema drift (e.g. missing columns on old DB files)
    from sqlalchemy import text
    db.execute(text("DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE community_id = :cid)"), {"cid": community_id})
    db.execute(text("DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE community_id = :cid)"), {"cid": community_id})
    db.execute(text("DELETE FROM polls WHERE community_id = :cid"), {"cid": community_id})
    db.execute(text("DELETE FROM messages WHERE community_id = :cid"), {"cid": community_id})
    db.execute(text("DELETE FROM properties WHERE community_id = :cid"), {"cid": community_id})
    db.execute(text("DELETE FROM maintenance_bills WHERE community_id = :cid"), {"cid": community_id})
    db.execute(text("DELETE FROM notifications WHERE community_id = :cid"), {"cid": community_id})
    db.execute(text("DELETE FROM resident_permissions WHERE community_id = :cid"), {"cid": community_id})
    db.execute(text("DELETE FROM users WHERE community_id = :cid"), {"cid": community_id})
    db.execute(text("DELETE FROM communities WHERE id = :cid"), {"cid": community_id})
    db.commit()
    return {"message": f"Community '{comm_name}' deleted successfully"}


# ── USERS ──────────────────────────────────────────────────────────────────────

@app.post("/api/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, community_id: int, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if not token_data["is_superadmin"] and token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to create users")
    if db.query(models.User).filter(models.User.email == user.email, models.User.community_id == community_id).first():
        raise HTTPException(status_code=400, detail="Email already registered in this community")
    
    # If a new admin is assigned by Super Admin, demote existing admins in this community to residents
    if user.role == "admin" and token_data["is_superadmin"]:
        existing_admins = db.query(models.User).filter(
            models.User.community_id == community_id,
            models.User.role == "admin"
        ).all()
        for ea in existing_admins:
            ea.role = "resident"
            
    db_user = models.User(email=user.email, name=user.name, role=user.role,
                          hashed_password=auth.get_password_hash(user.password), community_id=community_id)
    db.add(db_user); db.commit(); db.refresh(db_user)
    return db_user

@app.get("/api/users/", response_model=List[schemas.User])
def list_users(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=403, detail="Superadmins do not belong to a community")
    if token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can list users")
    return db.query(models.User).filter(models.User.community_id == token_data["community_id"]).all()

@app.put("/api/superadmin/users/password")
def superadmin_change_user_password(payload: schemas.SuperAdminUserPasswordUpdate, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if not token_data["is_superadmin"]:
        raise HTTPException(status_code=403, detail="Only Super Admins can reset user passwords")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = auth.get_password_hash(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully"}

# ── MESSAGES ───────────────────────────────────────────────────────────────────

@app.get("/api/messages/", response_model=List[schemas.MessageWithAuthor])
def read_messages(channel: str = "general", token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=400, detail="Superadmins do not have a community chat")
    messages = db.query(models.Message).filter(
        models.Message.community_id == token_data["community_id"],
        models.Message.channel == channel
    ).order_by(models.Message.timestamp).all()
    result = []
    for msg in messages:
        author = db.query(models.User).filter(models.User.id == msg.author_id).first()
        result.append({"id": msg.id, "content": msg.content, "channel": msg.channel,
                       "community_id": msg.community_id, "author_id": msg.author_id,
                       "author_name": author.name if author else "Unknown", "timestamp": msg.timestamp})
    return result

@app.post("/api/messages/", response_model=schemas.MessageWithAuthor)
def create_message(message: schemas.MessageCreate, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=400, detail="Superadmins cannot post messages")
    if message.channel == "announcements" and token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only community admins can post announcements")
    if not message.content or not message.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty")
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    db_msg = models.Message(content=message.content, channel=message.channel,
                             community_id=user.community_id, author_id=user.id)
    db.add(db_msg); db.commit(); db.refresh(db_msg)

    # Broadcast notification to all community members when an announcement is posted
    if message.channel == "announcements":
        notif_svc.broadcast(
            db, community_id=user.community_id,
            type="announcement",
            title=f"📢 New Announcement from {user.name}",
            message=message.content[:120] + ("…" if len(message.content) > 120 else ""),
            reference_id=db_msg.id,
            exclude_user_id=user.id
        )
        db.commit()

    return {"id": db_msg.id, "content": db_msg.content, "channel": db_msg.channel,
            "community_id": db_msg.community_id, "author_id": db_msg.author_id,
            "author_name": user.name, "timestamp": db_msg.timestamp}

@app.delete("/api/messages/{message_id}")
def delete_message(message_id: int, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete messages")
    msg = db.query(models.Message).filter(models.Message.id == message_id, models.Message.community_id == token_data["community_id"]).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(msg)
    db.commit()
    return {"message": "Message deleted"}


# ── POLLS ──────────────────────────────────────────────────────────────────────

@app.get("/api/polls/", response_model=List[schemas.Poll])
def read_polls(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=400, detail="Superadmins do not belong to a community")
    return db.query(models.Poll).filter(models.Poll.community_id == token_data["community_id"]).all()

@app.post("/api/polls/", response_model=schemas.Poll)
def create_poll(poll: schemas.PollCreate, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only community admins can create polls")
    if len(poll.options) < 2:
        raise HTTPException(status_code=400, detail="A poll needs at least 2 options")
    new_poll = models.Poll(question=poll.question, community_id=token_data["community_id"], is_active=True)
    db.add(new_poll); db.flush()
    for opt_text in poll.options:
        db.add(models.PollOption(poll_id=new_poll.id, text=opt_text, votes=0))
    db.commit(); db.refresh(new_poll)

    # Broadcast notification to all community members about the new poll
    notif_svc.broadcast(
        db, community_id=token_data["community_id"],
        type="poll",
        title="📊 New Poll: " + poll.question[:80],
        message=f"Cast your vote on: {poll.question[:100]}",
        reference_id=new_poll.id
    )
    db.commit()

    return new_poll


@app.post("/api/polls/{poll_id}/vote")
def vote_on_poll(poll_id: int, option_id: int, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=403, detail="Superadmins cannot vote in community polls")
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    if db.query(models.PollVote).filter(models.PollVote.poll_id == poll_id, models.PollVote.voter_id == user.id).first():
        raise HTTPException(status_code=400, detail="You have already voted in this poll")
    option = db.query(models.PollOption).filter(models.PollOption.id == option_id, models.PollOption.poll_id == poll_id).first()
    if not option:
        raise HTTPException(status_code=404, detail="Poll option not found")
    option.votes += 1
    db.add(models.PollVote(poll_id=poll_id, option_id=option_id, voter_id=user.id))
    db.commit()
    return {"message": "Vote recorded successfully"}

@app.delete("/api/polls/{poll_id}")
def delete_poll(poll_id: int, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete polls")
    poll = db.query(models.Poll).filter(models.Poll.id == poll_id, models.Poll.community_id == token_data["community_id"]).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    db.query(models.PollVote).filter(models.PollVote.poll_id == poll.id).delete()
    db.query(models.PollOption).filter(models.PollOption.poll_id == poll.id).delete()
    db.delete(poll)
    db.commit()
    return {"message": "Poll deleted"}

# ── PROPERTIES ─────────────────────────────────────────────────────────────────

@app.get("/api/properties/", response_model=List[schemas.Property])
def read_properties(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=400, detail="Superadmins do not belong to a community")
    return db.query(models.Property).filter(models.Property.community_id == token_data["community_id"]).all()

@app.post("/api/properties/", response_model=schemas.Property)
def create_property(prop: schemas.PropertyCreate, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only community admins can add listings")
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    new_prop = models.Property(title=prop.title, description=prop.description, price=prop.price,
                               status=prop.status, community_id=user.community_id, owner_id=user.id)
    db.add(new_prop); db.commit(); db.refresh(new_prop)
    return new_prop


# ── NOTIFICATIONS ──────────────────────────────────────────────────────────────

@app.get("/api/notifications/", response_model=List[schemas.NotificationOut])
def get_notifications(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=400, detail="Superadmins do not receive community notifications")
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return notif_svc.get_for_user(db, user.id)


@app.get("/api/notifications/unread-count", response_model=schemas.UnreadCount)
def get_unread_count(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        return {"count": 0}
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    if not user:
        return {"count": 0}
    return {"count": notif_svc.unread_count(db, user.id)}


@app.put("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=400, detail="No notifications for superadmins")
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    notif_svc.mark_read(db, notif_id, user.id)
    return {"message": "Marked as read"}


@app.put("/api/notifications/read-all")
def mark_all_read(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        return {"message": "No notifications"}
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    notif_svc.mark_all_read(db, user.id)
    db.commit()
    return {"message": "All notifications marked as read"}

# ── GALLERY ────────────────────────────────────────────────────────────────────

@app.get("/api/gallery/", response_model=List[schemas.GalleryImage])
def get_gallery_images(token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=400, detail="Superadmins do not have a gallery")
    return db.query(models.GalleryImage).filter(models.GalleryImage.community_id == token_data["community_id"]).order_by(models.GalleryImage.created_at.desc()).all()

@app.post("/api/gallery/", response_model=schemas.GalleryImage)
def add_gallery_image(image: schemas.GalleryImageCreate, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can add gallery images")
    db_img = models.GalleryImage(community_id=token_data["community_id"], src=image.src, label=image.label)
    db.add(db_img)
    db.commit()
    db.refresh(db_img)
    return db_img

@app.delete("/api/gallery/{image_id}")
def delete_gallery_image(image_id: int, token_data: dict = Depends(auth.get_current_user_token_data), db: Session = Depends(get_db)):
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete gallery images")
    img = db.query(models.GalleryImage).filter(models.GalleryImage.id == image_id, models.GalleryImage.community_id == token_data["community_id"]).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    db.delete(img)
    db.commit()
    return {"message": "Image deleted"}



# ── MAINTENANCE BILLS ──────────────────────────────────────────────────────────

def _bill_out(bill: models.MaintenanceBill, db: Session) -> schemas.MaintenanceBillOut:
    """Helper: build a MaintenanceBillOut from an ORM object."""
    resident = db.query(models.User).filter(models.User.id == bill.resident_id).first()
    return schemas.MaintenanceBillOut(
        id=bill.id,
        community_id=bill.community_id,
        resident_id=bill.resident_id,
        resident_name=resident.name if resident else "Unknown",
        billing_period=bill.billing_period,
        amount=bill.amount,
        description=bill.description,
        due_date=bill.due_date,
        is_paid=bill.is_paid,
        paid_at=bill.paid_at,
        created_at=bill.created_at,
    )


@app.post("/api/maintenance/bills/", response_model=List[schemas.MaintenanceBillOut])
def create_maintenance_bills(
    payload: schemas.MaintenanceBillCreate,
    token_data: dict = Depends(auth.get_current_user_token_data),
    db: Session = Depends(get_db)
):
    """Admin creates one bill record per selected resident. Validates each
    resident_id belongs to the same community and has the 'resident' role."""
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only community admins can create maintenance bills")
    if not payload.resident_ids:
        raise HTTPException(status_code=400, detail="At least one resident must be selected")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if not payload.billing_period.strip():
        raise HTTPException(status_code=400, detail="Billing period is required")

    community_id = token_data["community_id"]
    created_bills = []
    for resident_id in payload.resident_ids:
        # Verify the resident exists in this community
        resident = db.query(models.User).filter(
            models.User.id == resident_id,
            models.User.community_id == community_id
        ).first()
        if not resident:
            raise HTTPException(status_code=404, detail=f"Resident ID {resident_id} not found in your community")
        bill = models.MaintenanceBill(
            community_id=community_id,
            resident_id=resident_id,
            billing_period=payload.billing_period.strip(),
            amount=payload.amount,
            description=payload.description,
            due_date=payload.due_date,
        )
        db.add(bill)
        db.flush()  # get ID before commit
        created_bills.append(bill)

    db.commit()
    return [_bill_out(b, db) for b in created_bills]


@app.get("/api/maintenance/bills/", response_model=List[schemas.MaintenanceBillOut])
def get_all_maintenance_bills(
    token_data: dict = Depends(auth.get_current_user_token_data),
    db: Session = Depends(get_db)
):
    """Admin: list all bills in their community, ordered newest first."""
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only community admins can view all bills")
    bills = db.query(models.MaintenanceBill).filter(
        models.MaintenanceBill.community_id == token_data["community_id"]
    ).order_by(models.MaintenanceBill.created_at.desc()).all()
    return [_bill_out(b, db) for b in bills]


@app.get("/api/maintenance/my-bills/", response_model=List[schemas.MaintenanceBillOut])
def get_my_bills(
    token_data: dict = Depends(auth.get_current_user_token_data),
    db: Session = Depends(get_db)
):
    """Resident: list only their own bills, ordered newest first."""
    if token_data["is_superadmin"]:
        raise HTTPException(status_code=403, detail="Super Admins do not have community bills")
    if token_data.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Admins: use /api/maintenance/bills/ to view community bills")
    user = db.query(models.User).filter(models.User.email == token_data["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    bills = db.query(models.MaintenanceBill).filter(
        models.MaintenanceBill.resident_id == user.id,
        models.MaintenanceBill.community_id == user.community_id   # belt-and-suspenders scope check
    ).order_by(models.MaintenanceBill.created_at.desc()).all()
    return [_bill_out(b, db) for b in bills]


@app.put("/api/maintenance/bills/{bill_id}/pay", response_model=schemas.MaintenanceBillOut)
def mark_bill_paid(
    bill_id: int,
    token_data: dict = Depends(auth.get_current_user_token_data),
    db: Session = Depends(get_db)
):
    """Admin marks a bill as paid after verifying offline payment. Cannot un-pay."""
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only community admins can mark bills as paid")
    bill = db.query(models.MaintenanceBill).filter(
        models.MaintenanceBill.id == bill_id,
        models.MaintenanceBill.community_id == token_data["community_id"]   # enforce community scope
    ).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.is_paid:
        raise HTTPException(status_code=400, detail="Bill is already marked as paid")
    bill.is_paid = True
    bill.paid_at = datetime.utcnow()
    db.commit()
    db.refresh(bill)
    return _bill_out(bill, db)


@app.delete("/api/maintenance/bills/{bill_id}")
def delete_maintenance_bill(
    bill_id: int,
    token_data: dict = Depends(auth.get_current_user_token_data),
    db: Session = Depends(get_db)
):
    """Admin deletes a bill (e.g. created by mistake). Only unpaid bills can be deleted."""
    if token_data["is_superadmin"] or token_data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only community admins can delete bills")
    bill = db.query(models.MaintenanceBill).filter(
        models.MaintenanceBill.id == bill_id,
        models.MaintenanceBill.community_id == token_data["community_id"]
    ).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.is_paid:
        raise HTTPException(status_code=400, detail="Paid bills cannot be deleted")
    db.delete(bill)
    db.commit()
    return {"message": "Bill deleted"}


# ── SERVE FRONTEND (after all explicit routes) ─────────────────────────────────
app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")
