from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_name: str
    symbol: str
    sentiment: str | None
    confidence: float | None
    score: float | None
    summary: str | None
    data: dict
    created_at: datetime
