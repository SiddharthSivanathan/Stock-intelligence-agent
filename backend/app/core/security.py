"""Password hashing and JWT token utilities.

Why bcrypt directly instead of passlib?
  passlib 1.7.x has friction with bcrypt 4.x (deprecation warnings, missing
  __about__ attribute). For a fresh project, calling bcrypt directly is
  smaller, clearer, and avoids version-pinning gymnastics.

Why PyJWT instead of python-jose?
  PyJWT is actively maintained, has a simpler API, and ships sane defaults.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt

from app.config import settings

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    """One-way hash a plaintext password. Cost factor = bcrypt default (12)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Constant-time check of plaintext against stored hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _create_token(
    subject: str,
    kind: TokenType,
    expires_delta: timedelta,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": kind,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str | int) -> str:
    return _create_token(
        str(subject),
        "access",
        timedelta(minutes=settings.access_token_minutes),
    )


def create_refresh_token(subject: str | int) -> str:
    return _create_token(
        str(subject),
        "refresh",
        timedelta(days=settings.refresh_token_days),
    )


def decode_token(token: str) -> dict[str, Any]:
    """Decode + verify a token. Raises jwt.PyJWTError on invalid/expired."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
