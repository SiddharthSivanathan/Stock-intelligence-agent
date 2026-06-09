/**
 * Thin direct-axios client for Yahoo Finance.
 *
 * yahoo-finance2 sends a bot-like User-Agent that Yahoo rate-limits (429)
 * from container IPs. Calling the public endpoints with a browser UA works
 * fine. We only need the read-only public endpoints.
 */
import axios from "axios";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Yahoo's `/v10/quoteSummary` endpoint requires a session cookie + crumb
 * token, even though `/v8/chart` doesn't. We fetch them once at module
 * load and cache for the process lifetime (Yahoo rotates them every few
 * hours; on 401 we transparently refresh).
 */
interface YahooSession {
  cookie: string;
  crumb: string;
  fetchedAt: number;
}
let session: YahooSession | null = null;
let sessionPromise: Promise<YahooSession> | null = null;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

async function fetchSession(): Promise<YahooSession> {
  // Step 1: hit fc.yahoo.com to get the A1/A3 consent cookies.
  const consent = await axios.get("https://fc.yahoo.com", {
    headers: { "User-Agent": BROWSER_UA, Accept: "*/*" },
    timeout: 30_000,
    // 4xx is expected here — we only want the Set-Cookie header.
    validateStatus: () => true,
  });
  const rawCookies = (consent.headers["set-cookie"] ?? []) as string[];
  const cookie = rawCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("yahoo: no cookies returned from fc.yahoo.com");

  // Step 2: exchange cookie for a crumb token.
  const crumbResp = await axios.get(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    {
      headers: { "User-Agent": BROWSER_UA, Cookie: cookie, Accept: "*/*" },
      timeout: 30_000,
      responseType: "text",
    },
  );
  const crumb = String(crumbResp.data).trim();
  if (!crumb || crumb.includes("<")) {
    throw new Error(`yahoo: invalid crumb response: ${crumb.slice(0, 80)}`);
  }
  return { cookie, crumb, fetchedAt: Date.now() };
}

async function getSession(force = false): Promise<YahooSession> {
  if (!force && session && Date.now() - session.fetchedAt < SESSION_TTL_MS) {
    return session;
  }
  if (!sessionPromise) {
    sessionPromise = fetchSession()
      .then((s) => {
        session = s;
        return s;
      })
      .finally(() => {
        sessionPromise = null;
      });
  }
  return sessionPromise;
}

/**
 * Yahoo `quoteSummary` returns deeply-nested `{ raw, fmt, longFmt }` objects.
 * We mostly want the raw number — this helper unwraps it.
 */
export function rawOf(v: unknown): number | string | null {
  if (v == null) return null;
  if (typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    return (v as { raw?: number | string | null }).raw ?? null;
  }
  if (typeof v === "number" || typeof v === "string") return v;
  return null;
}

async function fetchQuoteSummary(
  symbol: string,
  modules: string[],
  sess: YahooSession,
) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`;
  return axios.get(url, {
    params: { modules: modules.join(","), crumb: sess.crumb },
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json",
      Cookie: sess.cookie,
    },
    timeout: 30_000,
    validateStatus: () => true,
  });
}

export async function quoteSummary(
  symbol: string,
  modules: string[],
): Promise<Record<string, unknown>> {
  let sess = await getSession();
  let r = await fetchQuoteSummary(symbol, modules, sess);
  // 401 / "Invalid Crumb" → cookies expired; refresh once and retry.
  if (r.status === 401 || r.data?.finance?.error?.code === "Unauthorized") {
    sess = await getSession(true);
    r = await fetchQuoteSummary(symbol, modules, sess);
  }
  if (r.status >= 400) {
    throw new Error(
      `yahoo quoteSummary ${r.status}: ${JSON.stringify(r.data?.finance?.error ?? r.data).slice(0, 200)}`,
    );
  }
  return (r.data?.quoteSummary?.result?.[0] ?? {}) as Record<string, unknown>;
}
