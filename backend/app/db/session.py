"""Async SQLAlchemy engine + session factory.

A single engine per process owns the connection pool. Sessions are short-lived
and obtained via the `get_session` dependency in app.api.deps.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,            # flip to True for verbose SQL during debugging
    pool_pre_ping=True,    # detect dropped connections (e.g. PG restart)
    pool_size=10,
    max_overflow=5,
    pool_recycle=1800,     # recycle every 30 min, beats some idle-conn killers
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # objects remain usable after commit
    autoflush=False,
)
