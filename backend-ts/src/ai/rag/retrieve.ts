/**
 * Retrieval-augmented QA: pull top-k chunks, build a grounded prompt, call LLM,
 * return the answer plus structured citations.
 */
import { query, type QueryHit } from "../vectorstore/chroma.js";
import { getLLM } from "../llm/factory.js";

export interface RagAnswer {
  answer: string;
  citations: QueryHit[];
}

export async function answerQuestion(
  question: string,
  opts: { k?: number; symbol?: string; userId?: number } = {},
): Promise<RagAnswer> {
  const k = opts.k ?? 4;
  const hits = await query(question, k, { symbol: opts.symbol, user_id: opts.userId });

  if (!hits.length) {
    return {
      answer:
        "I don't have any indexed documents for this query. Upload a PDF, HTML, or text first.",
      citations: [],
    };
  }

  const context = hits
    .map((h, i) => `[${i + 1}] ${h.document_title} — chunk ${h.chunk_index}:\n${h.text}`)
    .join("\n\n");

  const llm = getLLM();
  const resp = await llm.chat([
    {
      role: "system",
      content:
        "You are a careful financial research assistant. Answer ONLY from the provided context. " +
        "Cite sources inline as [1], [2] matching the context block numbers. " +
        "If the context does not contain the answer, say so.",
    },
    { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:` },
  ], { temperature: 0.2 });

  return { answer: resp.content, citations: hits };
}
