from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
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


class AlertRule(Base):
    """User-defined trigger condition watched by the alert evaluator.

    Phase 8 supports a single condition_type: 'price_change_pct' with
    direction 'above' / 'below' and a threshold. Phase 11 can extend
    to absolute prices, volume spikes, indicator crosses, etc.
    """

    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    condition_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="price_change_pct"
    )
    direction: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # 'above' | 'below'
    threshold: Mapped[float] = mapped_column(Float, nullable=False)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    cooldown_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3600, server_default="3600"
    )
    notify_via_ws: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notify_via_email: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    re_run_analysis: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    last_triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
            f"<AlertRule id={self.id} {self.symbol} "
            f"{self.direction} {self.threshold}>"
        )


class AlertEvent(Base):
    """Fires when an AlertRule's condition is matched. One row per fire."""

    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("alert_rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    price_at_fire: Mapped[float | None] = mapped_column(Float, nullable=True)
    change_pct_at_fire: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    extra: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    fired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<AlertEvent id={self.id} rule={self.rule_id} "
            f"symbol={self.symbol}>"
        )
