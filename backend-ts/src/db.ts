/**
 * Single Prisma client instance.
 *
 * Hot reload (tsx) re-evaluates this module, so we cache the client on
 * `globalThis` to avoid opening a new pool every save.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.APP_ENV === "dev" ? ["warn", "error"] : ["error"],
  });

if (process.env.APP_ENV !== "prod") globalForPrisma.prisma = prisma;
