/**
 * Auth endpoints — drop-in replacement for the Python /auth/* routes.
 *
 *   POST /auth/signup    JSON { email, password, full_name? }
 *   POST /auth/login     application/x-www-form-urlencoded { username, password }
 *                        (OAuth2 password flow — keeps the React frontend unchanged)
 *   POST /auth/refresh   JSON { refresh_token }
 *   GET  /auth/me        Bearer-protected, returns the current user
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import {
  createAccessToken,
  createRefreshToken,
  decodeToken,
  hashPassword,
  verifyPassword,
} from "../lib/security.js";
import { requireAuth } from "../middleware/auth.js";
import {
  loginFormSchema,
  refreshSchema,
  signupSchema,
  toUserOut,
} from "../schemas/auth.js";

export default async function authRoutes(app: FastifyInstance) {
  app.post("/signup", async (req, reply) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ detail: parsed.error.flatten() });
    }
    const { email, password, full_name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ detail: "Email already registered" });
    }

    const user = await prisma.user.create({
      data: {
        email,
        fullName: full_name ?? null,
        hashedPassword: await hashPassword(password),
      },
    });

    return reply.code(201).send(toUserOut(user));
  });

  // OAuth2 password flow uses form-encoded bodies — @fastify/formbody handles it.
  app.post("/login", async (req, reply) => {
    const parsed = loginFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ detail: parsed.error.flatten() });
    }
    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: username } });
    if (!user || !user.isActive || !(await verifyPassword(password, user.hashedPassword))) {
      return reply
        .code(401)
        .header("WWW-Authenticate", "Bearer")
        .send({ detail: "Incorrect email or password" });
    }

    return {
      access_token: createAccessToken(user.id),
      refresh_token: createRefreshToken(user.id),
      token_type: "bearer",
    };
  });

  app.post("/refresh", async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ detail: parsed.error.flatten() });
    }

    let claims;
    try {
      claims = decodeToken(parsed.data.refresh_token);
    } catch {
      return reply.code(401).send({ detail: "Invalid refresh token" });
    }
    if (claims.type !== "refresh") {
      return reply.code(401).send({ detail: "Token is not a refresh token" });
    }

    const userId = Number.parseInt(claims.sub, 10);
    if (!Number.isFinite(userId)) {
      return reply.code(401).send({ detail: "Malformed token" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return reply.code(401).send({ detail: "User not found or inactive" });
    }

    return {
      access_token: createAccessToken(user.id),
      refresh_token: createRefreshToken(user.id),
      token_type: "bearer",
    };
  });

  app.get("/me", { preHandler: requireAuth }, async (req) => {
    // requireAuth guarantees currentUser exists.
    return toUserOut(req.currentUser!);
  });
}
