"""Shared state for the analysis workflow.

LangGraph requires a TypedDict (or Pydantic model) as its state. Fields
annotated with `Annotated[..., operator.add]` are accumulated across parallel
branches; plain fields use last-write-wins (we only ever write each
agent-specific field from one node, so no conflict).
"""
from __future__ import annotations

import operator
from typing import Annotated, TypedDict


class AnalysisState(TypedDict, total=False):
    # Inputs (set by the caller)
    symbol: str
    user_id: int | None

    # Per-agent outputs (each populated by exactly one node)
    news_insight: dict | None
    technical_insight: dict | None
    fundamentals_insight: dict | None
    sentiment_insight: dict | None
    risk_insight: dict | None

    # Final recommendation
    recommendation: dict | None

    # Reflection bookkeeping
    reflection_attempts: int

    # Accumulating fields (parallel-safe — appended via operator.add)
    trace: Annotated[list[dict], operator.add]
    errors: Annotated[list[dict], operator.add]
