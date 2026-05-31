from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.recommendation import Recommendation
from app.db.models.user import User


async def list_for_user(
    db: AsyncSession,
    user: User,
    *,
    symbol: str | None = None,
    limit: int = 20,
) -> list[Recommendation]:
    stmt = (
        select(Recommendation)
        .where(Recommendation.user_id == user.id)
        .order_by(Recommendation.created_at.desc())
        .limit(limit)
    )
    if symbol:
        stmt = stmt.where(Recommendation.symbol == symbol.upper())
    res = await db.execute(stmt)
    return list(res.scalars())


async def get_for_user(
    db: AsyncSession, user: User, rec_id: int
) -> Recommendation | None:
    res = await db.execute(
        select(Recommendation).where(
            Recommendation.id == rec_id,
            Recommendation.user_id == user.id,
        )
    )
    return res.scalar_one_or_none()
