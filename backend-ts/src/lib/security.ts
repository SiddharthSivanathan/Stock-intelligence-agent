/**
 * Password hashing + JWT helpers.
 *
 * Mirrors the Python app.core.security module so an access token issued by
 * either backend is accepted by the other (same secret, same algorithm,
 * same claim shape: { sub, exp, iat, type }).
 */
import bcrypt from "bcryptjs";
import jwt, { type SignOptions, type JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

type TokenType = "access" | "refresh";

interface TokenClaims extends JwtPayload {
  sub: string;
  type: TokenType;
}

function sign(userId: number, type: TokenType, ttlSeconds: number): string {
  const opts: SignOptions = {
    algorithm: config.JWT_ALGORITHM,
    expiresIn: ttlSeconds,
  };
  return jwt.sign({ sub: String(userId), type }, config.JWT_SECRET, opts);
}

export function createAccessToken(userId: number): string {
  return sign(userId, "access", config.ACCESS_TOKEN_MINUTES * 60);
}

export function createRefreshToken(userId: number): string {
  return sign(userId, "refresh", config.REFRESH_TOKEN_DAYS * 24 * 60 * 60);
}

export function decodeToken(token: string): TokenClaims {
  const decoded = jwt.verify(token, config.JWT_SECRET, {
    algorithms: [config.JWT_ALGORITHM],
  });
  if (typeof decoded === "string") throw new Error("Unexpected string payload");
  return decoded as TokenClaims;
}
