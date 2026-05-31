"""Redis Streams implementation of StreamBus."""
from __future__ import annotations

import logging
from typing import Any

from app.core.redis import get_redis_client
from app.streaming.base import StreamBus

log = logging.getLogger(__name__)

# Cap stream length to prevent unbounded growth. Approximate trimming is
# cheap (Redis trims to a nearby radix block, not exact len).
STREAM_MAXLEN = 10_000


class RedisStreamBus(StreamBus):
    @property
    def client(self):
        return get_redis_client()

    async def xadd(self, stream: str, fields: dict[str, Any]) -> str:
        # All Redis Stream field values must be strings/bytes — coerce here.
        coerced = {str(k): str(v) for k, v in fields.items()}
        return await self.client.xadd(
            stream, coerced, maxlen=STREAM_MAXLEN, approximate=True
        )

    async def xgroup_create(
        self, stream: str, group: str, *, mkstream: bool = True
    ) -> None:
        try:
            await self.client.xgroup_create(
                stream, group, id="0", mkstream=mkstream
            )
        except Exception as e:
            # BUSYGROUP = group already exists. That's the expected steady-state.
            if "BUSYGROUP" in str(e):
                return
            raise

    async def xreadgroup(
        self,
        group: str,
        consumer: str,
        streams: dict[str, str],
        *,
        block_ms: int = 0,
        count: int = 100,
    ) -> list:
        result = await self.client.xreadgroup(
            group, consumer, streams, block=block_ms, count=count
        )
        return result or []

    async def xack(self, stream: str, group: str, *ids: str) -> int:
        if not ids:
            return 0
        return await self.client.xack(stream, group, *ids)
