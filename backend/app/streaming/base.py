"""Stream bus abstraction.

Phase 8 ships a Redis Streams implementation. The interface deliberately
mirrors the subset of Kafka semantics we care about (consumer groups, acks)
so a future KafkaStreamBus is a drop-in.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class StreamBus(ABC):
    @abstractmethod
    async def xadd(self, stream: str, fields: dict[str, Any]) -> str:
        """Append a message to a stream. Returns the assigned message id."""

    @abstractmethod
    async def xgroup_create(
        self, stream: str, group: str, *, mkstream: bool = True
    ) -> None:
        """Create a consumer group. Idempotent — already-exists is fine."""

    @abstractmethod
    async def xreadgroup(
        self,
        group: str,
        consumer: str,
        streams: dict[str, str],
        *,
        block_ms: int = 0,
        count: int = 100,
    ) -> list:
        """Read new messages for the consumer group. Returns Redis's nested
        list shape: [[stream_name, [(id, fields), ...]], ...]."""

    @abstractmethod
    async def xack(self, stream: str, group: str, *ids: str) -> int:
        """Acknowledge processed messages so they leave the PEL."""
