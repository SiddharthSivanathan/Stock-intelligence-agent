"""Recommendation DTOs.

  ContributingSignal     — one entry per agent that the recommendation weighted
  RecommendationOutput   — the LLM's structured output (also stored in `insights.data`)
  AnalyzeRequest         — POST /agents/analyze body
  AnalysisResult         — POST /agents/analyze response + GET /recommendations entries
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Action = Literal["buy", "hold", "sell"]


class ContributingSignal(BaseModel):
    agent: str
    sentiment: str | None = None
    score: float | None = None
    weight: float = Field(ge=0.0, le=1.0)
    note: str


class RecommendationOutput(BaseModel):
    """LLM output schema for the Recommendation Agent."""

    symbol: str
    action: Action
    confidence: float = Field(ge=0.0, le=1.0)
    score: float = Field(ge=-1.0, le=1.0)
    summary: str
    reasoning: str
    contributing_signals: list[ContributingSignal] = Field(
        default_factory=list, max_length=10
    )

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class AnalyzeRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class AnalysisResult(BaseModel):
    """API response: a saved Recommendation row, enriched with the LangGraph trace
    and the raw per-agent insights."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    action: Action
    confidence: float
    score: float
    summary: str
    reasoning: str
    contributing_signals: list[ContributingSignal]
    insights: dict
    trace: list[dict]
    errors: list[dict]
    duration_ms: int
    created_at: datetime

    @classmethod
    def from_recommendation(cls, rec) -> "AnalysisResult":
        ft = rec.full_trace or {}
        return cls(
            id=rec.id,
            symbol=rec.symbol,
            action=rec.action,
            confidence=rec.confidence,
            score=rec.score,
            summary=rec.summary,
            reasoning=rec.reasoning,
            contributing_signals=[
                ContributingSignal.model_validate(s)
                for s in (rec.contributing_signals or [])
            ],
            insights=ft.get("insights", {}),
            trace=ft.get("trace", []),
            errors=rec.errors or [],
            duration_ms=rec.duration_ms,
            created_at=rec.created_at,
        )
