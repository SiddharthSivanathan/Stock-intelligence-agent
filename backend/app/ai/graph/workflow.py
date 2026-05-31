"""Compile the analysis workflow.

Topology:

                       START
                         |
        +----------+-----+-----+----------+
        |          |     |     |          |
      news    technical fund. sentiment  risk
        |          |     |     |          |
        +----------+-----+-----+----------+
                         |
                  recommendation  <----+
                         |             |
                    route_reflection --+  (if confidence < threshold)
                         |
                        END

  - Fan-out from START runs the 5 signal agents in parallel.
  - All 5 join at `recommendation` (barrier — waits for all 5).
  - Reflection edge: if confidence is borderline AND attempts < 2,
    we route back to `recommendation` for a more decisive re-prompt.
"""
from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from app.ai.graph.nodes import (
    make_fundamentals_node,
    make_news_node,
    make_recommendation_node,
    make_risk_node,
    make_sentiment_node,
    make_technical_node,
)
from app.ai.graph.state import AnalysisState

log = logging.getLogger(__name__)

# Threshold below which we re-prompt the Recommendation Agent.
REFLECTION_CONFIDENCE_THRESHOLD = 0.4
MAX_REFLECTION_ATTEMPTS = 2


def route_reflection(state: AnalysisState) -> str:
    rec = state.get("recommendation")
    attempts = state.get("reflection_attempts", 0)

    if not rec:
        # Recommendation failed outright — nothing to reflect on.
        return "end"

    confidence = float(rec.get("confidence") or 0.0)
    if (
        confidence < REFLECTION_CONFIDENCE_THRESHOLD
        and attempts < MAX_REFLECTION_ATTEMPTS
    ):
        log.info(
            "Reflecting on low-confidence recommendation (%.2f, attempt %d)",
            confidence,
            attempts,
        )
        return "reflect"
    return "end"


def build_analysis_workflow(*, user_id: int | None):
    """Construct + compile the LangGraph for one analysis run.

    The graph is built per-request so user_id can be captured in closure
    without putting it into the (JSON-serializable) state.
    """
    builder = StateGraph(AnalysisState)

    # Node names must NOT clash with state keys in langgraph 0.2.x. The
    # state has a `recommendation` field, so the node is named `synthesize`.
    # Per-agent nodes use names that don't clash with state keys (which use
    # the `_insight` suffix).
    builder.add_node("news", make_news_node(user_id))
    builder.add_node("technical", make_technical_node(user_id))
    builder.add_node("fundamentals", make_fundamentals_node(user_id))
    builder.add_node("sentiment", make_sentiment_node(user_id))
    builder.add_node("risk", make_risk_node(user_id))
    builder.add_node("synthesize", make_recommendation_node(user_id))

    # Fan out from START to all 5 signal agents (parallel).
    for node in ("news", "technical", "fundamentals", "sentiment", "risk"):
        builder.add_edge(START, node)

    # Barrier — all 5 must complete before synthesis runs.
    for node in ("news", "technical", "fundamentals", "sentiment", "risk"):
        builder.add_edge(node, "synthesize")

    # Conditional: either reflect (loop back to synthesize) or end.
    builder.add_conditional_edges(
        "synthesize",
        route_reflection,
        {"reflect": "synthesize", "end": END},
    )

    return builder.compile()
