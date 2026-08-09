import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import models, database

# Security configuration
SECRET_KEY = "gcms_super_secret_key_for_development"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__truncate_error=False,   # don't raise on passwords >72 bytes
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")

def _safe_password(password: str) -> str:
    """Encode to UTF-8 and cap at 72 bytes — bcrypt's hard limit."""
    return password.encode("utf-8")[:72].decode("utf-8", errors="ignore")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(_safe_password(str(plain_password)), hashed_password)

def get_password_hash(password):
    return pwd_context.hash(_safe_password(str(password)))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user_token_data(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        is_superadmin: bool = payload.get("is_superadmin", False)
        community_id: int = payload.get("community_id", None)
        role: str = payload.get("role", None)
        
        if email is None:
            raise credentials_exception
            
        return {
            "email": email,
            "is_superadmin": is_superadmin,
            "community_id": community_id,
            "role": role
        }
    except JWTError:
        raise credentials_exception
