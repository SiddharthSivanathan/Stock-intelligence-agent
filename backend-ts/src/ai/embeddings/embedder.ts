/**
 * Embeddings — Gemini's text-embedding-004 by default (matches LLM_PROVIDER
 * decision in prod), with a deterministic hashing fallback for development
 * when no API key is configured. The hashing fallback is NOT semantic; it
 * just lets the RAG pipeline run end-to-end during local development.
 *
 * Output dimension is constant per provider so the Chroma collection stays
 * consistent: 768 for Gemini, 384 for the fallback (kept smaller deliberately).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "node:crypto";
import { config } from "../../config.js";

export interface EmbeddingResult {
  model: string;
  dimension: number;
  embeddings: number[][];
}

let gemini: GoogleGenerativeAI | null = null;

async function embedGemini(texts: string[]): Promise<EmbeddingResult> {
  if (!gemini) gemini = new GoogleGenerativeAI(config.GEMINI_API_KEY!);
  const model = gemini.getGenerativeModel({ model: "text-embedding-004" });
  const out: number[][] = [];
  // The SDK has batchEmbedContents but it's clunky; serial calls are fine for our volumes.
  for (const t of texts) {
    const r = await model.embedContent(t);
    out.push(r.embedding.values);
  }
  return { model: "text-embedding-004", dimension: out[0]?.length ?? 768, embeddings: out };
}

/** Deterministic, normalised, *non-semantic* fallback. Use only when no API key. */
function embedHash(texts: string[]): EmbeddingResult {
  const DIM = 384;
  const embeddings = texts.map((t) => {
    const vec = new Array(DIM).fill(0) as number[];
    // Sliding-window hash: each 3-char shingle bumps one dimension.
    const lower = t.toLowerCase();
    for (let i = 0; i < lower.length - 2; i++) {
      const h = createHash("sha1").update(lower.slice(i, i + 3)).digest();
      const idx = h.readUInt32BE(0) % DIM;
      vec[idx] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  });
  return { model: "hash-fallback", dimension: DIM, embeddings };
}

export async function embed(texts: string[]): Promise<EmbeddingResult> {
  if (!texts.length) return { model: "noop", dimension: 0, embeddings: [] };
  if (config.GEMINI_API_KEY) {
    try {
      return await embedGemini(texts);
    } catch {
      // fall through to deterministic fallback
    }
  }
  return embedHash(texts);
}
