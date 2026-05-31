"""Async Redis client.

Single process-wide connection pool, created lazily. Lifespan in main.py
pings it once at startup so we fail fast if Redis is unreachable.
"""
from __future__ import annotations

from redis.asyncio import ConnectionPool, Redis

from app.config import settings

_pool: ConnectionPool | None = None
_client: Redis | None = None


def get_redis_client() -> Redis:
    """Return the shared async Redis client (lazy-initialized)."""
    global _pool, _client
    if _client is None:
        _pool = ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,  # str in / str out — matches our JSON cache use
            max_connections=20,
        )
        _client = Redis(connection_pool=_pool)
    return _client


async def close_redis() -> None:
    """Tear down the pool on app shutdown."""
    global _client, _pool
    if _client is not None:
        await _client.aclose()
        _client = None
    if _pool is not None:
        await _pool.aclose()
        _pool = None
