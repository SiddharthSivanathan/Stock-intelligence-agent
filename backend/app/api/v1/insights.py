"""Insight read endpoints.

  GET /insights              list insights for the current user (filter by symbol/agent)
  GET /insights/{id}         retrieve a single insight (includes the full `data` blob)
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep
from app.core.exceptions import NotFoundError
from app.schemas.insight import InsightOut
from app.services import insight_service

router = APIRouter()


@router.get("", response_model=list[InsightOut])
async def list_insights(
    current_user: CurrentUser,
    db: DbDep,
    symbol: str | None = Query(default=None),
    agent: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[InsightOut]:
    rows = await insight_service.list_for_user(
        db, current_user, symbol=symbol, agent=agent, limit=limit
    )
    return [InsightOut.model_validate(r) for r in rows]


@router.get("/{insight_id}", response_model=InsightOut)
async def get_insight(
    insight_id: int, current_user: CurrentUser, db: DbDep
) -> InsightOut:
    row = await insight_service.get_for_user(db, current_user, insight_id)
    if row is None:
        raise NotFoundError(f"Insight {insight_id} not found")
    return InsightOut.model_validate(row)
