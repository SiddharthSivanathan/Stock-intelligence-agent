from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.agent_log import AgentLog
from app.db.models.user import User


async def list_for_user(
    db: AsyncSession,
    user: User,
    *,
    agent: str | None = None,
    symbol: str | None = None,
    limit: int = 50,
) -> list[AgentLog]:
    stmt = (
        select(AgentLog)
        .where(AgentLog.user_id == user.id)
        .order_by(AgentLog.created_at.desc())
        .limit(limit)
    )
    if agent:
        stmt = stmt.where(AgentLog.agent_name == agent)
    if symbol:
        stmt = stmt.where(AgentLog.symbol == symbol.upper())
    res = await db.execute(stmt)
    return list(res.scalars())
