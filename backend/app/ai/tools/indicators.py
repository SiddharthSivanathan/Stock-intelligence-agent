"""Technical indicators — pure math, no LLM.

The LLM never recomputes these. Python does the math; the LLM interprets the
numbers. This split is non-negotiable — LLMs are unreliable arithmetic engines.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def sma(closes: pd.Series, period: int) -> pd.Series:
    """Simple moving average."""
    return closes.rolling(window=period, min_periods=period).mean()


def ema(closes: pd.Series, period: int) -> pd.Series:
    """Exponential moving average."""
    return closes.ewm(span=period, adjust=False).mean()


def rsi(closes: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (Wilder's smoothing).

    Returns values in [0, 100]. Convention: <30 oversold, >70 overbought.
    All-gain windows (loss=0) yield 100 by definition; all-loss yield 0.
    """
    delta = closes.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    # Let division produce inf for loss=0 (gives RSI=100) and 0 for gain=0
    # (gives RSI=0). Suppress only the numpy divide-by-zero warning.
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = gain / loss
    result = 100 - (100 / (1 + rs))
    # When BOTH gain and loss are 0 (flat series), rs is NaN — leave as NaN
    # (we have no information). That's the only legitimately-NaN case.
    return result


def macd(
    closes: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """MACD line, signal line, histogram."""
    ema_fast = ema(closes, fast)
    ema_slow = ema(closes, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def bollinger(
    closes: pd.Series, period: int = 20, num_std: float = 2.0
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Bollinger Bands: (upper, middle, lower)."""
    middle = sma(closes, period)
    std = closes.rolling(window=period, min_periods=period).std()
    upper = middle + num_std * std
    lower = middle - num_std * std
    return upper, middle, lower


def annualized_volatility(closes: pd.Series, period: int = 20) -> float:
    """Annualized realized volatility from log returns (252 trading days)."""
    log_returns = np.log(closes / closes.shift(1))
    daily_vol = log_returns.rolling(window=period).std().iloc[-1]
    if pd.isna(daily_vol):
        return 0.0
    return float(daily_vol * np.sqrt(252))


def max_drawdown(closes: pd.Series) -> float:
    """Max peak-to-trough decline as a negative decimal (e.g. -0.25 = -25%)."""
    cummax = closes.cummax()
    drawdown = (closes - cummax) / cummax
    dd = drawdown.min()
    return float(dd) if not pd.isna(dd) else 0.0


def _last_float(s: pd.Series, ndigits: int = 2) -> float | None:
    """Pull the last value out of a Series, rounded; None if NaN/empty."""
    if s is None or len(s) == 0:
        return None
    v = s.iloc[-1]
    if pd.isna(v):
        return None
    return round(float(v), ndigits)


def compute_technical_snapshot(closes: pd.Series, highs: pd.Series, lows: pd.Series) -> dict:
    """One-shot helper: every indicator the Technical & Risk agents need."""
    last_close = _last_float(closes)
    sma_20 = _last_float(sma(closes, 20))
    sma_50 = _last_float(sma(closes, 50)) if len(closes) >= 50 else None
    sma_200 = _last_float(sma(closes, 200)) if len(closes) >= 200 else None
    rsi_14 = _last_float(rsi(closes, 14))

    macd_line, signal_line, hist = macd(closes)
    macd_v = _last_float(macd_line, 4)
    signal_v = _last_float(signal_line, 4)
    hist_v = _last_float(hist, 4)

    upper, middle, lower = bollinger(closes)
    bb_upper = _last_float(upper)
    bb_middle = _last_float(middle)
    bb_lower = _last_float(lower)

    vol = annualized_volatility(closes)
    mdd = max_drawdown(closes)

    return {
        "last_close": last_close,
        "sma_20": sma_20,
        "sma_50": sma_50,
        "sma_200": sma_200,
        "rsi_14": rsi_14,
        "macd": macd_v,
        "macd_signal": signal_v,
        "macd_histogram": hist_v,
        "bollinger_upper": bb_upper,
        "bollinger_middle": bb_middle,
        "bollinger_lower": bb_lower,
        "volatility_annualized_pct": round(vol * 100, 2),
        "max_drawdown_pct": round(mdd * 100, 2),
        "period_high": round(float(highs.max()), 2) if len(highs) else None,
        "period_low": round(float(lows.min()), 2) if len(lows) else None,
    }
