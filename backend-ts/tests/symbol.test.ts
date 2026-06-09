import { describe, it, expect } from "vitest";
import { validateSymbol, InvalidSymbolError } from "../src/lib/symbol.js";

describe("validateSymbol", () => {
  it.each(["AAPL", "BRK.B", "RDS-A", "RELIANCE.NS", "^GSPC", "^NSEI"])(
    "accepts %s",
    (s) => {
      expect(validateSymbol(s)).toBe(s.toUpperCase());
    },
  );

  it.each(["", "  ", "!!!", "A".repeat(21), "AAPL$"])("rejects %s", (s) => {
    expect(() => validateSymbol(s)).toThrow(InvalidSymbolError);
  });

  it("uppercases lowercase input", () => {
    expect(validateSymbol("aapl")).toBe("AAPL");
  });
});
