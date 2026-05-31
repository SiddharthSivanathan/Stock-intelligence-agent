"""Two consumers, two consumer groups on the same stream.

  ws_broadcasters    — pushes price updates to connected WebSockets
  alert_evaluators   — checks each tick against active AlertRules

Separate groups so each gets its own copy of every message, with its own
PEL (pending entries list) for retry semantics.
"""
from __future__ import annotations

import asyncio
import logging

from app.services import alert_service
from app.streaming.base import StreamBus
from app.streaming.factory import (
    ALERT_EVALUATOR_GROUP,
    PRICE_STREAM,
    WS_BROADCAST_GROUP,
    get_stream_bus,
)
from app.streaming.ws_hub import WSHub, get_ws_hub

log = logging.getLogger(__name__)

BLOCK_MS = 1000
BATCH = 50


async def price_consumer_loop(
    bus: StreamBus | None = None,
    hub: WSHub | None = None,
    *,
    consumer_name: str = "ws_1",
) -> None:
    bus = bus or get_stream_bus()
    hub = hub or get_ws_hub()
    await bus.xgroup_create(PRICE_STREAM, WS_BROADCAST_GROUP)
    log.info(
        "WS broadcaster consumer started (group=%s, consumer=%s)",
        WS_BROADCAST_GROUP,
        consumer_name,
    )
    try:
        while True:
            try:
                messages = await bus.xreadgroup(
                    WS_BROADCAST_GROUP,
                    consumer_name,
                    {PRICE_STREAM: ">"},
                    block_ms=BLOCK_MS,
                    count=BATCH,
                )
                for stream_name, entries in messages:
                    ack_ids: list[str] = []
                    for msg_id, fields in entries:
                        try:
                            await hub.broadcast_price(fields)
                        except Exception:
                            log.exception(
                                "broadcast_price failed for id=%s", msg_id
                            )
                        ack_ids.append(msg_id)
                    if ack_ids:
                        await bus.xack(stream_name, WS_BROADCAST_GROUP, *ack_ids)
            except Exception:
                log.exception("WS broadcaster iteration failed")
                await asyncio.sleep(1)
    except asyncio.CancelledError:
        log.info("WS broadcaster cancelled — exiting cleanly")
        raise


async def alert_evaluator_loop(
    bus: StreamBus | None = None,
    hub: WSHub | None = None,
    *,
    consumer_name: str = "evaluator_1",
) -> None:
    bus = bus or get_stream_bus()
    hub = hub or get_ws_hub()
    await bus.xgroup_create(PRICE_STREAM, ALERT_EVALUATOR_GROUP)
    log.info(
        "Alert evaluator started (group=%s, consumer=%s)",
        ALERT_EVALUATOR_GROUP,
        consumer_name,
    )
    try:
        while True:
            try:
                messages = await bus.xreadgroup(
                    ALERT_EVALUATOR_GROUP,
                    consumer_name,
                    {PRICE_STREAM: ">"},
                    block_ms=BLOCK_MS,
                    count=BATCH,
                )
                for stream_name, entries in messages:
                    ack_ids: list[str] = []
                    for msg_id, fields in entries:
                        try:
                            await alert_service.evaluate_tick(fields, hub)
                        except Exception:
                            log.exception(
                                "evaluate_tick failed for id=%s", msg_id
                            )
                        ack_ids.append(msg_id)
                    if ack_ids:
                        await bus.xack(
                            stream_name, ALERT_EVALUATOR_GROUP, *ack_ids
                        )
            except Exception:
                log.exception("Alert evaluator iteration failed")
                await asyncio.sleep(1)
    except asyncio.CancelledError:
        log.info("Alert evaluator cancelled — exiting cleanly")
        raise
