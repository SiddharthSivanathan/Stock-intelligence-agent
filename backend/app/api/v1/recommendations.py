"""Recommendation read endpoints.

  GET /recommendations               list this user's recommendations
  GET /recommendations/{id}          retrieve one, full trace + insights
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep
from app.core.exceptions import NotFoundError
from app.schemas.recommendation import AnalysisResult
from app.services import recommendation_service

router = APIRouter()


@router.get("", response_model=list[AnalysisResult])
async def list_recommendations(
    current_user: CurrentUser,
    db: DbDep,
    symbol: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[AnalysisResult]:
    rows = await recommendation_service.list_for_user(
        db, current_user, symbol=symbol, limit=limit
    )
    return [AnalysisResult.from_recommendation(r) for r in rows]


@router.get("/{rec_id}", response_model=AnalysisResult)
async def get_recommendation(
    rec_id: int, current_user: CurrentUser, db: DbDep
) -> AnalysisResult:
    row = await recommendation_service.get_for_user(db, current_user, rec_id)
    if row is None:
        raise NotFoundError(f"Recommendation {rec_id} not found")
    return AnalysisResult.from_recommendation(row)
