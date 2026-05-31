from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ConditionType = Literal["price_change_pct"]
Direction = Literal["above", "below"]


class AlertRuleCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    condition_type: ConditionType = "price_change_pct"
    direction: Direction
    threshold: float = Field(description="Percent for price_change_pct (e.g. 3.0 = 3%)")
    cooldown_seconds: int = Field(default=3600, ge=10, le=86400)
    notify_via_ws: bool = True
    notify_via_email: bool = False
    re_run_analysis: bool = False
    is_active: bool = True

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class AlertRuleUpdate(BaseModel):
    threshold: float | None = None
    direction: Direction | None = None
    cooldown_seconds: int | None = Field(default=None, ge=10, le=86400)
    notify_via_ws: bool | None = None
    notify_via_email: bool | None = None
    re_run_analysis: bool | None = None
    is_active: bool | None = None


class AlertRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    symbol: str
    condition_type: str
    direction: str
    threshold: float
    is_active: bool
    cooldown_seconds: int
    notify_via_ws: bool
    notify_via_email: bool
    re_run_analysis: bool
    last_triggered_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AlertEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_id: int
    symbol: str
    price_at_fire: float | None
    change_pct_at_fire: float | None
    message: str
    fired_at: datetime
