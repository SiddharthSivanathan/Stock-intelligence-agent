"""Picks the right provider for each operation.

Rules:
  - Quote   : Finnhub if FINNHUB_API_KEY is set (lower latency, real-time), else yfinance.
  - History : yfinance (Finnhub free tier dropped historical candles).
  - Profile : Finnhub if available (logo URL, normalized sectors), else yfinance.

Providers are cached so we don't reinstantiate per-request.
"""
from __future__ import annotations

from functools import lru_cache

from app.config import settings
from app.services.providers.base import MarketDataProvider
from app.services.providers.finnhub_provider import FinnhubProvider
from app.services.providers.yfinance_provider import YFinanceProvider


@lru_cache(maxsize=1)
def get_yfinance_provider() -> MarketDataProvider:
    return YFinanceProvider()


@lru_cache(maxsize=1)
def _finnhub() -> MarketDataProvider | None:
    if not settings.finnhub_api_key:
        return None
    return FinnhubProvider()


def get_quote_provider() -> MarketDataProvider:
    return _finnhub() or get_yfinance_provider()


def get_history_provider() -> MarketDataProvider:
    return get_yfinance_provider()


def get_profile_provider() -> MarketDataProvider:
    return _finnhub() or get_yfinance_provider()
