/**
 * Indicator math — sanity checks against known-shape inputs.
 * No mocking — just deterministic series.
 */
import { describe, it, expect } from "vitest";
import { computeIndicators } from "../src/ai/indicators.js";

function rampUp(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 + i);
}

describe("computeIndicators", () => {
  it("returns null when the series is too short", () => {
    expect(computeIndicators([1, 2, 3])).toBeNull();
  });

  it("on a strict uptrend, RSI is high and SMA20 is below the latest close", () => {
    const series = rampUp(60);
    const ind = computeIndicators(series);
    expect(ind).not.toBeNull();
    if (!ind) return;
    expect(ind.close).toBe(159);
    expect(ind.rsi_14).toBeGreaterThan(90);
    expect(ind.sma_20).not.toBeNull();
    expect(ind.sma_20!).toBeLessThan(ind.close);
    expect(ind.max_drawdown_pct).toBe(0);
  });

  it("uses 30-day window for volatility (positive on noisy series)", () => {
    const noisy = Array.from({ length: 60 }, (_, i) => 100 + (i % 7) - 3 + Math.sin(i));
    const ind = computeIndicators(noisy);
    expect(ind?.volatility_30d_pct).not.toBeNull();
    expect(ind!.volatility_30d_pct!).toBeGreaterThan(0);
  });
});
