/**
 * Pure unit tests — no DB, no network.
 *   - bcrypt round-trip
 *   - JWT create + decode
 *   - JWT rejects tampered tokens
 */
import { describe, it, expect, beforeAll } from "vitest";

process.env.JWT_SECRET ??= "x".repeat(64);
process.env.DATABASE_URL ??= "postgresql://stockai:stockai@localhost:5432/stockai";

// imported after env is set
const { hashPassword, verifyPassword, createAccessToken, decodeToken } = await import(
  "../src/lib/security.js"
);

describe("password hashing", () => {
  it("round-trips", async () => {
    const hash = await hashPassword("hunter2-supersecret");
    expect(await verifyPassword("hunter2-supersecret", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("JWT", () => {
  it("creates an access token whose sub matches the user id", () => {
    const token = createAccessToken(42);
    const claims = decodeToken(token);
    expect(claims.sub).toBe("42");
    expect(claims.type).toBe("access");
    expect(typeof claims.exp).toBe("number");
  });

  it("rejects a tampered token", () => {
    const token = createAccessToken(7);
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a") + "b";
    expect(() => decodeToken(tampered)).toThrow();
  });
});
