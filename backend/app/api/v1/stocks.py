"""Market-data endpoints (public — no auth required in Phase 2).

  GET /stocks/{symbol}/quote
  GET /stocks/{symbol}/history?interval=1d&range=1mo
  GET /stocks/{symbol}/profile
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.market import Candle, CompanyProfile, Quote
from app.services import market_data

router = APIRouter()


def _validate_symbol(symbol: str) -> str:
    s = symbol.strip().upper()
    # Strip the chars Yahoo allows in tickers before the alnum check:
    #   . / - for class shares (BRK.B, RDS-A), . for foreign exchanges (RELIANCE.NS)
    #   ^ for indices (^NSEI, ^GSPC, ^BSESN, ^DJI)
    stripped = s.replace(".", "").replace("-", "").replace("^", "")
    if not s or len(s) > 20 or not stripped.isalnum():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid symbol",
        )
    return s


@router.get("/{symbol}/quote", response_model=Quote, summary="Current quote")
async def get_quote(symbol: str) -> Quote:
    return await market_data.get_quote(_validate_symbol(symbol))


@router.get(
    "/{symbol}/history",
    response_model=list[Candle],
    summary="OHLC bars; pass interval (e.g. 1d, 1h, 15m) and range (e.g. 1mo, 1y)",
)
async def get_history(
    symbol: str,
    interval: Annotated[str, Query()] = "1d",
    range_: Annotated[str, Query(alias="range")] = "1mo",
) -> list[Candle]:
    return await market_data.get_history(
        _validate_symbol(symbol), interval=interval, range_=range_
    )


@router.get("/{symbol}/profile", response_model=CompanyProfile, summary="Company profile")
async def get_profile(symbol: str) -> CompanyProfile:
    return await market_data.get_profile(_validate_symbol(symbol))
