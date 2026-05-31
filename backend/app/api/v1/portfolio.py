"""Paper-trading portfolio endpoints.

  GET  /portfolio           snapshot (cash, positions w/ live P&L, total)
  POST /portfolio/trade     buy or sell at the current quote
  GET  /portfolio/trades    trade history
  POST /portfolio/reset     wipe positions + restore starting cash
"""
from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbDep
from app.schemas.portfolio import (
    PortfolioSnapshot,
    TradeOut,
    TradeRequest,
)
from app.services import portfolio_service

router = APIRouter()


@router.get("", response_model=PortfolioSnapshot)
async def get_portfolio(current_user: CurrentUser, db: DbDep) -> PortfolioSnapshot:
    p = await portfolio_service.get_or_create(db, current_user)
    return await portfolio_service.snapshot(db, p)


@router.post(
    "/trade",
    response_model=TradeOut,
    status_code=status.HTTP_201_CREATED,
)
async def trade(
    req: TradeRequest, current_user: CurrentUser, db: DbDep
) -> TradeOut:
    p = await portfolio_service.get_or_create(db, current_user)
    t = await portfolio_service.execute_trade(
        db, p, symbol=req.symbol, side=req.side, qty=req.qty
    )
    return TradeOut.model_validate(t)


@router.get("/trades", response_model=list[TradeOut])
async def trades(
    current_user: CurrentUser,
    db: DbDep,
    limit: int = Query(default=50, ge=1, le=500),
) -> list[TradeOut]:
    p = await portfolio_service.get_or_create(db, current_user)
    rows = await portfolio_service.list_trades(db, p, limit=limit)
    return [TradeOut.model_validate(r) for r in rows]


@router.post("/reset", response_model=PortfolioSnapshot)
async def reset(current_user: CurrentUser, db: DbDep) -> PortfolioSnapshot:
    p = await portfolio_service.get_or_create(db, current_user)
    await portfolio_service.reset(db, p)
    return await portfolio_service.snapshot(db, p)
