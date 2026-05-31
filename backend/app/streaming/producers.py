"""Background price producer.

Every PRICE_PRODUCER_INTERVAL_S, collect the union of every active user's
watchlist symbols and XADD their quotes to stream:prices.

This is a single producer for the whole app — efficient and avoids hitting
upstream APIs per-user. Quotes are still cached by market_data, so even if
two users share symbols we hit yfinance once.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.db.models.watchlist import WatchlistItem
from app.db.session import AsyncSessionLocal
from app.services import market_data
from app.streaming.base import StreamBus
from app.streaming.factory import PRICE_STREAM, get_stream_bus
from app.streaming.ws_hub import get_ws_hub

log = logging.getLogger(__name__)

PRICE_PRODUCER_INTERVAL_S = 15


async def _all_watched_symbols() -> set[str]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(WatchlistItem.symbol).distinct())
        return {row[0] for row in res.all() if row[0]}


async def _all_streamed_symbols() -> list[str]:
    """Union of watchlist symbols AND currently WS-subscribed symbols.

    This means viewing /analysis/DIA (not in any watchlist) still produces
    live ticks for as long as the chart page is open.
    """
    watched = await _all_watched_symbols()
    ws_subs = await get_ws_hub().all_subscribed_symbols()
    return sorted(watched | ws_subs)


async def price_producer_loop(
    bus: StreamBus | None = None,
    *,
    interval_s: int = PRICE_PRODUCER_INTERVAL_S,
) -> None:
    bus = bus or get_stream_bus()
    log.info("Price producer started (interval=%ds)", interval_s)
    try:
        while True:
            try:
                symbols = await _all_streamed_symbols()
                if symbols:
                    quotes = await market_data.get_quotes_batch(symbols)
                    for q in quotes:
                        await bus.xadd(
                            PRICE_STREAM,
                            {
                                "symbol": q.symbol,
                                "price": q.price,
                                "change": q.change,
                                "change_percent": q.change_percent,
                                "timestamp": q.timestamp.isoformat(),
                                "source": q.source,
                                "currency": q.currency or "USD",
                            },
                        )
                    log.debug(
                        "Produced %d price ticks for %d symbols",
                        len(quotes),
                        len(symbols),
                    )
            except Exception:
                log.exception("Price producer iteration failed")
            await asyncio.sleep(interval_s)
    except asyncio.CancelledError:
        log.info("Price producer cancelled — exiting cleanly")
        raise
