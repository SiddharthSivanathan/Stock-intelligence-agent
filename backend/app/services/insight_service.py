from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.insight import Insight
from app.db.models.user import User


async def list_for_user(
    db: AsyncSession,
    user: User,
    *,
    symbol: str | None = None,
    agent: str | None = None,
    limit: int = 50,
) -> list[Insight]:
    stmt = (
        select(Insight)
        .where(Insight.user_id == user.id)
        .order_by(Insight.created_at.desc())
        .limit(limit)
    )
    if symbol:
        stmt = stmt.where(Insight.symbol == symbol.upper())
    if agent:
        stmt = stmt.where(Insight.agent_name == agent)
    res = await db.execute(stmt)
    return list(res.scalars())


async def get_for_user(
    db: AsyncSession, user: User, insight_id: int
) -> Insight | None:
    res = await db.execute(
        select(Insight).where(
            Insight.id == insight_id, Insight.user_id == user.id
        )
    )
    return res.scalar_one_or_none()
