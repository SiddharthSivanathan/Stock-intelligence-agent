from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WatchlistItemBase(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, v: str) -> str:
        v = v.strip().upper()
        # Allow '.' (RELIANCE.NS), '-' (BRK-B), '^' (indices like ^NSEI).
        stripped = v.replace(".", "").replace("-", "").replace("^", "")
        if not v or not stripped.isalnum():
            raise ValueError(
                "Symbol must be alphanumeric (optionally with '.', '-', or '^')"
            )
        return v


class WatchlistItemCreate(WatchlistItemBase):
    pass


class WatchlistItemOut(WatchlistItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
