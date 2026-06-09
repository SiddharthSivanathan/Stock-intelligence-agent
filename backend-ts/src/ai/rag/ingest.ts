/**
 * Document ingest pipeline.
 *
 *   chunk → embed → upsert in Chroma → mark document `ready`
 *
 * Runs in the background (fire-and-forget from the route handler) so the API
 * can return immediately with a `pending` document the UI can poll.
 */
import { prisma } from "../../db.js";
import { chunkText } from "./chunker.js";
import { addChunks } from "../vectorstore/chroma.js";

export async function ingestDocument(documentId: number, text: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document ${documentId} not found`);
  try {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "processing" },
    });
    const chunks = chunkText(text);
    if (chunks.length) {
      await addChunks(
        chunks.map((c) => ({
          id: `${documentId}-${c.index}`,
          text: c.text,
          metadata: {
            document_id: documentId,
            document_title: doc.title,
            chunk_index: c.index,
            symbol: doc.symbol ?? undefined,
            user_id: doc.userId,
          },
        })),
      );
    }
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "ready", chunkCount: chunks.length, error: null },
    });
  } catch (e) {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "failed", error: (e as Error).message },
    });
  }
}
