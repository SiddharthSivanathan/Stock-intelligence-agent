/**
 * Thin wrapper over the ChromaDB JS client.
 *
 * The store owns one collection ("documents") and exposes add/query/delete
 * by document_id so the routes don't have to know about Chroma's API surface.
 */
import { ChromaClient, type Collection } from "chromadb";
import { config } from "../../config.js";
import { embed } from "../embeddings/embedder.js";

const COLLECTION_NAME = "documents";

let client: ChromaClient | null = null;
let collection: Collection | null = null;

export class ChromaDisabledError extends Error {
  statusCode = 503;
  constructor() {
    super("RAG is disabled in this deployment (CHROMA_ENABLED=false).");
  }
}

function getClient(): ChromaClient {
  if (!config.CHROMA_ENABLED) throw new ChromaDisabledError();
  if (!client) {
    client = new ChromaClient({ path: `http://${config.CHROMA_HOST}:${config.CHROMA_PORT}` });
  }
  return client;
}

async function getCollection(): Promise<Collection> {
  if (collection) return collection;
  collection = await getClient().getOrCreateCollection({
    name: COLLECTION_NAME,
    // No internal embedder — we provide vectors ourselves so we control the model.
    embeddingFunction: { generate: async (texts) => (await embed(texts)).embeddings },
  });
  return collection;
}

export interface ChunkRecord {
  id: string;                // unique chunk id (e.g. `${docId}-${index}`)
  text: string;
  metadata: {
    document_id: number;
    document_title: string;
    chunk_index: number;
    page?: number;
    symbol?: string;
    user_id: number;
  };
}

/** Strip undefined keys — Chroma rejects them in metadata. */
function clean(m: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export async function addChunks(records: ChunkRecord[]): Promise<void> {
  if (!records.length) return;
  const col = await getCollection();
  const texts = records.map((r) => r.text);
  const { embeddings } = await embed(texts);
  await col.add({
    ids: records.map((r) => r.id),
    documents: texts,
    embeddings,
    metadatas: records.map((r) => clean(r.metadata as unknown as Record<string, unknown>)),
  });
}

export interface QueryHit {
  chunk_id: string;
  text: string;
  score: number;
  document_id: number;
  document_title: string;
  chunk_index: number;
  page?: number;
}

export async function query(
  question: string,
  k = 4,
  filter?: { symbol?: string; user_id?: number },
): Promise<QueryHit[]> {
  const col = await getCollection();
  const { embeddings } = await embed([question]);
  // Chroma uses `$and` for multi-field WHERE filters; single field is a plain object.
  const conditions: Record<string, unknown>[] = [];
  if (filter?.symbol) conditions.push({ symbol: filter.symbol });
  if (filter?.user_id) conditions.push({ user_id: filter.user_id });
  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : { $and: conditions };
  const res = await col.query({
    queryEmbeddings: embeddings,
    nResults: k,
    where: where as never,
  });
  const ids = (res.ids?.[0] ?? []) as string[];
  const docs = (res.documents?.[0] ?? []) as (string | null)[];
  const metas = (res.metadatas?.[0] ?? []) as (ChunkRecord["metadata"] | null)[];
  const dists = (res.distances?.[0] ?? []) as number[];
  return ids.map((id, i) => {
    const m = metas[i] ?? ({} as ChunkRecord["metadata"]);
    // Chroma returns L2 distances by default; convert to a similarity-ish score.
    const dist = dists[i] ?? 0;
    return {
      chunk_id: id,
      text: docs[i] ?? "",
      score: 1 / (1 + dist),
      document_id: m.document_id,
      document_title: m.document_title,
      chunk_index: m.chunk_index,
      page: m.page,
    };
  });
}

export async function deleteByDocumentId(documentId: number): Promise<void> {
  const col = await getCollection();
  await col.delete({ where: { document_id: documentId } as never });
}
