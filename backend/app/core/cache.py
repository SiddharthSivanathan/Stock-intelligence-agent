"""Thin async cache facade over Redis.

Kept deliberately small — no decorator magic. Service code calls
cache_get / cache_set explicitly so the read-through logic is visible.
That's better for tutorial reading AND for interview explanation.
"""
from __future__ import annotations

from app.core.redis import get_redis_client


async def cache_get(key: str) -> str | None:
    return await get_redis_client().get(key)


async def cache_set(key: str, value: str, ttl: int) -> None:
    """Store with a TTL in seconds. TTL is mandatory to prevent stale-forever bugs."""
    await get_redis_client().set(key, value, ex=ttl)


async def cache_delete(*keys: str) -> int:
    if not keys:
        return 0
    return await get_redis_client().delete(*keys)
