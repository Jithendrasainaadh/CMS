from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class SuperAdmin(Base):
    __tablename__ = "superadmins"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    communities = relationship("Community", back_populates="owner")

class Community(Base):
    __tablename__ = "communities"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    address = Column(String)
    owner_id = Column(Integer, ForeignKey("superadmins.id"))
    owner = relationship("SuperAdmin", back_populates="communities")
    users = relationship("User", back_populates="community", cascade="all, delete-orphan")
    polls = relationship("Poll", back_populates="community", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="community", cascade="all, delete-orphan")
    properties = relationship("Property", back_populates="community", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="community", cascade="all, delete-orphan")
    gallery_images = relationship("GalleryImage", back_populates="community", cascade="all, delete-orphan")
    maintenance_bills = relationship("MaintenanceBill", back_populates="community", cascade="all, delete-orphan")

class GalleryImage(Base):
    __tablename__ = "gallery_images"
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"))
    src = Column(String)
    label = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    community = relationship("Community", back_populates="gallery_images")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"))
    email = Column(String, index=True)
    name = Column(String)
    role = Column(String, default="resident")  # 'admin' or 'resident'
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    community = relationship("Community", back_populates="users")
    messages = relationship("Message", back_populates="author")
    properties = relationship("Property", back_populates="owner")
    permissions = relationship("ResidentPermission", back_populates="user", uselist=False, cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    maintenance_bills = relationship("MaintenanceBill", back_populates="resident", cascade="all, delete-orphan")

class ResidentPermission(Base):
    """Stores per-resident permission flags for a community. High cohesion: ONLY permission data lives here."""
    __tablename__ = "resident_permissions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    community_id = Column(Integer, ForeignKey("communities.id"))
    can_message_general = Column(Boolean, default=True)
    can_vote_poll = Column(Boolean, default=True)
    can_vote_formal = Column(Boolean, default=True)
    user = relationship("User", back_populates="permissions")

class Notification(Base):
    """A notification record for a single user. High cohesion: ONLY notification data lives here."""
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    type = Column(String)          # 'poll', 'announcement', 'system'
    title = Column(String)
    message = Column(String)
    reference_id = Column(Integer, nullable=True)  # poll_id or message_id
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    community = relationship("Community", back_populates="notifications")
    user = relationship("User", back_populates="notifications")

class Poll(Base):
    __tablename__ = "polls"
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"))
    question = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    community = relationship("Community", back_populates="polls")
    options = relationship("PollOption", back_populates="poll", cascade="all, delete-orphan")

class PollOption(Base):
    __tablename__ = "poll_options"
    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("polls.id"))
    text = Column(String)
    votes = Column(Integer, default=0)
    poll = relationship("Poll", back_populates="options")

class PollVote(Base):
    __tablename__ = "poll_votes"
    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("polls.id"))
    option_id = Column(Integer, ForeignKey("poll_options.id"))
    voter_id = Column(Integer, ForeignKey("users.id"))

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"))
    author_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    channel = Column(String)  # 'announcements' or 'general'
    timestamp = Column(DateTime, default=datetime.utcnow)
    community = relationship("Community", back_populates="messages")
    author = relationship("User", back_populates="messages")

class Property(Base):
    __tablename__ = "properties"
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"))
    owner_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    description = Column(String)
    price = Column(String)
    status = Column(String)  # 'for_rent', 'for_sale', 'vacant'
    community = relationship("Community", back_populates="properties")
    owner = relationship("User", back_populates="properties")

class MaintenanceBill(Base):
    """Monthly maintenance bill raised by admin for one or more residents."""
    __tablename__ = "maintenance_bills"
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"))
    resident_id = Column(Integer, ForeignKey("users.id"))       # the resident this bill is for
    billing_period = Column(String)                              # e.g. "August 2026"
    amount = Column(Float)                                       # in ₹
    description = Column(String, nullable=True)                  # e.g. "Maintenance + Water charges"
    due_date = Column(DateTime)
    is_paid = Column(Boolean, default=False)
    paid_at = Column(DateTime, nullable=True)                    # set when admin marks paid
    created_at = Column(DateTime, default=datetime.utcnow)
    community = relationship("Community", back_populates="maintenance_bills")
    resident = relationship("User", back_populates="maintenance_bills")

