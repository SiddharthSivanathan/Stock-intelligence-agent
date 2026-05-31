from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.user import User
from app.db.models.watchlist import WatchlistItem


async def list_for_user(db: AsyncSession, user: User) -> list[WatchlistItem]:
    result = await db.execute(
        select(WatchlistItem)
        .where(WatchlistItem.user_id == user.id)
        .order_by(WatchlistItem.created_at.desc())
    )
    return list(result.scalars())


async def add_for_user(
    db: AsyncSession,
    user: User,
    *,
    symbol: str,
    notes: str | None,
) -> WatchlistItem:
    item = WatchlistItem(user_id=user.id, symbol=symbol, notes=notes)
    db.add(item)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValidationError(f"{symbol} is already in your watchlist")
    await db.refresh(item)
    return item


async def remove_for_user(db: AsyncSession, user: User, symbol: str) -> None:
    result = await db.execute(
        delete(WatchlistItem).where(
            WatchlistItem.user_id == user.id,
            WatchlistItem.symbol == symbol.upper(),
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise NotFoundError(f"{symbol} is not in your watchlist")
