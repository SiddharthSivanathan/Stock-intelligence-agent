"""Market-data DTOs returned over HTTP."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class Quote(BaseModel):
    symbol: str
    price: float
    change: float = Field(description="price - previous_close")
    change_percent: float = Field(description="(change / previous_close) * 100")
    open: float | None = None
    high: float | None = None
    low: float | None = None
    previous_close: float | None = None
    volume: int | None = None
    timestamp: datetime
    source: str = Field(description="Provider that served this quote, e.g. 'yfinance'")
    currency: str | None = Field(
        default=None,
        description="ISO 4217 code (USD, INR, GBP, ...) — drives UI currency symbol",
    )


class Candle(BaseModel):
    """A single OHLC bar."""

    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class CompanyProfile(BaseModel):
    symbol: str
    name: str
    sector: str | None = None
    industry: str | None = None
    market_cap: int | None = None
    country: str | None = None
    currency: str | None = None
    website: str | None = None
    description: str | None = None
    logo_url: str | None = None
