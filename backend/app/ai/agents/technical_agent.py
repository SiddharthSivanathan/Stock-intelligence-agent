"""Technical Agent.

Pipeline:
  1. Fetch ~6 months of daily candles
  2. Python computes SMA/EMA/RSI/MACD/Bollinger/volatility/max-drawdown
  3. LLM interprets the numbers and emits trend/momentum/signals

The agent does NOT ask the LLM to do arithmetic — that's done in pure pandas.
The LLM only labels and narrates.
"""
from __future__ import annotations

import logging

import pandas as pd
from pydantic import BaseModel, Field, field_validator

from app.ai.agents.base_agent import BaseAgent, load_prompt
from app.ai.llm.base import ChatMessage
from app.ai.tools.indicators import compute_technical_snapshot
from app.schemas.agent import TechnicalInsight
from app.services import market_data

log = logging.getLogger(__name__)


class TechnicalAgentInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    range_: str = Field(default="6mo")
    interval: str = Field(default="1d")

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class TechnicalAgent(BaseAgent[TechnicalAgentInput, TechnicalInsight]):
    name = "technical"
    output_schema = TechnicalInsight
    prompt_filename = "technical.md"
    temperature = 0.15
    max_tokens = 1200
    passthrough_evidence_keys = ("indicators", "period")

    async def gather_evidence(
        self, input_data: TechnicalAgentInput, *, user_id: int | None = None
    ) -> dict:
        candles = await market_data.get_history(
            input_data.symbol,
            interval=input_data.interval,
            range_=input_data.range_,
        )
        if len(candles) < 30:
            raise ValueError(
                f"Insufficient history for technical analysis ({len(candles)} bars, need >= 30)"
            )

        closes = pd.Series([c.close for c in candles])
        highs = pd.Series([c.high for c in candles])
        lows = pd.Series([c.low for c in candles])

        indicators = compute_technical_snapshot(closes, highs, lows)
        return {
            "symbol": input_data.symbol,
            "indicators": indicators,
            "period": f"{len(candles)} bars @ {input_data.interval} over {input_data.range_}",
        }

    def build_messages(
        self, input_data: TechnicalAgentInput, evidence: dict
    ) -> list[ChatMessage]:
        system_prompt = load_prompt(self.prompt_filename)
        ind = evidence["indicators"]

        # Format as plain key: value lines — easier for small models to read than JSON.
        lines = [f"Symbol: {input_data.symbol}", f"Period: {evidence['period']}", ""]
        lines.append("Indicators:")
        for k, v in ind.items():
            lines.append(f"  {k}: {v if v is not None else 'n/a'}")
        lines.append("")
        lines.append("Produce the JSON assessment now.")

        return [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content="\n".join(lines)),
        ]
