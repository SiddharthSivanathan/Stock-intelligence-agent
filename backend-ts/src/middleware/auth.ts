/**
 * Bearer-token auth middleware (preHandler).
 *
 * Attaches `req.currentUser` when a valid access token is present, otherwise
 * responds 401 in the same shape the Python backend used: `{ detail: "..." }`.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { decodeToken } from "../lib/security.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: {
      id: number;
      email: string;
      fullName: string | null;
      isActive: boolean;
      isSuperuser: boolean;
      createdAt: Date;
    };
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return reply.code(401).send({ detail: "Not authenticated" });
  }
  const token = header.slice(7).trim();

  let claims;
  try {
    claims = decodeToken(token);
  } catch {
    return reply.code(401).send({ detail: "Invalid or expired token" });
  }

  if (claims.type !== "access") {
    return reply.code(401).send({ detail: "Token is not an access token" });
  }

  const userId = Number.parseInt(claims.sub, 10);
  if (!Number.isFinite(userId)) {
    return reply.code(401).send({ detail: "Malformed token" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    return reply.code(401).send({ detail: "User not found or inactive" });
  }

  req.currentUser = user;
}
