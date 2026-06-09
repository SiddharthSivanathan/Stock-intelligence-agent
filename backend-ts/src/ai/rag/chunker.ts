/**
 * Naive but effective recursive character splitter.
 * Preserves paragraph and sentence boundaries when possible.
 */
export interface Chunk {
  text: string;
  index: number;
  page?: number;
}

const SEPARATORS = ["\n\n", "\n", ". ", " "];

function splitByLargest(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text];
  for (const sep of SEPARATORS) {
    const parts = text.split(sep);
    if (parts.length === 1) continue;
    const out: string[] = [];
    let buf = "";
    for (const p of parts) {
      const candidate = buf ? `${buf}${sep}${p}` : p;
      if (candidate.length > size && buf) {
        out.push(buf);
        // overlap: keep tail of previous chunk
        const tail = buf.slice(-overlap);
        buf = tail ? `${tail}${sep}${p}` : p;
      } else {
        buf = candidate;
      }
    }
    if (buf) out.push(buf);
    // any oversized survivor → split further by next separator
    return out.flatMap((c) => (c.length > size ? splitByLargest(c, size, overlap) : [c]));
  }
  // last resort — hard cut
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size - overlap) out.push(text.slice(i, i + size));
  return out;
}

export function chunkText(text: string, size = 1200, overlap = 200): Chunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  return splitByLargest(cleaned, size, overlap)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, index) => ({ text, index }));
}
