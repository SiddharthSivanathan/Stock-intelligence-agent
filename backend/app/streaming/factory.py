from __future__ import annotations

from functools import lru_cache

from app.streaming.base import StreamBus
from app.streaming.redis_stream import RedisStreamBus

PRICE_STREAM = "stream:prices"
WS_BROADCAST_GROUP = "ws_broadcasters"
ALERT_EVALUATOR_GROUP = "alert_evaluators"


@lru_cache(maxsize=1)
def get_stream_bus() -> StreamBus:
    return RedisStreamBus()
