/**
 * LLM output normalisation toolkit.
 *
 * Local models (qwen2.5:3b and friends) are far looser than Gemini: they wrap
 * JSON in prose or code fences, invent finance synonyms ("reduce", "accumulate",
 * "outperform"), and drop required fields. This module turns that mess into
 * strict, schema-valid data so a stock analysis never crashes on model output.
 *
 * Everything here is pure + dependency-free and reused by the agents, the
 * workflow synthesiser, and the /llm route.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// 1. JSON extraction / sanitisation
// ---------------------------------------------------------------------------

/**
 * Pull the first well-formed JSON object/array out of arbitrary model text.
 * Strips ```json fences, leading/trailing prose, and matches balanced braces so
 * trailing commentary after the object is ignored. Throws only if no JSON-ish
 * span exists at all.
 */
export function extractJson(raw: string): unknown {
  if (raw == null) throw new Error("empty model output");
  let s = String(raw).trim();

  // Strip Markdown code fences ```json ... ``` (or plain ``` ... ```).
  s = s.replace(/```(?:json|javascript|js)?/gi, "```");
  const fenced = s.match(/```([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();

  // Some models prefix "Here is the JSON:" etc. Jump to the first bracket.
  const startObj = s.indexOf("{");
  const startArr = s.indexOf("[");
  let start = -1;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);
  if (start === -1) throw new Error("no JSON found in model output");

  // Walk forward matching brackets (string-aware) to find the balanced end.
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  let candidate = end === -1 ? s.slice(start) : s.slice(start, end + 1);
  candidate = repairJson(candidate);

  try {
    return JSON.parse(candidate);
  } catch {
    // Last resort: strip trailing commas + retry once.
    const relaxed = candidate.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(relaxed);
  }
}

/** Small, safe fix-ups for the JSON small models most commonly emit wrong. */
function repairJson(s: string): string {
  return s
    // smart quotes → straight quotes
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // trailing commas before a close
    .replace(/,\s*([}\]])/g, "$1")
    // NaN/Infinity → null (invalid JSON otherwise)
    .replace(/:\s*(NaN|Infinity|-Infinity)/g, ": null");
}

// ---------------------------------------------------------------------------
// 2. Finance-word synonym mapping
// ---------------------------------------------------------------------------

export type Action = "buy" | "hold" | "sell";
export type Rating = "strong_buy" | "buy" | "hold" | "reduce" | "sell";

/** Map any analyst word/phrase to the canonical 3-level action. */
const ACTION_SYNONYMS: Record<string, Action> = {
  // buy family
  buy: "buy",
  strong_buy: "buy",
  "strong buy": "buy",
  accumulate: "buy",
  add: "buy",
  outperform: "buy",
  overweight: "buy",
  bullish: "buy",
  positive: "buy",
  long: "buy",
  // hold family
  hold: "hold",
  neutral: "hold",
  "market perform": "hold",
  marketperform: "hold",
  "equal weight": "hold",
  equalweight: "hold",
  maintain: "hold",
  watch: "hold",
  // sell family
  sell: "sell",
  "strong sell": "sell",
  reduce: "sell",
  trim: "sell",
  underperform: "sell",
  underweight: "sell",
  bearish: "sell",
  negative: "sell",
  short: "sell",
  avoid: "sell",
  exit: "sell",
};

/** Map any word/phrase to the canonical 5-level rating. */
const RATING_SYNONYMS: Record<string, Rating> = {
  strong_buy: "strong_buy",
  "strong buy": "strong_buy",
  accumulate: "buy",
  buy: "buy",
  add: "buy",
  outperform: "buy",
  overweight: "buy",
  hold: "hold",
  neutral: "hold",
  "market perform": "hold",
  maintain: "hold",
  reduce: "reduce",
  trim: "reduce",
  underweight: "reduce",
  underperform: "reduce",
  sell: "sell",
  "strong sell": "sell",
  exit: "sell",
  avoid: "sell",
};

export type Sentiment = "bullish" | "bearish" | "neutral";

const SENTIMENT_SYNONYMS: Record<string, Sentiment> = {
  bullish: "bullish",
  positive: "bullish",
  buy: "bullish",
  strong: "bullish",
  good: "bullish",
  optimistic: "bullish",
  bearish: "bearish",
  negative: "bearish",
  sell: "bearish",
  weak: "bearish",
  bad: "bearish",
  pessimistic: "bearish",
  neutral: "neutral",
  mixed: "neutral",
  hold: "neutral",
  balanced: "neutral",
  uncertain: "neutral",
};

/** Coerce any mood word → bullish | bearish | neutral (defaults to neutral). */
export function normalizeSentiment(v: unknown): Sentiment {
  const k = key(v);
  if (SENTIMENT_SYNONYMS[k]) return SENTIMENT_SYNONYMS[k];
  for (const [word, s] of Object.entries(SENTIMENT_SYNONYMS)) {
    if (k && k.includes(word)) return s;
  }
  return "neutral";
}

/** Loose sentiment enum that always parses. */
export function looseSentiment() {
  return z.any().transform((v) => normalizeSentiment(v));
}

function key(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Coerce any analyst verdict → buy | hold | sell (defaults to hold). */
export function normalizeAction(v: unknown): Action {
  const k = key(v);
  if (ACTION_SYNONYMS[k]) return ACTION_SYNONYMS[k];
  const compact = k.replace(/\s+/g, "_");
  if (ACTION_SYNONYMS[compact]) return ACTION_SYNONYMS[compact];
  // substring fallback: "we recommend a strong buy" → buy
  for (const [word, act] of Object.entries(ACTION_SYNONYMS)) {
    if (k.includes(word)) return act;
  }
  return "hold";
}

/** Coerce any analyst verdict → strong_buy | buy | hold | reduce | sell. */
export function normalizeRating(v: unknown, fallbackAction?: Action): Rating {
  const k = key(v);
  if (RATING_SYNONYMS[k]) return RATING_SYNONYMS[k];
  const compact = k.replace(/\s+/g, "_");
  if (RATING_SYNONYMS[compact]) return RATING_SYNONYMS[compact];
  for (const [word, r] of Object.entries(RATING_SYNONYMS)) {
    if (k && k.includes(word)) return r;
  }
  // fall back to the 3-level action if the model only gave that
  if (fallbackAction) return fallbackAction === "buy" ? "buy" : fallbackAction === "sell" ? "sell" : "hold";
  return "hold";
}

// ---------------------------------------------------------------------------
// 3. Score generation / coercion
// ---------------------------------------------------------------------------

/**
 * Parse a loosely-typed score into the canonical [-1, 1] range.
 * Accepts numbers, numeric strings, 0–100 scales, and "+0.4"/"40%" forms.
 * Returns null when nothing numeric is present (caller then synthesises one).
 */
export function parseScoreMinus1To1(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const m = String(v).match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    n = Number(m[0]);
  }
  if (!Number.isFinite(n)) return null;
  // Heuristic: a 0–100 (or %) scale → recentre to [-1, 1].
  if (n > 1 || n < -1) {
    if (n >= 0 && n <= 100) return clamp((n - 50) / 50, -1, 1);
    return clamp(n / 100, -1, 1);
  }
  return clamp(n, -1, 1);
}

/** Deterministic score in [-1, 1] derived from the action + confidence. */
export function scoreFromAction(action: Action, confidence = 0.6): number {
  const base = action === "buy" ? 0.6 : action === "sell" ? -0.6 : 0;
  return clamp(base * (0.5 + 0.5 * clamp(confidence, 0, 1)), -1, 1);
}

/** 0–100 score used by the UI, mapped from the internal [-1, 1] scale. */
export function score0to100(scoreMinus1To1: number): number {
  return Math.round(clamp((scoreMinus1To1 + 1) * 50, 0, 100));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Parse a confidence value into [0, 1]; accepts 0–1, 0–100 and "%" forms. */
export function parseConfidence(v: unknown, fallback = 0.5): number {
  if (v === null || v === undefined || v === "") return fallback;
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const m = String(v).match(/\d+(\.\d+)?/);
    if (!m) return fallback;
    n = Number(m[0]);
  }
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) n = n / 100;
  return clamp(n, 0, 1);
}

// ---------------------------------------------------------------------------
// 4. Reusable Zod helpers
// ---------------------------------------------------------------------------

/** A zod enum that never throws: unknown values map through `mapper`. */
export function coercedAction() {
  return z.any().transform((v) => normalizeAction(v));
}

/** Loose 0..1 confidence that always parses. */
export function looseConfidence(fallback = 0.5) {
  return z.any().transform((v) => parseConfidence(v, fallback));
}

/** Loose [-1,1] score; null when absent so the caller can synthesise it. */
export function looseScore() {
  return z.any().transform((v) => parseScoreMinus1To1(v));
}

/** Coerce anything to a trimmed string (objects → JSON), '' when empty. */
export function looseString() {
  return z.any().transform((v) => {
    if (v == null) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  });
}

/** Coerce anything to a string[] (splits on newlines/semicolons if needed). */
export function looseStringArray() {
  return z.any().transform((v): string[] => {
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : String(x))).filter(Boolean);
    if (typeof v === "string") {
      return v
        .split(/\n|;|•|^\s*[-*]\s+/m)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  });
}
