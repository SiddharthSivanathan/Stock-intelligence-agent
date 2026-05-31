"""Aggregate router. New v1 modules register themselves here."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    agents,
    alerts,
    auth,
    health,
    insights,
    llm,
    portfolio,
    rag,
    recommendations,
    stocks,
    watchlist,
    ws,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
api_router.include_router(watchlist.router, prefix="/watchlist", tags=["watchlist"])
api_router.include_router(llm.router, prefix="/llm", tags=["llm"])
api_router.include_router(rag.router, prefix="/rag", tags=["rag"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(insights.router, prefix="/insights", tags=["insights"])
api_router.include_router(
    recommendations.router, prefix="/recommendations", tags=["recommendations"]
)
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])
# WebSocket endpoint (path: /api/v1/ws)
api_router.include_router(ws.router, tags=["ws"])
