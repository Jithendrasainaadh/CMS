from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Token
class Token(BaseModel):
    access_token: str
    token_type: str
    is_superadmin: bool
    community_id: Optional[int] = None
    role: Optional[str] = None

class TokenData(BaseModel):
    email: Optional[str] = None

# User
class UserBase(BaseModel):
    email: str
    name: str

class UserCreate(UserBase):
    password: str
    role: str = "resident"

class User(UserBase):
    id: int
    community_id: int
    role: str
    is_active: bool
    model_config = {"from_attributes": True}

# UserInfo (returned by /api/me)
class UserInfo(BaseModel):
    id: Optional[int] = None
    email: str
    name: str
    role: str
    community_id: Optional[int] = None
    is_superadmin: bool

# UserProfile (returned by /api/profile)
class UserProfile(BaseModel):
    id: Optional[int] = None
    email: str
    name: str
    role: str
    community_id: Optional[int] = None
    community_name: Optional[str] = None

# ProfileUpdate
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class CommunityBase(BaseModel):
    name: str
    address: str

class CommunityCreate(CommunityBase):
    pass

class Community(CommunityBase):
    id: int
    owner_id: int
    model_config = {"from_attributes": True}

# SuperAdmin
class SuperAdminCreate(BaseModel):
    email: str
    password: str

class SuperAdmin(BaseModel):
    id: int
    email: str
    model_config = {"from_attributes": True}

# Message
class MessageBase(BaseModel):
    content: str
    channel: str

class MessageCreate(MessageBase):
    pass

class Message(MessageBase):
    id: int
    community_id: int
    author_id: int
    timestamp: datetime
    model_config = {"from_attributes": True}

class MessageWithAuthor(MessageBase):
    id: int
    community_id: int
    author_id: int
    author_name: str
    timestamp: datetime
    model_config = {"from_attributes": True}

# Poll
class PollOption(BaseModel):
    id: int
    text: str
    votes: int
    model_config = {"from_attributes": True}

class PollCreate(BaseModel):
    question: str
    options: List[str]

class Poll(BaseModel):
    id: int
    question: str
    is_active: bool
    community_id: int
    options: List[PollOption] = []
    model_config = {"from_attributes": True}

# Notification
class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    message: str
    reference_id: Optional[int] = None
    is_read: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class UnreadCount(BaseModel):
    count: int

# Property
class PropertyCreate(BaseModel):
    title: str
    description: str
    price: str
    status: str  # 'for_rent', 'for_sale', 'vacant'

class Property(BaseModel):
    id: int
    title: str
    description: str
    price: str
    status: str
    community_id: int
    owner_id: int
    model_config = {"from_attributes": True}

# Gallery
class GalleryImageBase(BaseModel):
    src: str
    label: str

class GalleryImageCreate(GalleryImageBase):
    pass

class GalleryImage(GalleryImageBase):
    id: int
    community_id: int
    created_at: datetime
    model_config = {"from_attributes": True}

# Public Community
class CommunityPublic(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}

# Super Admin Change Password
class SuperAdminUserPasswordUpdate(BaseModel):
    user_id: int
    new_password: str

# ── Maintenance Bills ──────────────────────────────────────────────────────────

class MaintenanceBillCreate(BaseModel):
    """Sent by admin to create a bill. resident_ids is a list so admin can
    raise the same bill for one or all residents in one request."""
    resident_ids: List[int]         # one or more resident user IDs
    billing_period: str             # e.g. "August 2026"
    amount: float                   # ₹ amount
    description: Optional[str] = None
    due_date: datetime              # ISO datetime string from frontend

class MaintenanceBillOut(BaseModel):
    """Returned by the API for a single bill record."""
    id: int
    community_id: int
    resident_id: int
    resident_name: str              # joined from User.name
    billing_period: str
    amount: float
    description: Optional[str] = None
    due_date: datetime
    is_paid: bool
    paid_at: Optional[datetime] = None
    created_at: datetime
    model_config = {"from_attributes": True}
