"""Abstract market-data provider interface.

A provider is a pure adapter: takes a symbol + parameters, returns Pydantic DTOs.
It must not touch the cache, the DB, or any other infrastructure — those live in
the service layer that *uses* the provider.

Why an interface?
  Lets us swap yfinance for Finnhub / Alpha Vantage / Polygon in one place,
  and lets agents inject a fake provider in tests without monkey-patching.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.market import Candle, CompanyProfile, Quote


class MarketDataProvider(ABC):
    name: str

    @abstractmethod
    async def get_quote(self, symbol: str) -> Quote: ...

    @abstractmethod
    async def get_history(
        self, symbol: str, *, interval: str, range_: str
    ) -> list[Candle]: ...

    @abstractmethod
    async def get_profile(self, symbol: str) -> CompanyProfile: ...
