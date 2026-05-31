from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Side = Literal["buy", "sell"]


class TradeRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    side: Side
    qty: float = Field(gt=0, le=1_000_000)

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class TradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    side: str
    qty: float
    price: float
    value: float
    executed_at: datetime


class PositionView(BaseModel):
    symbol: str
    qty: float
    avg_cost: float
    current_price: float
    market_value: float
    pnl: float
    pnl_pct: float
    currency: str | None = None


class PortfolioSnapshot(BaseModel):
    starting_cash: float
    cash: float
    positions_value: float
    total_value: float
    total_pnl: float
    total_pnl_pct: float
    positions: list[PositionView]
