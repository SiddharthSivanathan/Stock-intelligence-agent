from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Document(Base):
    """Tracks an ingested document and its processing state.

    The actual chunks live in the Chroma collection named `collection_name`.
    We keep this row in Postgres so the dashboard can list documents,
    show ingestion status, and let users delete them.
    """

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # 'pdf' | 'html' | 'sec' | 'text' | 'url'
    source_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )  # 'pending' | 'processing' | 'ready' | 'failed'
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    collection_name: Mapped[str] = mapped_column(
        String(100), default="documents", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<Document id={self.id} title={self.title!r} "
            f"status={self.status} chunks={self.chunk_count}>"
        )
