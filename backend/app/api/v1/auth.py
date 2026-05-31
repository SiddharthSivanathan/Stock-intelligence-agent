"""Authentication endpoints.

  POST /auth/signup   create account
  POST /auth/login    OAuth2 password flow -> access + refresh tokens
  POST /auth/refresh  exchange refresh token for a new access token
  GET  /auth/me       protected: returns the current user
"""
from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbDep
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.schemas.user import RefreshRequest, Token, UserCreate, UserOut
from app.services.user_service import (
    authenticate,
    create_user,
    get_user_by_email,
    get_user_by_id,
)

router = APIRouter()


@router.post(
    "/signup",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
)
async def signup(payload: UserCreate, db: DbDep) -> UserOut:
    if await get_user_by_email(db, payload.email) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    user = await create_user(db, payload)
    return UserOut.model_validate(user)


@router.post(
    "/login",
    response_model=Token,
    summary="Log in (OAuth2 password flow). Use 'email' as the username field.",
)
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbDep,
) -> Token:
    user = await authenticate(db, email=form.username, password=form.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post(
    "/refresh",
    response_model=Token,
    summary="Exchange a refresh token for fresh access + refresh tokens",
)
async def refresh(payload: RefreshRequest, db: DbDep) -> Token:
    try:
        data = decode_token(payload.refresh_token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not a refresh token",
        )

    try:
        user_id = int(data["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token",
        )

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get(
    "/me",
    response_model=UserOut,
    summary="Return the authenticated user (demo protected route)",
)
async def me(current_user: CurrentUser) -> UserOut:
    return UserOut.model_validate(current_user)
