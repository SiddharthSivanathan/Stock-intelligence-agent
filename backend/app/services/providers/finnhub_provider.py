"""Finnhub adapter.

Native async via httpx. We only cover quote + profile here — Finnhub's free tier
no longer exposes historical candles, so the service layer routes history to
yfinance even when Finnhub is configured.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx

from app.config import settings
from app.core.exceptions import NotFoundError, UpstreamError
from app.schemas.market import Candle, CompanyProfile, Quote
from app.services.providers._currency import infer_currency
from app.services.providers.base import MarketDataProvider


class FinnhubProvider(MarketDataProvider):
    name = "finnhub"
    BASE_URL = "https://finnhub.io/api/v1"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.finnhub_api_key
        if not self.api_key:
            raise ValueError("FINNHUB_API_KEY is required for FinnhubProvider")

    async def get_quote(self, symbol: str) -> Quote:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                r = await client.get(
                    f"{self.BASE_URL}/quote",
                    params={"symbol": symbol.upper(), "token": self.api_key},
                )
                r.raise_for_status()
            except httpx.HTTPError as e:
                raise UpstreamError(f"Finnhub quote fetch failed: {e}") from e
            data = r.json()

        current = data.get("c")
        if not current:
            raise NotFoundError(f"Unknown symbol: {symbol}")

        current_f = float(current)
        prev = float(data.get("pc") or 0.0)
        change = current_f - prev
        change_pct = (change / prev * 100) if prev else 0.0
        ts = data.get("t")
        timestamp = (
            datetime.fromtimestamp(int(ts), tz=timezone.utc)
            if ts
            else datetime.now(timezone.utc)
        )

        return Quote(
            symbol=symbol.upper(),
            price=current_f,
            change=change,
            change_percent=change_pct,
            open=float(data["o"]) if data.get("o") else None,
            high=float(data["h"]) if data.get("h") else None,
            low=float(data["l"]) if data.get("l") else None,
            previous_close=prev or None,
            volume=None,  # /quote does not return volume
            timestamp=timestamp,
            source="finnhub",
            # Finnhub /quote doesn't include currency; infer from symbol.
            currency=infer_currency(symbol),
        )

    async def get_history(
        self, symbol: str, *, interval: str, range_: str
    ) -> list[Candle]:
        raise NotImplementedError(
            "FinnhubProvider does not implement history; route via yfinance"
        )

    async def get_profile(self, symbol: str) -> CompanyProfile:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                r = await client.get(
                    f"{self.BASE_URL}/stock/profile2",
                    params={"symbol": symbol.upper(), "token": self.api_key},
                )
                r.raise_for_status()
            except httpx.HTTPError as e:
                raise UpstreamError(f"Finnhub profile fetch failed: {e}") from e
            data = r.json()

        if not data or not data.get("name"):
            raise NotFoundError(f"No profile for {symbol}")

        market_cap = data.get("marketCapitalization")  # in $M
        return CompanyProfile(
            symbol=symbol.upper(),
            name=data["name"],
            sector=data.get("finnhubIndustry"),
            industry=data.get("finnhubIndustry"),
            market_cap=int(market_cap * 1_000_000) if market_cap else None,
            country=data.get("country"),
            currency=data.get("currency"),
            website=data.get("weburl"),
            description=None,
            logo_url=data.get("logo"),
        )
