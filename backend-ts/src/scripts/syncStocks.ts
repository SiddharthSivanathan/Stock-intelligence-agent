/**
 * Stock master sync — populates the `stocks` table from public sources.
 *
 *   NSE  → https://archives.nseindia.com/content/equities/EQUITY_L.csv   (~2000 rows)
 *   BSE  → https://api.bseindia.com/BseIndiaAPI/api/ListOfScripsCanInfo/w?Group=&Scripcode=
 *          (we use the smaller `ListofScripCodeAdvSearchData` JSON for speed)
 *   US   → static seed of S&P 100 / NASDAQ majors (a full SEC sync would be a
 *          separate script — out of scope for this pass)
 *
 * Idempotent: upserts on (exchange, base_symbol). Safe to run daily.
 *
 *   docker compose exec backend-ts npm run sync:stocks
 */
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface SeedRow {
  symbol: string;
  baseSymbol: string;
  name: string;
  exchange: "NSE" | "BSE" | "NYSE" | "NASDAQ";
  isin?: string;
  sector?: string | null;
  industry?: string | null;
  currency?: string;
  country?: string;
}

// -------------------- NSE --------------------

async function fetchNseEquities(): Promise<SeedRow[]> {
  console.log("→ Fetching NSE EQUITY_L.csv …");
  const { data } = await axios.get<string>(
    "https://archives.nseindia.com/content/equities/EQUITY_L.csv",
    {
      headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
      responseType: "text",
      timeout: 60_000,
    },
  );
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

// -------------------- US (small seed) --------------------

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
  const all = [...nse, ...bse, ...US_SEED, ...INDEX_SEED];
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
