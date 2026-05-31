"""Risk Agent.

Pipeline:
  1. Fetch 1y of daily candles + balance-sheet ratios (parallel)
  2. Python computes volatility, max-drawdown
  3. LLM labels risk level and narrates risk factors

Score convention: INVERTED from price direction.
  +1.0 = very safe, attractive risk profile
  -1.0 = very risky, avoid
Phase 7's Recommendation Agent knows this.
"""
from __future__ import annotations

import asyncio
import logging

import pandas as pd
from pydantic import BaseModel, Field, field_validator

from app.ai.agents.base_agent import BaseAgent, load_prompt
from app.ai.llm.base import ChatMessage
from app.ai.tools.indicators import annualized_volatility, max_drawdown
from app.schemas.agent import RiskInsight
from app.services import market_data

log = logging.getLogger(__name__)


class RiskAgentInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    range_: str = Field(default="1y")

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class RiskAgent(BaseAgent[RiskAgentInput, RiskInsight]):
    name = "risk"
    output_schema = RiskInsight
    prompt_filename = "risk.md"
    temperature = 0.15
    max_tokens = 1200
    passthrough_evidence_keys = ("indicators", "period")

    async def gather_evidence(
        self, input_data: RiskAgentInput, *, user_id: int | None = None
    ) -> dict:
        history_task = market_data.get_history(
            input_data.symbol, interval="1d", range_=input_data.range_
        )
        funds_task = market_data.get_fundamentals(input_data.symbol)
        candles, funds = await asyncio.gather(history_task, funds_task)

        if len(candles) < 30:
            raise ValueError(
                f"Insufficient history for risk analysis ({len(candles)} bars)"
            )

        closes = pd.Series([c.close for c in candles])
        vol = annualized_volatility(closes)
        mdd = max_drawdown(closes)

        indicators = {
            "volatility_annualized_pct": round(vol * 100, 2),
            "max_drawdown_pct": round(mdd * 100, 2),
            "beta": funds.get("beta"),
            "debt_to_equity": funds.get("debtToEquity"),
            "current_ratio": funds.get("currentRatio"),
            "quick_ratio": funds.get("quickRatio"),
            "sector": funds.get("sector"),
            "industry": funds.get("industry"),
            "market_cap": funds.get("marketCap"),
        }

        return {
            "symbol": input_data.symbol,
            "indicators": indicators,
            "period": f"{len(candles)} daily bars over {input_data.range_}",
        }

    def build_messages(
        self, input_data: RiskAgentInput, evidence: dict
    ) -> list[ChatMessage]:
        system_prompt = load_prompt(self.prompt_filename)
        ind = evidence["indicators"]

        lines = [
            f"Symbol: {input_data.symbol}",
            f"Period: {evidence['period']}",
            "",
            "Risk indicators:",
        ]
        for k, v in ind.items():
            lines.append(f"  {k}: {v if v is not None else 'n/a'}")
        lines.append("")
        lines.append("Produce the JSON risk assessment now.")

        return [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content="\n".join(lines)),
        ]
