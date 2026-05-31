"""Run the full LangGraph workflow and persist a Recommendation row.

Extracted from the /analyze endpoint so background callers (e.g. the alert
evaluator's `re_run_analysis`) can use the same logic without duplicating
the persistence wiring.
"""
from __future__ import annotations

import logging
import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.graph.workflow import build_analysis_workflow
from app.db.models.recommendation import Recommendation
from app.db.session import AsyncSessionLocal

log = logging.getLogger(__name__)


async def run_and_persist_analysis(
    *,
    user_id: int,
    symbol: str,
    db: AsyncSession | None = None,
) -> Recommendation:
    """Run the workflow and persist a Recommendation row.

    Pass `db` to commit in the caller's transaction. Omit it to use a
    fresh session (use this from background callers).

    Raises RuntimeError if the workflow produced no recommendation.
    """
    started = time.perf_counter()

    workflow = build_analysis_workflow(user_id=user_id)
    initial_state = {
        "symbol": symbol.upper(),
        "user_id": user_id,
        "reflection_attempts": 0,
    }
    final_state = await workflow.ainvoke(initial_state)

    rec_data = final_state.get("recommendation")
    if not rec_data:
        errors = final_state.get("errors", [])
        raise RuntimeError(
            f"Workflow produced no recommendation. Errors: {errors!r}"
        )

    duration_ms = int((time.perf_counter() - started) * 1000)

    rec = Recommendation(
        user_id=user_id,
        symbol=symbol.upper(),
        action=rec_data["action"],
        confidence=float(rec_data["confidence"]),
        score=float(rec_data["score"]),
        summary=rec_data["summary"],
        reasoning=rec_data["reasoning"],
        contributing_signals=rec_data.get("contributing_signals", []),
        full_trace={
            "trace": final_state.get("trace", []),
            "insights": {
                "news": final_state.get("news_insight"),
                "technical": final_state.get("technical_insight"),
                "fundamentals": final_state.get("fundamentals_insight"),
                "sentiment": final_state.get("sentiment_insight"),
                "risk": final_state.get("risk_insight"),
            },
            "reflection_attempts": final_state.get("reflection_attempts", 0),
        },
        errors=final_state.get("errors", []),
        duration_ms=duration_ms,
    )

    if db is None:
        async with AsyncSessionLocal() as own_db:
            own_db.add(rec)
            await own_db.commit()
            await own_db.refresh(rec)
    else:
        db.add(rec)
        await db.commit()
        await db.refresh(rec)

    log.info(
        "Analysis for %s persisted as Recommendation id=%s action=%s",
        symbol,
        rec.id,
        rec.action,
    )
    return rec
