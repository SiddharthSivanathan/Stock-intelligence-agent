/**
 * Stock master sync — populates the `stocks` table from public sources.
 *
 *   NSE  → https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv  (~2000 rows)
 *          (the old `archives.nseindia.com` host now returns Akamai 503s)
 *   BSE  → https://api.bseindia.com/BseIndiaAPI/api/ListOfScripsCanInfo/w?Group=&Scripcode=
 *          (best-effort; BSE bot-blocks datacenter/non-India IPs)
 *   US   → official NASDAQ Trader symbol directories — the full US-listed
 *          universe (~13k tickers across NASDAQ / NYSE / NYSE American / Arca).
 *          Falls back to a 30-name majors seed if the files are unreachable.
 *
 * Every source is wrapped so a single failure never aborts the run — we always
 * upsert whatever we could fetch plus the index seeds.
 *
 * Idempotent: upserts on (exchange, base_symbol). Safe to run daily.
 *
 *   docker compose exec backend npm run sync:stocks
 */
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

interface SeedRow {
  symbol: string;
  baseSymbol: string;
  name: string;
  exchange: string;
  isin?: string;
  sector?: string | null;
  industry?: string | null;
  currency?: string;
  country?: string;
}

// -------------------- NSE --------------------

async function fetchNseEquities(): Promise<SeedRow[]> {
  console.log("→ Fetching NSE EQUITY_L.csv …");
  // Primary host is the current CDN; the legacy host is kept as a fallback.
  const urls = [
    "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
    "https://archives.nseindia.com/content/equities/EQUITY_L.csv",
  ];
  let data: string | undefined;
  for (const url of urls) {
    try {
      const res = await axios.get<string>(url, {
        headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
        responseType: "text",
        timeout: 60_000,
      });
      // A blocked request comes back as an HTML error page, not CSV.
      if (typeof res.data === "string" && res.data.startsWith("SYMBOL")) {
        data = res.data;
        break;
      }
      console.warn(`  ${url} returned a non-CSV body; trying next source.`);
    } catch (e) {
      console.warn(`  ${url} failed (${(e as Error).message}); trying next source.`);
    }
  }
  if (!data) {
    console.warn("  NSE fetch failed on all hosts; skipping NSE this run.");
    return [];
  }
  // Header: SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE,
  //         MARKET LOT, ISIN NUMBER, FACE VALUE
  const lines = data.trim().split(/\r?\n/);
  const rows: SeedRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 7) continue;
    const [base, name, series, , , , isin] = cols;
    if (!base || !name) continue;
    // EQ + BE + SM series cover the listed equity universe; skip suspended (BZ).
    if (!["EQ", "BE", "SM", "BL"].includes(series)) continue;
    rows.push({
      symbol: `${base}.NS`,
      baseSymbol: base,
      name: name.replace(/"/g, "").trim(),
      exchange: "NSE",
      isin: isin || undefined,
      currency: "INR",
      country: "India",
    });
  }
  console.log(`  got ${rows.length} NSE equities`);
  return rows;
}

// -------------------- BSE --------------------

async function fetchBseEquities(): Promise<SeedRow[]> {
  console.log("→ Fetching BSE scrip list …");
  // BSE's public endpoint returns the full list of A/B/T/X group scrips.
  // The CSV format on bseindia.com is paginated; this single JSON returns all.
  try {
    const { data } = await axios.get<{ Table: Array<Record<string, string>> }>(
      "https://api.bseindia.com/BseIndiaAPI/api/ListofScripCode/w",
      {
        params: { Group: "", Scripcode: "" },
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://www.bseindia.com/",
        },
        timeout: 60_000,
      },
    );
    const rows: SeedRow[] = [];
    for (const r of data?.Table ?? []) {
      const code = String(r.SCRIP_CD ?? r.scrip_cd ?? "").trim();
      const name = String(r.scrip_name ?? r.SCRIP_NAME ?? "").trim();
      if (!code || !name) continue;
      const isin = String(r.ISIN_NUMBER ?? r.isin_number ?? "").trim() || undefined;
      rows.push({
        symbol: `${code}.BO`,
        baseSymbol: code,
        name,
        exchange: "BSE",
        isin,
        currency: "INR",
        country: "India",
      });
    }
    console.log(`  got ${rows.length} BSE scrips`);
    return rows;
  } catch (e) {
    console.warn(
      `  BSE fetch failed (${(e as Error).message}); skipping BSE this run.`,
    );
    return [];
  }
}

// -------------------- US (full listings) --------------------

// NYSE Trader "otherlisted" exchange codes → short display names (≤10 chars,
// the DB column is VarChar(10)).
const OTHER_EXCHANGE: Record<string, string> = {
  A: "NYSE AMER",
  N: "NYSE",
  P: "NYSE ARCA",
  Z: "BATS",
  V: "IEX",
};

// A NASDAQ Trader symbol is skippable if it's a test issue, a directory
// footer line, or a non-common special security (warrants / units / rights /
// preferreds carry a `$` in the ticker).
function usSymbolOk(symbol: string, name: string, testIssue: string): boolean {
  if (!symbol || !name) return false;
  if (testIssue === "Y") return false;
  if (symbol.includes("$")) return false;
  if (name.startsWith("File Creation Time")) return false;
  return true;
}

async function fetchUsFile(url: string): Promise<string[]> {
  const { data } = await axios.get<string>(url, {
    headers: { "User-Agent": UA, Accept: "text/plain,*/*" },
    responseType: "text",
    timeout: 60_000,
  });
  return String(data).trim().split(/\r?\n/);
}

async function fetchUsListings(): Promise<SeedRow[]> {
  console.log("→ Fetching US listings from NASDAQ Trader …");
  const rows: SeedRow[] = [];
  const seen = new Set<string>();
  const push = (r: SeedRow) => {
    const key = `${r.exchange}:${r.baseSymbol}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(r);
  };
  // Yahoo uses `-` for class shares where NASDAQ Trader uses `.` (e.g. BRK.B → BRK-B).
  const yahooize = (s: string) => s.replace(/\./g, "-");

  try {
    // nasdaqlisted.txt: Symbol|Security Name|Market Category|Test Issue|...|ETF|...
    const nasdaq = await fetchUsFile(
      "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    );
    for (const line of nasdaq.slice(1)) {
      const c = line.split("|");
      const [symbol, name, , testIssue] = c;
      if (!usSymbolOk(symbol, name, testIssue)) continue;
      push({
        symbol: yahooize(symbol),
        baseSymbol: symbol,
        name: name.trim(),
        exchange: "NASDAQ",
        currency: "USD",
        country: "United States",
      });
    }

    // otherlisted.txt: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|...|Test Issue|...
    const other = await fetchUsFile(
      "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
    );
    for (const line of other.slice(1)) {
      const c = line.split("|");
      const [symbol, name, exch, , , , testIssue] = c;
      if (!usSymbolOk(symbol, name, testIssue)) continue;
      push({
        symbol: yahooize(symbol),
        baseSymbol: symbol,
        name: name.trim(),
        exchange: OTHER_EXCHANGE[exch] ?? "NYSE",
        currency: "USD",
        country: "United States",
      });
    }
  } catch (e) {
    console.warn(
      `  US listings fetch failed (${(e as Error).message}); falling back to majors seed.`,
    );
    return US_SEED;
  }

  if (rows.length === 0) {
    console.warn("  US listings came back empty; falling back to majors seed.");
    return US_SEED;
  }
  console.log(`  got ${rows.length} US listings`);
  return rows;
}

// Fallback used only when the NASDAQ Trader files are unreachable.
const US_SEED: SeedRow[] = [
  ["AAPL", "Apple Inc.", "Technology"],
  ["MSFT", "Microsoft Corporation", "Technology"],
  ["GOOGL", "Alphabet Inc. Class A", "Communication Services"],
  ["GOOG", "Alphabet Inc. Class C", "Communication Services"],
  ["AMZN", "Amazon.com Inc.", "Consumer Cyclical"],
  ["NVDA", "NVIDIA Corporation", "Technology"],
  ["META", "Meta Platforms Inc.", "Communication Services"],
  ["TSLA", "Tesla Inc.", "Consumer Cyclical"],
  ["BRK.B", "Berkshire Hathaway Inc. Class B", "Financial Services"],
  ["JPM", "JPMorgan Chase & Co.", "Financial Services"],
  ["V", "Visa Inc.", "Financial Services"],
  ["MA", "Mastercard Incorporated", "Financial Services"],
  ["UNH", "UnitedHealth Group", "Healthcare"],
  ["XOM", "Exxon Mobil Corporation", "Energy"],
  ["WMT", "Walmart Inc.", "Consumer Defensive"],
  ["JNJ", "Johnson & Johnson", "Healthcare"],
  ["PG", "Procter & Gamble", "Consumer Defensive"],
  ["HD", "The Home Depot Inc.", "Consumer Cyclical"],
  ["CVX", "Chevron Corporation", "Energy"],
  ["AVGO", "Broadcom Inc.", "Technology"],
  ["LLY", "Eli Lilly and Company", "Healthcare"],
  ["KO", "The Coca-Cola Company", "Consumer Defensive"],
  ["PEP", "PepsiCo Inc.", "Consumer Defensive"],
  ["COST", "Costco Wholesale", "Consumer Defensive"],
  ["AMD", "Advanced Micro Devices", "Technology"],
  ["NFLX", "Netflix Inc.", "Communication Services"],
  ["CRM", "Salesforce Inc.", "Technology"],
  ["DIS", "The Walt Disney Company", "Communication Services"],
  ["INTC", "Intel Corporation", "Technology"],
  ["BAC", "Bank of America", "Financial Services"],
].map(([sym, name, sector]) => ({
  symbol: sym!,
  baseSymbol: sym!,
  name: name!,
  exchange: "NASDAQ",
  sector,
  currency: "USD",
  country: "United States",
}));

// Major indices the user can type by friendly name.
const INDEX_SEED: SeedRow[] = [
  { symbol: "^NSEI", baseSymbol: "^NSEI", name: "NIFTY 50", exchange: "NSE", currency: "INR", country: "India" },
  { symbol: "^BSESN", baseSymbol: "^BSESN", name: "BSE SENSEX", exchange: "BSE", currency: "INR", country: "India" },
  { symbol: "^NSEBANK", baseSymbol: "^NSEBANK", name: "Bank Nifty", exchange: "NSE", currency: "INR", country: "India" },
  { symbol: "^CNXIT", baseSymbol: "^CNXIT", name: "Nifty IT", exchange: "NSE", currency: "INR", country: "India" },
  { symbol: "^GSPC", baseSymbol: "^GSPC", name: "S&P 500", exchange: "NYSE", currency: "USD", country: "United States" },
  { symbol: "^DJI", baseSymbol: "^DJI", name: "Dow Jones Industrial Average", exchange: "NYSE", currency: "USD", country: "United States" },
  { symbol: "^IXIC", baseSymbol: "^IXIC", name: "NASDAQ Composite", exchange: "NASDAQ", currency: "USD", country: "United States" },
];

// -------------------- Upsert in batches --------------------

async function upsertBatch(rows: SeedRow[]) {
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((r) =>
        prisma.stock.upsert({
          where: {
            exchange_baseSymbol: { exchange: r.exchange, baseSymbol: r.baseSymbol },
          },
          update: {
            symbol: r.symbol,
            name: r.name,
            isin: r.isin,
            sector: r.sector,
            industry: r.industry,
            currency: r.currency,
            country: r.country,
            isActive: true,
            lastSyncedAt: new Date(),
          },
          create: r,
        }),
      ),
    );
    done += slice.length;
    process.stdout.write(`\r  upserted ${done}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  const t0 = Date.now();
  console.log("=== Stock master sync ===");
  const nse = await fetchNseEquities();
  const bse = await fetchBseEquities();
  const us = await fetchUsListings();
  const all = [...nse, ...bse, ...us, ...INDEX_SEED];
  console.log(`Upserting ${all.length} rows …`);
  await upsertBatch(all);
  const total = await prisma.stock.count();
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Master table now has ${total} rows.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
