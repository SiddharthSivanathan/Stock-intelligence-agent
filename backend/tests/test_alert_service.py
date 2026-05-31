"""Tests for the pure-function half of alert_service."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services import alert_service


def make_rule(**overrides):
    base = {
        "condition_type": "price_change_pct",
        "direction": "above",
        "threshold": 3.0,
        "cooldown_seconds": 3600,
        "last_triggered_at": None,
        "symbol": "AAPL",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class TestMatches:
    def test_above_fires_when_change_exceeds(self):
        rule = make_rule(direction="above", threshold=2.0)
        assert alert_service._matches(rule, 2.01) is True

    def test_above_does_not_fire_when_below(self):
        rule = make_rule(direction="above", threshold=5.0)
        assert alert_service._matches(rule, 4.99) is False

    def test_above_strictly_greater(self):
        rule = make_rule(direction="above", threshold=3.0)
        assert alert_service._matches(rule, 3.0) is False

    def test_below_fires_when_change_below(self):
        rule = make_rule(direction="below", threshold=-2.0)
        assert alert_service._matches(rule, -2.5) is True

    def test_below_does_not_fire_when_above(self):
        rule = make_rule(direction="below", threshold=-2.0)
        assert alert_service._matches(rule, 0.5) is False

    def test_unknown_condition_returns_false(self):
        rule = make_rule(condition_type="volume_spike", direction="above")
        assert alert_service._matches(rule, 100.0) is False


class TestCooldown:
    def test_never_triggered_is_not_in_cooldown(self):
        rule = make_rule(last_triggered_at=None)
        now = datetime.now(timezone.utc)
        assert alert_service._within_cooldown(rule, now) is False

    def test_recent_trigger_is_in_cooldown(self):
        now = datetime.now(timezone.utc)
        rule = make_rule(
            last_triggered_at=now - timedelta(seconds=30),
            cooldown_seconds=60,
        )
        assert alert_service._within_cooldown(rule, now) is True

    def test_old_trigger_is_not_in_cooldown(self):
        now = datetime.now(timezone.utc)
        rule = make_rule(
            last_triggered_at=now - timedelta(seconds=120),
            cooldown_seconds=60,
        )
        assert alert_service._within_cooldown(rule, now) is False


class TestFormatMessage:
    def test_above_phrasing(self):
        rule = make_rule(direction="above", threshold=2.5, symbol="MSFT")
        msg = alert_service._format_message(rule, price=410.5, change_pct=3.1)
        assert "MSFT" in msg
        assert "rose above" in msg
        assert "+2.50%" in msg
        assert "$410.50" in msg
        assert "+3.10%" in msg

    def test_below_phrasing(self):
        rule = make_rule(direction="below", threshold=-3.0, symbol="TSLA")
        msg = alert_service._format_message(rule, price=180.2, change_pct=-4.5)
        assert "TSLA" in msg
        assert "dropped below" in msg
        assert "-3.00%" in msg
        assert "-4.50%" in msg
