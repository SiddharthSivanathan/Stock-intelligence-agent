"""Tests for app.ai.tools.indicators — pure pandas math."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.ai.tools import indicators


@pytest.fixture
def trending_up() -> pd.Series:
    return pd.Series(range(1, 101), dtype=float)


@pytest.fixture
def trending_down() -> pd.Series:
    return pd.Series(range(100, 0, -1), dtype=float)


@pytest.fixture
def random_walk() -> pd.Series:
    rng = np.random.default_rng(42)
    return pd.Series(100 + rng.normal(0, 1, 200).cumsum())


class TestSMA:
    def test_sma_of_linear_series_is_midpoint(self, trending_up: pd.Series):
        # SMA(5) on [1..N]: at position i (0-indexed >=4), mean of [i-4..i] = i-2
        s = indicators.sma(trending_up, 5)
        assert s.iloc[4] == pytest.approx(3.0)
        assert s.iloc[99] == pytest.approx(98.0)

    def test_sma_first_n_minus_1_is_nan(self, trending_up: pd.Series):
        s = indicators.sma(trending_up, 5)
        assert s.iloc[:4].isna().all()
        assert not pd.isna(s.iloc[4])


class TestRSI:
    def test_rsi_is_100_for_monotonically_rising(self, trending_up: pd.Series):
        # All gains, no losses → RSI saturates to 100
        r = indicators.rsi(trending_up, 14)
        assert r.iloc[-1] == pytest.approx(100.0, abs=0.01)

    def test_rsi_is_zero_for_monotonically_falling(self, trending_down: pd.Series):
        r = indicators.rsi(trending_down, 14)
        assert r.iloc[-1] == pytest.approx(0.0, abs=0.01)

    def test_rsi_bounded(self, random_walk: pd.Series):
        r = indicators.rsi(random_walk, 14).dropna()
        assert (r >= 0).all() and (r <= 100).all()


class TestMACD:
    def test_macd_shape(self, random_walk: pd.Series):
        m, s, h = indicators.macd(random_walk)
        assert len(m) == len(random_walk)
        assert len(s) == len(random_walk)
        # Histogram = macd - signal
        np.testing.assert_allclose(
            (h - (m - s)).dropna().values, 0.0, atol=1e-9
        )

    def test_macd_positive_when_uptrending(self, trending_up: pd.Series):
        m, _, _ = indicators.macd(trending_up)
        assert m.iloc[-1] > 0


class TestBollinger:
    def test_bands_ordered(self, random_walk: pd.Series):
        upper, mid, lower = indicators.bollinger(random_walk, 20, 2.0)
        live = pd.concat([upper, mid, lower], axis=1).dropna()
        assert (live.iloc[:, 0] >= live.iloc[:, 1]).all()
        assert (live.iloc[:, 1] >= live.iloc[:, 2]).all()


class TestVolatility:
    def test_zero_for_flat_series(self):
        s = pd.Series([100.0] * 50)
        # log returns are all 0 -> stdev 0 -> annualized 0
        assert indicators.annualized_volatility(s, 20) == pytest.approx(0.0)

    def test_positive_for_noisy_series(self, random_walk: pd.Series):
        v = indicators.annualized_volatility(random_walk, 20)
        assert v > 0


class TestMaxDrawdown:
    def test_drawdown_of_uptrend_is_zero(self, trending_up: pd.Series):
        assert indicators.max_drawdown(trending_up) == pytest.approx(0.0)

    def test_drawdown_of_downtrend(self, trending_down: pd.Series):
        # Series 100..1; max drawdown is (1-100)/100 = -0.99
        assert indicators.max_drawdown(trending_down) == pytest.approx(-0.99)


class TestSnapshot:
    def test_snapshot_keys(self, random_walk: pd.Series):
        snap = indicators.compute_technical_snapshot(
            closes=random_walk,
            highs=random_walk + 1,
            lows=random_walk - 1,
        )
        expected = {
            "last_close", "sma_20", "sma_50", "sma_200",
            "rsi_14", "macd", "macd_signal", "macd_histogram",
            "bollinger_upper", "bollinger_middle", "bollinger_lower",
            "volatility_annualized_pct", "max_drawdown_pct",
            "period_high", "period_low",
        }
        assert set(snap.keys()) == expected
