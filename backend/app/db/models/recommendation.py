from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Recommendation(Base):
    """A synthesized buy/hold/sell from the Recommendation Agent.

    Stores not just the verdict but also:
      - `contributing_signals`: per-agent weights and notes
      - `full_trace`: the LangGraph node timing + every agent's raw insight
      - `errors`: any node-level errors (partial failure tolerated)
    Together these make every run fully replayable in the Agent Monitor.
    """

    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(10), nullable=False)  # buy|hold|sell
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    contributing_signals: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )
    full_trace: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    errors: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )
    duration_ms: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<Recommendation id={self.id} symbol={self.symbol} "
            f"action={self.action} confidence={self.confidence}>"
        )
