"""Market-data orchestrator.

Sits between the API routes and the provider abstraction. Responsibilities:
  - Apply the read-through Redis cache with op-specific TTLs.
  - Fan out batch operations (e.g. quotes for a whole watchlist).

The cache TTLs are conservative — short enough that the dashboard feels live,
long enough that bursts of polling don't hammer the upstream API.
"""
from __future__ import annotations

import asyncio
import json
import logging

import yfinance as yf

from app.core.cache import cache_get, cache_set
from app.core.exceptions import NotFoundError, UpstreamError
from app.schemas.market import Candle, CompanyProfile, Quote
from app.services.providers.factory import (
    get_history_provider,
    get_profile_provider,
    get_quote_provider,
)


def _looks_like_bare_alpha(symbol: str) -> bool:
    """True if the symbol is 2-15 plain uppercase letters with no suffix/prefix.

    Used to decide whether to auto-retry with `.NS` (NSE) when Yahoo doesn't
    recognize the bare form — covers any Indian stock the user might type
    without enumerating thousands of tickers in the alias map.
    """
    return symbol.isalpha() and 2 <= len(symbol) <= 15

log = logging.getLogger(__name__)

QUOTE_TTL = 30           # seconds
HISTORY_TTL_INTRADAY = 60
HISTORY_TTL_DAILY = 300
PROFILE_TTL = 24 * 3600

_INTRADAY_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"}


def _history_ttl(interval: str) -> int:
    return HISTORY_TTL_INTRADAY if interval in _INTRADAY_INTERVALS else HISTORY_TTL_DAILY


async def get_quote(symbol: str) -> Quote:
    symbol = symbol.upper()
    key = f"quote:{symbol}"

    raw = await cache_get(key)
    if raw is not None:
        return Quote.model_validate_json(raw)

    try:
        quote = await get_quote_provider().get_quote(symbol)
    except NotFoundError:
        # NSE auto-fallback: user typed "IRFC" → try "IRFC.NS" before failing.
        # Only for bare alpha tickers (skip indices, symbols with suffix/dot).
        if _looks_like_bare_alpha(symbol):
            log.info("Quote miss for %s — retrying with .NS suffix", symbol)
            quote = await get_quote_provider().get_quote(f"{symbol}.NS")
        else:
            raise

    await cache_set(key, quote.model_dump_json(), QUOTE_TTL)
    return quote


async def get_history(symbol: str, *, interval: str, range_: str) -> list[Candle]:
    symbol = symbol.upper()
    key = f"history:{symbol}:{interval}:{range_}"

    raw = await cache_get(key)
    if raw is not None:
        return [Candle.model_validate(c) for c in json.loads(raw)]

    try:
        candles = await get_history_provider().get_history(
            symbol, interval=interval, range_=range_
        )
    except NotFoundError:
        if _looks_like_bare_alpha(symbol):
            log.info("History miss for %s — retrying with .NS suffix", symbol)
            candles = await get_history_provider().get_history(
                f"{symbol}.NS", interval=interval, range_=range_
            )
        else:
            raise

    serialized = json.dumps([c.model_dump(mode="json") for c in candles])
    await cache_set(key, serialized, _history_ttl(interval))
    return candles


async def get_profile(symbol: str) -> CompanyProfile:
    symbol = symbol.upper()
    key = f"profile:{symbol}"

    raw = await cache_get(key)
    if raw is not None:
        return CompanyProfile.model_validate_json(raw)

    try:
        profile = await get_profile_provider().get_profile(symbol)
    except NotFoundError:
        if _looks_like_bare_alpha(symbol):
            log.info("Profile miss for %s — retrying with .NS suffix", symbol)
            profile = await get_profile_provider().get_profile(f"{symbol}.NS")
        else:
            raise

    await cache_set(key, profile.model_dump_json(), PROFILE_TTL)
    return profile


async def get_fundamentals(symbol: str) -> dict:
    """Fundamental ratios from yfinance.info — cached 24h.

    Returns None for fields yfinance doesn't have for this symbol. Always
    safe to .get() from the result.
    """
    symbol = symbol.upper()
    key = f"fundamentals:{symbol}"

    raw = await cache_get(key)
    if raw is not None:
        return json.loads(raw)

    data = await asyncio.to_thread(_fetch_fundamentals_sync, symbol)
    # If yfinance returns an empty dict (or no useful fields), retry with .NS
    # for bare alpha tickers — same NSE-fallback pattern as quote/history.
    if not data.get("trailingPE") and not data.get("marketCap") and _looks_like_bare_alpha(symbol):
        log.info("Fundamentals miss for %s — retrying with .NS", symbol)
        ns_data = await asyncio.to_thread(_fetch_fundamentals_sync, f"{symbol}.NS")
        if ns_data and (ns_data.get("trailingPE") or ns_data.get("marketCap")):
            data = ns_data
    await cache_set(key, json.dumps(data, default=str), PROFILE_TTL)
    return data


def _fetch_fundamentals_sync(symbol: str) -> dict:
    info = yf.Ticker(symbol).info or {}
    # Whitelist the fields we actually use — keeps the payload small for
    # JSONB storage and the LLM prompt.
    fields = (
        "trailingPE", "forwardPE", "priceToBook", "priceToSalesTrailing12Months",
        "trailingPegRatio", "debtToEquity", "returnOnEquity", "returnOnAssets",
        "profitMargins", "operatingMargins", "revenueGrowth", "earningsGrowth",
        "currentRatio", "quickRatio", "dividendYield", "freeCashflow",
        "marketCap", "enterpriseValue", "enterpriseToEbitda", "beta",
        "sector", "industry", "totalRevenue", "totalDebt", "totalCash",
    )
    return {k: info.get(k) for k in fields}


async def get_quotes_batch(symbols: list[str]) -> list[Quote]:
    """Fetch quotes for many symbols concurrently. Silently skips failures
    so a single bad ticker doesn't break the whole dashboard widget."""
    if not symbols:
        return []

    async def _one(sym: str) -> Quote | None:
        try:
            return await get_quote(sym)
        except Exception as e:
            log.warning("Skipping %s in batch quote fetch: %s", sym, e)
            return None

    results = await asyncio.gather(*[_one(s) for s in symbols])
    return [q for q in results if q is not None]
