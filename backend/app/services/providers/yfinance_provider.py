"""yfinance adapter.

yfinance is synchronous and DataFrame-based. We:
  - Wrap every call in asyncio.to_thread so the event loop stays free.
  - Defensively coerce missing/NaN fields to None.
  - Normalize timestamps to UTC.
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import yfinance as yf

from app.core.exceptions import NotFoundError, UpstreamError
from app.schemas.market import Candle, CompanyProfile, Quote
from app.services.providers._currency import infer_currency
from app.services.providers.base import MarketDataProvider

# Whitelisted parameters yfinance accepts. Reject early with a clear error
# instead of letting yfinance return an empty DataFrame.
_VALID_INTERVALS = {
    "1m", "2m", "5m", "15m", "30m", "60m", "90m",
    "1h", "1d", "5d", "1wk", "1mo", "3mo",
}
_VALID_RANGES = {
    "1d", "5d", "1mo", "3mo", "6mo",
    "1y", "2y", "5y", "10y", "ytd", "max",
}


def _safe_float(v: Any) -> float | None:
    try:
        if v is None:
            return None
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _safe_int(v: Any) -> int | None:
    try:
        if v is None:
            return None
        if isinstance(v, float) and math.isnan(v):
            return None
        return int(v)
    except (TypeError, ValueError):
        return None


class YFinanceProvider(MarketDataProvider):
    name = "yfinance"

    # ---------- Quote ----------
    async def get_quote(self, symbol: str) -> Quote:
        try:
            quote = await asyncio.to_thread(self._fetch_quote_sync, symbol)
        except Exception as e:
            raise UpstreamError(f"yfinance quote fetch failed: {e}") from e
        if quote is None:
            raise NotFoundError(f"Unknown symbol: {symbol}")
        return quote

    @staticmethod
    def _fetch_quote_sync(symbol: str) -> Quote | None:
        ticker = yf.Ticker(symbol)

        # Wrap every fast_info access — Yahoo rate-limit responses cause
        # yfinance to raise KeyError on internal fields like
        # 'currentTradingPeriod' when computing lastPrice/previousClose.
        def _safe_fast_get(key: str) -> Any:
            try:
                return ticker.fast_info.get(key)
            except Exception:
                return None

        last = _safe_float(_safe_fast_get("lastPrice"))
        prev = _safe_float(_safe_fast_get("previousClose"))

        # Fallback for rate-limited fast_info: pull last 2 daily closes from
        # the chart endpoint (different auth path than crumb-protected quote).
        if last is None or prev is None or last == 0:
            try:
                hist = ticker.history(period="5d", interval="1d", auto_adjust=False)
                if hist is not None and len(hist) >= 2:
                    last = float(hist["Close"].iloc[-1])
                    prev = float(hist["Close"].iloc[-2])
            except Exception:
                pass

        if last is None or prev is None or last == 0:
            return None

        change = last - prev
        change_pct = (change / prev * 100) if prev else 0.0

        # Currency: prefer Yahoo's reported value, fall back to suffix heuristic.
        raw_ccy = _safe_fast_get("currency")
        currency = str(raw_ccy).upper() if raw_ccy else infer_currency(symbol)

        return Quote(
            symbol=symbol.upper(),
            price=last,
            change=change,
            change_percent=change_pct,
            open=_safe_float(_safe_fast_get("open")),
            high=_safe_float(_safe_fast_get("dayHigh")),
            low=_safe_float(_safe_fast_get("dayLow")),
            previous_close=prev,
            volume=_safe_int(_safe_fast_get("lastVolume")),
            timestamp=datetime.now(timezone.utc),
            source="yfinance",
            currency=currency,
        )

    # ---------- History ----------
    async def get_history(
        self, symbol: str, *, interval: str, range_: str
    ) -> list[Candle]:
        if interval not in _VALID_INTERVALS:
            raise ValueError(f"interval must be one of {sorted(_VALID_INTERVALS)}")
        if range_ not in _VALID_RANGES:
            raise ValueError(f"range must be one of {sorted(_VALID_RANGES)}")
        try:
            candles = await asyncio.to_thread(
                self._fetch_history_sync, symbol, interval, range_
            )
        except Exception as e:
            raise UpstreamError(f"yfinance history fetch failed: {e}") from e
        if not candles:
            raise NotFoundError(f"No history for {symbol}")
        return candles

    @staticmethod
    def _fetch_history_sync(symbol: str, interval: str, range_: str) -> list[Candle]:
        df = yf.Ticker(symbol).history(
            period=range_, interval=interval, auto_adjust=False
        )
        if df is None or df.empty:
            return []

        candles: list[Candle] = []
        for ts, row in df.iterrows():
            # ts is a pandas Timestamp (tz-aware if intraday, tz-naive otherwise)
            dt: datetime = ts.to_pydatetime()
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)

            volume = row.get("Volume")
            candles.append(
                Candle(
                    timestamp=dt,
                    open=float(row["Open"]),
                    high=float(row["High"]),
                    low=float(row["Low"]),
                    close=float(row["Close"]),
                    volume=int(volume) if pd.notna(volume) else 0,
                )
            )
        return candles

    # ---------- Profile ----------
    async def get_profile(self, symbol: str) -> CompanyProfile:
        try:
            info = await asyncio.to_thread(self._fetch_profile_sync, symbol)
        except Exception as e:
            raise UpstreamError(f"yfinance profile fetch failed: {e}") from e
        if not info or not (info.get("longName") or info.get("shortName")):
            raise NotFoundError(f"No profile for {symbol}")
        return CompanyProfile(
            symbol=symbol.upper(),
            name=info.get("longName") or info.get("shortName") or symbol,
            sector=info.get("sector"),
            industry=info.get("industry"),
            market_cap=_safe_int(info.get("marketCap")),
            country=info.get("country"),
            currency=info.get("currency"),
            website=info.get("website"),
            description=info.get("longBusinessSummary"),
            logo_url=None,
        )

    @staticmethod
    def _fetch_profile_sync(symbol: str) -> dict[str, Any]:
        return yf.Ticker(symbol).info or {}
