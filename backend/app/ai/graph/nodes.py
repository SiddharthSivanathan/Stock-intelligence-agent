"""LangGraph node factories.

Each node:
  - Owns its own DB session (SQLAlchemy async sessions are NOT coroutine-safe;
    parallel branches must not share one).
  - Catches exceptions and writes to state.errors instead of crashing the run.
  - Appends a trace entry with timing for the Agent Monitor UI.

Nodes are constructed via factories so user_id is captured in closure, keeping
the LangGraph state JSON-serializable.
"""
from __future__ import annotations

import logging
import time
from typing import Awaitable, Callable

from app.ai.agents.fundamentals_agent import (
    FundamentalsAgent,
    FundamentalsAgentInput,
)
from app.ai.agents.news_agent import NewsAgent, NewsAgentInput
from app.ai.agents.recommendation_agent import (
    RecommendationAgent,
    RecommendationAgentInput,
)
from app.ai.agents.risk_agent import RiskAgent, RiskAgentInput
from app.ai.agents.sentiment_agent import SentimentAgent, SentimentAgentInput
from app.ai.agents.technical_agent import (
    TechnicalAgent,
    TechnicalAgentInput,
)
from app.ai.graph.state import AnalysisState
from app.db.session import AsyncSessionLocal
from app.schemas.agent import (
    FundamentalsInsight,
    NewsInsight,
    RiskInsight,
    SentimentInsight,
    TechnicalInsight,
)

log = logging.getLogger(__name__)

Node = Callable[[AnalysisState], Awaitable[dict]]


# -------------------------------------------------------------------
# Generic helper: run any signal agent and write its output to a key
# -------------------------------------------------------------------


async def _run_signal_node(
    *,
    node_name: str,
    state_key: str,
    user_id: int | None,
    agent_factory: Callable[[], object],
    input_factory: Callable[[str], object],
    symbol: str,
) -> dict:
    started = time.perf_counter()
    try:
        async with AsyncSessionLocal() as db:
            agent = agent_factory()
            result = await agent.run(
                input_factory(symbol), db=db, user_id=user_id
            )
        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            state_key: result.model_dump(mode="json"),
            "trace": [
                {
                    "node": node_name,
                    "status": "success",
                    "duration_ms": duration_ms,
                }
            ],
        }
    except Exception as e:
        duration_ms = int((time.perf_counter() - started) * 1000)
        log.warning("Node %s failed: %s", node_name, e)
        return {
            state_key: None,
            "errors": [{"node": node_name, "error": str(e)[:500]}],
            "trace": [
                {
                    "node": node_name,
                    "status": "failed",
                    "duration_ms": duration_ms,
                    "error": str(e)[:300],
                }
            ],
        }


# -------------------------------------------------------------------
# Signal-agent node factories
# -------------------------------------------------------------------


def make_news_node(user_id: int | None) -> Node:
    async def news_node(state: AnalysisState) -> dict:
        return await _run_signal_node(
            node_name="news",
            state_key="news_insight",
            user_id=user_id,
            agent_factory=NewsAgent,
            input_factory=lambda s: NewsAgentInput(symbol=s, limit=10),
            symbol=state["symbol"],
        )

    return news_node


def make_technical_node(user_id: int | None) -> Node:
    async def technical_node(state: AnalysisState) -> dict:
        return await _run_signal_node(
            node_name="technical",
            state_key="technical_insight",
            user_id=user_id,
            agent_factory=TechnicalAgent,
            input_factory=lambda s: TechnicalAgentInput(symbol=s),
            symbol=state["symbol"],
        )

    return technical_node


def make_fundamentals_node(user_id: int | None) -> Node:
    async def fundamentals_node(state: AnalysisState) -> dict:
        return await _run_signal_node(
            node_name="fundamentals",
            state_key="fundamentals_insight",
            user_id=user_id,
            agent_factory=FundamentalsAgent,
            input_factory=lambda s: FundamentalsAgentInput(symbol=s),
            symbol=state["symbol"],
        )

    return fundamentals_node


def make_sentiment_node(user_id: int | None) -> Node:
    async def sentiment_node(state: AnalysisState) -> dict:
        return await _run_signal_node(
            node_name="sentiment",
            state_key="sentiment_insight",
            user_id=user_id,
            agent_factory=SentimentAgent,
            input_factory=lambda s: SentimentAgentInput(symbol=s),
            symbol=state["symbol"],
        )

    return sentiment_node


def make_risk_node(user_id: int | None) -> Node:
    async def risk_node(state: AnalysisState) -> dict:
        return await _run_signal_node(
            node_name="risk",
            state_key="risk_insight",
            user_id=user_id,
            agent_factory=RiskAgent,
            input_factory=lambda s: RiskAgentInput(symbol=s),
            symbol=state["symbol"],
        )

    return risk_node


# -------------------------------------------------------------------
# Recommendation node — synthesizes the 5 signals
# -------------------------------------------------------------------


def make_recommendation_node(user_id: int | None) -> Node:
    async def recommendation_node(state: AnalysisState) -> dict:
        started = time.perf_counter()
        attempt = state.get("reflection_attempts", 0)

        # Re-hydrate Pydantic insight objects from the dict state.
        def _load(cls, payload):
            if payload is None:
                return None
            try:
                return cls.model_validate(payload)
            except Exception as e:
                log.warning("Failed to revive %s: %s", cls.__name__, e)
                return None

        news = _load(NewsInsight, state.get("news_insight"))
        technical = _load(TechnicalInsight, state.get("technical_insight"))
        fundamentals = _load(FundamentalsInsight, state.get("fundamentals_insight"))
        sentiment = _load(SentimentInsight, state.get("sentiment_insight"))
        risk = _load(RiskInsight, state.get("risk_insight"))

        try:
            async with AsyncSessionLocal() as db:
                agent = RecommendationAgent()
                result = await agent.run(
                    RecommendationAgentInput(
                        symbol=state["symbol"],
                        news=news,
                        technical=technical,
                        fundamentals=fundamentals,
                        sentiment=sentiment,
                        risk=risk,
                        reflection_attempt=attempt,
                    ),
                    db=db,
                    user_id=user_id,
                )
            duration_ms = int((time.perf_counter() - started) * 1000)
            return {
                "recommendation": result.model_dump(mode="json"),
                "reflection_attempts": attempt + 1,
                "trace": [
                    {
                        "node": "recommendation",
                        "status": "success",
                        "duration_ms": duration_ms,
                        "attempt": attempt + 1,
                    }
                ],
            }
        except Exception as e:
            duration_ms = int((time.perf_counter() - started) * 1000)
            log.exception("Recommendation node failed")
            return {
                "recommendation": None,
                "reflection_attempts": attempt + 1,
                "errors": [{"node": "recommendation", "error": str(e)[:500]}],
                "trace": [
                    {
                        "node": "recommendation",
                        "status": "failed",
                        "duration_ms": duration_ms,
                        "attempt": attempt + 1,
                        "error": str(e)[:300],
                    }
                ],
            }

    return recommendation_node
