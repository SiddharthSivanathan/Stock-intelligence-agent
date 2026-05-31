"""Authenticated WebSocket endpoint.

JWT is passed in the query string (?token=...) because browser WebSocket
clients can't easily set Authorization headers.

Protocol (client -> server JSON messages):
  {"action": "subscribe",   "symbols": ["AAPL", "MSFT"]}
  {"action": "unsubscribe", "symbols": ["AAPL"]}
  {"action": "list"}
  {"action": "ping"}

Server -> client:
  {"type": "connected",  "user_id": 1, "subscriptions": ["AAPL", ...]}
  {"type": "subscribed", "subscriptions": [...]}
  {"type": "unsubscribed", "subscriptions": [...]}
  {"type": "list",       "subscriptions": [...]}
  {"type": "pong"}
  {"type": "price",      "data": {symbol, price, change, change_percent, ...}}
  {"type": "alert",      "data": {rule_id, symbol, message, ...}}
  {"type": "error",      "message": "..."}
"""
from __future__ import annotations

import logging

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.core.security import decode_token
from app.db.session import AsyncSessionLocal
from app.services import watchlist_service
from app.services.user_service import get_user_by_id
from app.streaming.ws_hub import get_ws_hub

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
) -> None:
    # ---- Auth (before accept, so unauthorized clients get a clean close) ----
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as e:
        log.warning("WS auth failed: %s", e)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    async with AsyncSessionLocal() as db:
        user = await get_user_by_id(db, user_id)
        if user is None or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        # Auto-subscribe to current watchlist
        items = await watchlist_service.list_for_user(db, user)
        initial_symbols = [it.symbol for it in items]

    await websocket.accept()
    hub = get_ws_hub()
    await hub.connect(websocket, user_id)
    if initial_symbols:
        await hub.subscribe(user_id, initial_symbols)

    try:
        await websocket.send_json(
            {
                "type": "connected",
                "user_id": user_id,
                "subscriptions": sorted(await hub.list_subscriptions(user_id)),
            }
        )

        while True:
            try:
                msg = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception as e:
                await websocket.send_json(
                    {"type": "error", "message": f"Invalid message: {e}"}
                )
                continue

            action = (msg.get("action") or "").lower()
            if action == "subscribe":
                symbols = msg.get("symbols", []) or []
                subs = await hub.subscribe(user_id, symbols)
                await websocket.send_json(
                    {"type": "subscribed", "subscriptions": sorted(subs)}
                )
            elif action == "unsubscribe":
                symbols = msg.get("symbols", []) or []
                subs = await hub.unsubscribe(user_id, symbols)
                await websocket.send_json(
                    {"type": "unsubscribed", "subscriptions": sorted(subs)}
                )
            elif action == "list":
                subs = await hub.list_subscriptions(user_id)
                await websocket.send_json(
                    {"type": "list", "subscriptions": sorted(subs)}
                )
            elif action == "ping":
                await websocket.send_json({"type": "pong"})
            else:
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown action: {action}"}
                )
    finally:
        await hub.disconnect(websocket, user_id)
        log.debug("WS disconnected: user=%s", user_id)
