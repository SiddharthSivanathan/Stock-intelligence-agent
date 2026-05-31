"""Recommendation Agent.

Unique among our agents: its evidence is OTHER AGENTS' outputs (no external
fetch). Wired by LangGraph: signal agents run in parallel, their outputs are
loaded into the recommendation input, and this agent synthesizes the verdict.

Tolerates partial input — if some signal agents failed, this agent still
produces a recommendation (lower confidence, "hold" bias).
"""
from __future__ import annotations

import json
import logging

from pydantic import BaseModel, Field, field_validator

from app.ai.agents.base_agent import BaseAgent, load_prompt
from app.ai.llm.base import ChatMessage
from app.db.models.insight import Insight
from app.schemas.agent import (
    FundamentalsInsight,
    NewsInsight,
    RiskInsight,
    SentimentInsight,
    TechnicalInsight,
)
from app.schemas.recommendation import RecommendationOutput

log = logging.getLogger(__name__)


class RecommendationAgentInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    news: NewsInsight | None = None
    technical: TechnicalInsight | None = None
    fundamentals: FundamentalsInsight | None = None
    sentiment: SentimentInsight | None = None
    risk: RiskInsight | None = None
    reflection_attempt: int = Field(default=0, ge=0, le=3)

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


_ACTION_TO_SENTIMENT = {
    "buy": "bullish",
    "hold": "neutral",
    "sell": "bearish",
}


class RecommendationAgent(
    BaseAgent[RecommendationAgentInput, RecommendationOutput]
):
    name = "recommendation"
    output_schema = RecommendationOutput
    prompt_filename = "recommendation.md"
    temperature = 0.2
    max_tokens = 2000

    async def gather_evidence(
        self,
        input_data: RecommendationAgentInput,
        *,
        user_id: int | None = None,
    ) -> dict:
        signals: dict[str, dict | None] = {
            "news": input_data.news.model_dump(mode="json") if input_data.news else None,
            "technical": (
                input_data.technical.model_dump(mode="json")
                if input_data.technical
                else None
            ),
            "fundamentals": (
                input_data.fundamentals.model_dump(mode="json")
                if input_data.fundamentals
                else None
            ),
            "sentiment": (
                input_data.sentiment.model_dump(mode="json")
                if input_data.sentiment
                else None
            ),
            "risk": input_data.risk.model_dump(mode="json") if input_data.risk else None,
        }
        available = sum(1 for v in signals.values() if v is not None)
        return {
            "signals": signals,
            "available_count": available,
            "reflection_attempt": input_data.reflection_attempt,
        }

    def build_messages(
        self, input_data: RecommendationAgentInput, evidence: dict
    ) -> list[ChatMessage]:
        system_prompt = load_prompt(self.prompt_filename)
        signals = evidence["signals"]
        available = evidence["available_count"]
        attempt = evidence["reflection_attempt"]

        lines: list[str] = []
        lines.append(f"Symbol: {input_data.symbol}")
        lines.append(f"Signal agents available: {available} of 5")
        if attempt > 0:
            lines.append(
                f"NOTE: This is reflection attempt #{attempt}. Your prior "
                f"recommendation had low confidence. Be more decisive — "
                f"identify the dominant factor."
            )
        lines.append("")

        for name, signal in signals.items():
            lines.append(f"--- {name.upper()} AGENT ---")
            if signal is None:
                lines.append("(no result — agent failed or was not run)")
            else:
                lines.append(json.dumps(signal, indent=2, default=str))
            lines.append("")

        lines.append("Produce the JSON recommendation now.")

        return [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content="\n".join(lines)),
        ]

    def build_insight_row(
        self,
        output: RecommendationOutput,
        *,
        user_id: int | None,
        evidence: dict | None = None,
    ) -> Insight:
        """Map action -> sentiment so the recommendation appears correctly in
        the unified insights feed alongside the signal agents."""
        data = output.model_dump(mode="json")
        return Insight(
            user_id=user_id,
            agent_name=self.name,
            symbol=str(data.get("symbol", "")).upper(),
            sentiment=_ACTION_TO_SENTIMENT.get(data.get("action")),
            confidence=data.get("confidence"),
            score=data.get("score"),
            summary=data.get("summary"),
            data=data,
        )
