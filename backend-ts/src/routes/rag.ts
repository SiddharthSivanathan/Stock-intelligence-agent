/**
 * RAG endpoints — all require auth.
 *
 *   POST   /rag/ingest/text       JSON { title, text, symbol? }
 *   POST   /rag/ingest/file       multipart file + symbol?
 *   POST   /rag/ingest/url        JSON { url, symbol? }
 *   POST   /rag/query             JSON { question, k?, symbol? }
 *   GET    /rag/documents         list user's docs
 *   GET    /rag/documents/:id     poll status
 *   DELETE /rag/documents/:id     remove (Postgres + Chroma)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import axios from "axios";
import { config } from "../config.js";
// pdf-parse runs test code on default-import load; the internal path skips it.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ingestDocument } from "../ai/rag/ingest.js";
import { answerQuestion } from "../ai/rag/retrieve.js";
import { deleteByDocumentId } from "../ai/vectorstore/chroma.js";

const textSchema = z.object({
  title: z.string().min(1).max(500),
  text: z.string().min(1),
  symbol: z.string().max(20).optional().nullable(),
});

const urlSchema = z.object({
  url: z.string().url().max(2000),
  symbol: z.string().max(20).optional().nullable(),
});

const querySchema = z.object({
  question: z.string().min(1),
  k: z.number().int().positive().max(20).optional(),
  symbol: z.string().max(20).optional().nullable(),
});

function serialize(d: {
  id: number;
  title: string;
  filename: string | null;
  sourceType: string;
  sourceUrl: string | null;
  symbol: string | null;
  chunkCount: number;
  status: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d.id,
    title: d.title,
    filename: d.filename,
    source_type: d.sourceType,
    source_url: d.sourceUrl,
    symbol: d.symbol,
    chunk_count: d.chunkCount,
    status: d.status,
    error: d.error,
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}

export default async function ragRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Short-circuit when Chroma isn't deployed (serverless / free-tier mode).
  app.addHook("preHandler", async (_req, reply) => {
    if (!config.CHROMA_ENABLED) {
      return reply
        .code(503)
        .send({ detail: "RAG is disabled in this deployment." });
    }
  });

  // --- ingest from raw text ---
  app.post("/ingest/text", async (req, reply) => {
    const parsed = textSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    const doc = await prisma.document.create({
      data: {
        userId: req.currentUser!.id,
        title: parsed.data.title,
        sourceType: "text",
        symbol: parsed.data.symbol?.toUpperCase() ?? null,
        status: "pending",
      },
    });
    // fire-and-forget background ingest
    void ingestDocument(doc.id, parsed.data.text);
    return reply.code(202).send(serialize(doc));
  });

  // --- ingest from URL (downloads HTML, strips tags) ---
  app.post("/ingest/url", async (req, reply) => {
    const parsed = urlSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    const { data: html } = await axios.get<string>(parsed.data.url, {
      timeout: 30_000,
      responseType: "text",
    });
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const doc = await prisma.document.create({
      data: {
        userId: req.currentUser!.id,
        title: parsed.data.url,
        sourceType: "url",
        sourceUrl: parsed.data.url,
        symbol: parsed.data.symbol?.toUpperCase() ?? null,
        status: "pending",
      },
    });
    void ingestDocument(doc.id, text);
    return reply.code(202).send(serialize(doc));
  });

  // --- ingest from uploaded file (PDF or plain text) ---
  app.post("/ingest/file", async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(415).send({ detail: "Expected multipart/form-data" });
    }
    let title = "uploaded";
    let symbol: string | null = null;
    let sourceType = "text";
    let text = "";
    let filename: string | null = null;

    for await (const part of req.parts()) {
      if (part.type === "file") {
        filename = part.filename;
        title = part.filename ?? "uploaded";
        const buf = await part.toBuffer();
        if ((part.mimetype || "").includes("pdf") || filename?.toLowerCase().endsWith(".pdf")) {
          sourceType = "pdf";
          const parsed = await pdfParse(buf);
          text = parsed.text;
        } else {
          sourceType = "text";
          text = buf.toString("utf8");
        }
      } else if (part.fieldname === "symbol" && part.type === "field") {
        symbol = String(part.value).toUpperCase();
      } else if (part.fieldname === "title" && part.type === "field") {
        title = String(part.value);
      }
    }

    if (!text.trim()) return reply.code(422).send({ detail: "No text extracted from upload" });

    const doc = await prisma.document.create({
      data: {
        userId: req.currentUser!.id,
        title,
        filename,
        sourceType,
        symbol,
        status: "pending",
      },
    });
    void ingestDocument(doc.id, text);
    return reply.code(202).send(serialize(doc));
  });

  // --- ask a question ---
  app.post("/query", async (req, reply) => {
    const parsed = querySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    return answerQuestion(parsed.data.question, {
      k: parsed.data.k,
      symbol: parsed.data.symbol?.toUpperCase() ?? undefined,
      userId: req.currentUser!.id,
    });
  });

  // --- list / get / delete documents ---
  app.get("/documents", async (req) => {
    const docs = await prisma.document.findMany({
      where: { userId: req.currentUser!.id },
      orderBy: { createdAt: "desc" },
    });
    return docs.map(serialize);
  });

  app.get<{ Params: { id: string } }>("/documents/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const doc = await prisma.document.findFirst({
      where: { id, userId: req.currentUser!.id },
    });
    if (!doc) return reply.code(404).send({ detail: "Not found" });
    return serialize(doc);
  });

  app.delete<{ Params: { id: string } }>("/documents/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const doc = await prisma.document.findFirst({
      where: { id, userId: req.currentUser!.id },
    });
    if (!doc) return reply.code(404).send({ detail: "Not found" });
    try {
      await deleteByDocumentId(id);
    } catch {
      // best-effort — still drop the Postgres row
    }
    await prisma.document.delete({ where: { id } });
    return reply.code(204).send();
  });
}
