from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.document import Document
from app.db.models.user import User


async def create(
    db: AsyncSession,
    user: User,
    *,
    title: str,
    source_type: str,
    filename: str | None = None,
    source_url: str | None = None,
    symbol: str | None = None,
    collection_name: str = "documents",
) -> Document:
    doc = Document(
        user_id=user.id,
        title=title,
        source_type=source_type,
        filename=filename,
        source_url=source_url,
        symbol=symbol.upper() if symbol else None,
        collection_name=collection_name,
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def get_for_user(
    db: AsyncSession, user: User, doc_id: int
) -> Document | None:
    res = await db.execute(
        select(Document).where(
            Document.id == doc_id, Document.user_id == user.id
        )
    )
    return res.scalar_one_or_none()


async def list_for_user(db: AsyncSession, user: User) -> list[Document]:
    res = await db.execute(
        select(Document)
        .where(Document.user_id == user.id)
        .order_by(Document.created_at.desc())
    )
    return list(res.scalars())


async def delete(db: AsyncSession, doc: Document) -> None:
    await db.delete(doc)
    await db.commit()
