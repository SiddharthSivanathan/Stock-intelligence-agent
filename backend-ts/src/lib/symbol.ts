/**
 * Shared symbol validation — Yahoo-style tickers.
 *
 * Allowed extras beyond [A-Z0-9]:
 *   .  class shares / foreign exchange (BRK.B, RELIANCE.NS)
 *   -  class shares (RDS-A)
 *   ^  indices (^GSPC, ^NSEI)
 */
export class InvalidSymbolError extends Error {
  statusCode = 422;
  constructor(public symbol: string) {
    super(`Invalid symbol: ${symbol}`);
  }
}

export function validateSymbol(raw: string): string {
  const s = (raw ?? "").trim().toUpperCase();
  const stripped = s.replace(/[.\-^]/g, "");
  if (!s || s.length > 20 || !/^[A-Z0-9]+$/.test(stripped)) {
    throw new InvalidSymbolError(raw);
  }
  return s;
}
