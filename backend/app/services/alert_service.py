"""AlertRule CRUD + the evaluator the alert consumer calls on each tick."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.alert import AlertEvent, AlertRule
from app.db.models.user import User
from app.db.session import AsyncSessionLocal
from app.notifications.factory import get_notifier
from app.schemas.alert import AlertRuleCreate, AlertRuleUpdate

log = logging.getLogger(__name__)


# ---------- CRUD ----------


async def create_rule(
    db: AsyncSession, user: User, payload: AlertRuleCreate
) -> AlertRule:
    rule = AlertRule(
        user_id=user.id,
        symbol=payload.symbol,
        condition_type=payload.condition_type,
        direction=payload.direction,
        threshold=payload.threshold,
        cooldown_seconds=payload.cooldown_seconds,
        notify_via_ws=payload.notify_via_ws,
        notify_via_email=payload.notify_via_email,
        re_run_analysis=payload.re_run_analysis,
        is_active=payload.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def list_rules_for_user(
    db: AsyncSession, user: User
) -> list[AlertRule]:
    res = await db.execute(
        select(AlertRule)
        .where(AlertRule.user_id == user.id)
        .order_by(AlertRule.created_at.desc())
    )
    return list(res.scalars())


async def get_rule_for_user(
    db: AsyncSession, user: User, rule_id: int
) -> AlertRule | None:
    res = await db.execute(
        select(AlertRule).where(
            AlertRule.id == rule_id, AlertRule.user_id == user.id
        )
    )
    return res.scalar_one_or_none()


async def update_rule(
    db: AsyncSession, rule: AlertRule, payload: AlertRuleUpdate
) -> AlertRule:
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(rule, k, v)
    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, rule: AlertRule) -> None:
    await db.delete(rule)
    await db.commit()


async def list_events_for_user(
    db: AsyncSession, user: User, *, limit: int = 50
) -> list[AlertEvent]:
    res = await db.execute(
        select(AlertEvent)
        .where(AlertEvent.user_id == user.id)
        .order_by(AlertEvent.fired_at.desc())
        .limit(limit)
    )
    return list(res.scalars())


# ---------- Evaluation (called from alert consumer) ----------


def _matches(rule: AlertRule, change_pct: float) -> bool:
    if rule.condition_type != "price_change_pct":
        return False
    if rule.direction == "above":
        return change_pct > rule.threshold
    if rule.direction == "below":
        return change_pct < rule.threshold
    return False


def _within_cooldown(rule: AlertRule, now: datetime) -> bool:
    if rule.last_triggered_at is None:
        return False
    elapsed = (now - rule.last_triggered_at).total_seconds()
    return elapsed < rule.cooldown_seconds


def _format_message(rule: AlertRule, price: float, change_pct: float) -> str:
    direction_word = "rose above" if rule.direction == "above" else "dropped below"
    return (
        f"{rule.symbol} {direction_word} {rule.threshold:+.2f}% — "
        f"now ${price:.2f} ({change_pct:+.2f}%)"
    )


async def evaluate_tick(fields: dict, hub) -> None:
    """Called once per stream message. Loads active rules for the symbol,
    fires any that match (respecting cooldown), notifies, and optionally
    schedules a full /analyze re-run."""
    symbol = (fields.get("symbol") or "").upper()
    if not symbol:
        return
    try:
        price = float(fields.get("price") or 0.0)
        change_pct = float(fields.get("change_percent") or 0.0)
    except (TypeError, ValueError):
        return

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(AlertRule).where(
                AlertRule.symbol == symbol,
                AlertRule.is_active.is_(True),
            )
        )
        rules = list(res.scalars())
        if not rules:
            return

        for rule in rules:
            if not _matches(rule, change_pct):
                continue
            if _within_cooldown(rule, now):
                continue

            message = _format_message(rule, price, change_pct)
            event = AlertEvent(
                rule_id=rule.id,
                user_id=rule.user_id,
                symbol=symbol,
                price_at_fire=price,
                change_pct_at_fire=change_pct,
                message=message,
                extra={"threshold": rule.threshold, "direction": rule.direction},
            )
            rule.last_triggered_at = now
            db.add(event)
            await db.commit()
            await db.refresh(event)

            log.info(
                "Alert fired: rule=%s symbol=%s change=%.2f%%",
                rule.id,
                symbol,
                change_pct,
            )

            if rule.notify_via_ws:
                await hub.broadcast_alert(
                    rule.user_id,
                    {
                        "rule_id": rule.id,
                        "event_id": event.id,
                        "symbol": symbol,
                        "price": price,
                        "change_percent": change_pct,
                        "message": message,
                        "fired_at": event.fired_at.isoformat(),
                    },
                )

            if rule.notify_via_email:
                # Fire-and-forget: SMTP roundtrip shouldn't block the consumer.
                asyncio.create_task(
                    _send_email_for_event(
                        user_id=rule.user_id,
                        subject=f"[Stock Intel] {symbol} alert",
                        body=message,
                    )
                )

            if rule.re_run_analysis:
                # Fire and forget — don't block the consumer loop on a 30s analysis.
                asyncio.create_task(
                    _trigger_analysis_in_background(rule.user_id, symbol)
                )


async def _trigger_analysis_in_background(user_id: int, symbol: str) -> None:
    # Imported lazily to keep the alert evaluator import-light.
    from app.services.analysis_service import run_and_persist_analysis

    try:
        await run_and_persist_analysis(user_id=user_id, symbol=symbol)
    except Exception:
        log.exception(
            "Auto-triggered analysis failed (user=%s symbol=%s)",
            user_id,
            symbol,
        )


async def _send_email_for_event(*, user_id: int, subject: str, body: str) -> None:
    """Look up the user's email and send via the configured notifier."""
    try:
        async with AsyncSessionLocal() as db:
            user = await db.get(User, user_id)
            if user is None or not user.email:
                return
            await get_notifier().send(to=user.email, subject=subject, body=body)
    except Exception:
        log.exception("Email notification failed (user=%s)", user_id)
