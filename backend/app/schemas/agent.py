"""Agent-facing schemas.

Per-agent input + output models, the API request DTOs that wrap them, and
the AgentLog read-DTO.

Output schemas intentionally OMIT raw numeric passthroughs (indicators,
metrics, sample posts). Those are merged into the persisted JSONB via
BaseAgent.passthrough_evidence_keys so the LLM never has to echo numbers
back (faster, cheaper, no hallucination risk on figures).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------- Shared building blocks ----------


Sentiment = Literal["bullish", "neutral", "bearish"]


def _upper_symbol(v: str) -> str:
    return v.strip().upper()


class _SymbolMixin:
    @field_validator("symbol")
    @classmethod
    def _norm(cls, v: str) -> str:
        return _upper_symbol(v)


# ---------- News Agent ----------


class NewsHeadlineOut(BaseModel):
    title: str
    url: str
    impact: Sentiment


class NewsInsight(_SymbolMixin, BaseModel):
    symbol: str
    sentiment: Sentiment
    confidence: float = Field(ge=0.0, le=1.0)
    score: float = Field(ge=-1.0, le=1.0)
    summary: str
    key_themes: list[str] = Field(default_factory=list, max_length=10)
    notable_headlines: list[NewsHeadlineOut] = Field(
        default_factory=list, max_length=10
    )


class NewsAgentRunRequest(_SymbolMixin, BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    limit: int = Field(default=10, ge=1, le=30)


# ---------- Technical Agent ----------


Trend = Literal["uptrend", "sideways", "downtrend"]
Momentum = Literal[
    "strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"
]


class TechnicalInsight(_SymbolMixin, BaseModel):
    symbol: str
    sentiment: Sentiment
    confidence: float = Field(ge=0.0, le=1.0)
    score: float = Field(ge=-1.0, le=1.0)
    summary: str
    trend: Trend
    momentum: Momentum
    signals: list[str] = Field(default_factory=list, max_length=10)


class TechnicalAgentRunRequest(_SymbolMixin, BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    range_: str = Field(default="6mo", alias="range")
    interval: str = Field(default="1d")


# ---------- Fundamentals Agent ----------


Valuation = Literal["undervalued", "fairly_valued", "overvalued", "unclear"]
FinancialHealth = Literal["strong", "stable", "weak", "distressed", "unclear"]


class FundamentalsInsight(_SymbolMixin, BaseModel):
    symbol: str
    sentiment: Sentiment
    confidence: float = Field(ge=0.0, le=1.0)
    score: float = Field(ge=-1.0, le=1.0)
    summary: str
    valuation: Valuation
    financial_health: FinancialHealth
    strengths: list[str] = Field(default_factory=list, max_length=6)
    risks: list[str] = Field(default_factory=list, max_length=6)


class FundamentalsAgentRunRequest(_SymbolMixin, BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    use_rag: bool = Field(
        default=True,
        description=(
            "Augment with relevant chunks from user's uploaded financial docs"
        ),
    )


# ---------- Sentiment Agent (social / crowd mood) ----------


CrowdMood = Literal[
    "fearful", "cautious", "neutral", "optimistic", "euphoric"
]
Volume = Literal["low", "moderate", "high", "viral"]


class SentimentInsight(_SymbolMixin, BaseModel):
    symbol: str
    sentiment: Sentiment
    confidence: float = Field(ge=0.0, le=1.0)
    score: float = Field(ge=-1.0, le=1.0)
    summary: str
    crowd_mood: CrowdMood
    discussion_volume: Volume
    notable_topics: list[str] = Field(default_factory=list, max_length=8)


class SentimentAgentRunRequest(_SymbolMixin, BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    limit: int = Field(default=25, ge=5, le=50)


# ---------- Risk Agent ----------


RiskLevel = Literal["low", "moderate", "elevated", "high", "extreme"]


class RiskInsight(_SymbolMixin, BaseModel):
    symbol: str
    # For risk: sentiment is the bull/bear read of the RISK ITSELF —
    # bullish = low risk attractive, bearish = high risk avoid.
    sentiment: Sentiment
    confidence: float = Field(ge=0.0, le=1.0)
    # Score: -1 (very risky) to +1 (very safe). Inverted from price-direction
    # convention so Recommendation Agent can sum scores directionally.
    score: float = Field(ge=-1.0, le=1.0)
    summary: str
    risk_level: RiskLevel
    risk_factors: list[str] = Field(default_factory=list, max_length=8)


class RiskAgentRunRequest(_SymbolMixin, BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    range_: str = Field(default="1y", alias="range")


# ---------- Agent log read-DTO ----------


class AgentLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_name: str
    symbol: str | None
    status: str
    duration_ms: int
    error: str | None
    provider: str | None
    model: str | None
    created_at: datetime
