"""Watchlist endpoints — all require auth.

Route order matters: /quotes must come before /{symbol} so it isn't shadowed.
"""
from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbDep
from app.schemas.market import Quote
from app.schemas.watchlist import WatchlistItemCreate, WatchlistItemOut
from app.services import market_data, watchlist_service

router = APIRouter()


@router.get(
    "/quotes",
    response_model=list[Quote],
    summary="Live quotes for every symbol in the user's watchlist",
)
async def watchlist_quotes(current_user: CurrentUser, db: DbDep) -> list[Quote]:
    items = await watchlist_service.list_for_user(db, current_user)
    return await market_data.get_quotes_batch([it.symbol for it in items])


@router.get("", response_model=list[WatchlistItemOut])
async def list_watchlist(
    current_user: CurrentUser, db: DbDep
) -> list[WatchlistItemOut]:
    items = await watchlist_service.list_for_user(db, current_user)
    return [WatchlistItemOut.model_validate(it) for it in items]


@router.post(
    "",
    response_model=WatchlistItemOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_to_watchlist(
    payload: WatchlistItemCreate,
    current_user: CurrentUser,
    db: DbDep,
) -> WatchlistItemOut:
    item = await watchlist_service.add_for_user(
        db, current_user, symbol=payload.symbol, notes=payload.notes
    )
    return WatchlistItemOut.model_validate(item)


@router.delete(
    "/{symbol}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,  # FastAPI 0.115 infers from `-> None`; suppress it
)
async def remove_from_watchlist(
    symbol: str, current_user: CurrentUser, db: DbDep
) -> None:
    # Atomic find-and-delete inside watchlist_service; raises NotFoundError
    # if the symbol isn't on the user's list — handled by the global
    # AppError exception handler registered in app.main.
    await watchlist_service.remove_for_user(db, current_user, symbol)
