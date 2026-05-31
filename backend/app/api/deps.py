"""Shared FastAPI dependencies.

  get_db          : yields an AsyncSession (one per request)
  get_current_user: decodes JWT and returns the User
"""
from __future__ import annotations

from typing import Annotated, AsyncIterator

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import decode_token
from app.db.models.user import User
from app.db.session import AsyncSessionLocal
from app.services.user_service import get_user_by_id


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session


DbDep = Annotated[AsyncSession, Depends(get_db)]


# tokenUrl is what Swagger uses to drive the "Authorize" button.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/login")


async def get_current_user(
    db: DbDep,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise creds_exc

    if payload.get("type") != "access":
        raise creds_exc

    sub = payload.get("sub")
    if not sub:
        raise creds_exc

    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise creds_exc

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise creds_exc

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
