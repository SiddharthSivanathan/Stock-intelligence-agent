"""WebSocket connection hub.

Tracks per-user connections + per-user symbol subscriptions. Fans out price
messages from the consumer to only the connections that want them.

Design:
  - One process, in-memory. Scales horizontally with a shared Redis pub/sub
    layer if needed later — the hub abstraction makes that swap easy.
  - asyncio.Lock guards the dicts. We snapshot the recipients under the
    lock, then send outside the lock (so a slow client doesn't block fan-out).
"""
from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class WSHub:
    def __init__(self) -> None:
        # user_id -> set of active WebSocket connections
        self._connections: dict[int, set[WebSocket]] = {}
        # user_id -> set of subscribed symbols (uppercase)
        self._subscriptions: dict[int, set[str]] = {}
        self._lock = asyncio.Lock()

    # ---------- Connection lifecycle ----------

    async def connect(self, ws: WebSocket, user_id: int) -> None:
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(ws)
            self._subscriptions.setdefault(user_id, set())

    async def disconnect(self, ws: WebSocket, user_id: int) -> None:
        async with self._lock:
            conns = self._connections.get(user_id)
            if conns:
                conns.discard(ws)
                if not conns:
                    self._connections.pop(user_id, None)
                    self._subscriptions.pop(user_id, None)

    # ---------- Subscription management ----------

    async def subscribe(self, user_id: int, symbols: list[str]) -> set[str]:
        async with self._lock:
            subs = self._subscriptions.setdefault(user_id, set())
            for s in symbols:
                s = s.strip().upper()
                if s:
                    subs.add(s)
            return set(subs)

    async def unsubscribe(self, user_id: int, symbols: list[str]) -> set[str]:
        async with self._lock:
            subs = self._subscriptions.get(user_id, set())
            for s in symbols:
                subs.discard(s.strip().upper())
            return set(subs)

    async def list_subscriptions(self, user_id: int) -> set[str]:
        async with self._lock:
            return set(self._subscriptions.get(user_id, set()))

    # ---------- Fan-out ----------

    async def broadcast_price(self, fields: dict[str, Any]) -> None:
        """Send a price update to every connection subscribed to its symbol."""
        symbol = (fields.get("symbol") or "").upper()
        if not symbol:
            return
        payload = {"type": "price", "data": fields}

        # Snapshot recipients under lock
        async with self._lock:
            targets: list[WebSocket] = []
            for uid, subs in self._subscriptions.items():
                if symbol in subs:
                    targets.extend(self._connections.get(uid, set()))

        # Send outside the lock — slow client doesn't block others
        await self._safe_fanout(targets, payload)

    async def broadcast_alert(
        self, user_id: int, alert: dict[str, Any]
    ) -> None:
        payload = {"type": "alert", "data": alert}
        async with self._lock:
            targets = list(self._connections.get(user_id, set()))
        await self._safe_fanout(targets, payload)

    @staticmethod
    async def _safe_fanout(
        targets: list[WebSocket], payload: dict[str, Any]
    ) -> None:
        if not targets:
            return
        # gather with return_exceptions so one failing client doesn't kill the batch
        results = await asyncio.gather(
            *(ws.send_json(payload) for ws in targets),
            return_exceptions=True,
        )
        for ws, r in zip(targets, results):
            if isinstance(r, Exception):
                log.debug("WS send failed (will be cleaned up): %s", r)

    # ---------- Introspection (for /health-style endpoints) ----------

    async def stats(self) -> dict[str, int]:
        async with self._lock:
            return {
                "connected_users": len(self._connections),
                "total_connections": sum(
                    len(s) for s in self._connections.values()
                ),
                "total_subscriptions": sum(
                    len(s) for s in self._subscriptions.values()
                ),
            }

    async def all_subscribed_symbols(self) -> set[str]:
        """Union of every connected user's subscribed symbols.

        Used by the price producer to also tick ad-hoc symbols viewed on
        /analysis/:symbol even when they aren't on anyone's watchlist.
        """
        async with self._lock:
            out: set[str] = set()
            for subs in self._subscriptions.values():
                out.update(subs)
            return out


@lru_cache(maxsize=1)
def get_ws_hub() -> WSHub:
    return WSHub()
