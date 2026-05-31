/**
 * Symbol alias resolver.
 *
 * Users type things like "NIFTY" or "SENSEX"; Yahoo Finance wants
 * "^NSEI" and "^BSESN". This map bridges the gap so the search box and
 * URL params work with both forms.
 */

// alias  ->  yahoo ticker
const ALIASES: Record<string, string> = {
  // India — indices
  NIFTY: '^NSEI',
  NIFTY50: '^NSEI',
  'NIFTY 50': '^NSEI',
  SENSEX: '^BSESN',
  BSE: '^BSESN',
  BANKNIFTY: '^NSEBANK',
  'BANK NIFTY': '^NSEBANK',
  NIFTYBANK: '^NSEBANK',
  FINNIFTY: 'NIFTY_FIN_SERVICE.NS',

  // India — common large-caps (let users type bare names without .NS).
  // For tickers NOT in this list, the backend auto-retries with .NS, so any
  // NSE-listed stock works — this map just saves a round-trip for popular ones.
  // -- banking / financials
  HDFCBANK: 'HDFCBANK.NS',
  ICICIBANK: 'ICICIBANK.NS',
  SBIN: 'SBIN.NS',
  AXISBANK: 'AXISBANK.NS',
  KOTAKBANK: 'KOTAKBANK.NS',
  INDUSINDBK: 'INDUSINDBK.NS',
  BAJFINANCE: 'BAJFINANCE.NS',
  BAJAJFINSV: 'BAJAJFINSV.NS',
  HDFCLIFE: 'HDFCLIFE.NS',
  SBILIFE: 'SBILIFE.NS',
  // -- IT
  TCS: 'TCS.NS',
  INFY: 'INFY.NS',
  INFOSYS: 'INFY.NS',
  WIPRO: 'WIPRO.NS',
  HCLTECH: 'HCLTECH.NS',
  TECHM: 'TECHM.NS',
  LTIM: 'LTIM.NS',
  // -- conglomerates / energy
  RELIANCE: 'RELIANCE.NS',
  ONGC: 'ONGC.NS',
  NTPC: 'NTPC.NS',
  POWERGRID: 'POWERGRID.NS',
  COALINDIA: 'COALINDIA.NS',
  BPCL: 'BPCL.NS',
  IOC: 'IOC.NS',
  // -- auto
  MARUTI: 'MARUTI.NS',
  TATAMOTORS: 'TATAMOTORS.NS',
  'M&M': 'M%26M.NS',
  EICHERMOT: 'EICHERMOT.NS',
  HEROMOTOCO: 'HEROMOTOCO.NS',
  'BAJAJ-AUTO': 'BAJAJ-AUTO.NS',
  // -- metals / materials
  TATASTEEL: 'TATASTEEL.NS',
  JSWSTEEL: 'JSWSTEEL.NS',
  HINDALCO: 'HINDALCO.NS',
  ULTRACEMCO: 'ULTRACEMCO.NS',
  GRASIM: 'GRASIM.NS',
  // -- pharma
  SUNPHARMA: 'SUNPHARMA.NS',
  CIPLA: 'CIPLA.NS',
  DRREDDY: 'DRREDDY.NS',
  DIVISLAB: 'DIVISLAB.NS',
  APOLLOHOSP: 'APOLLOHOSP.NS',
  // -- FMCG / consumer
  ITC: 'ITC.NS',
  HINDUNILVR: 'HINDUNILVR.NS',
  NESTLEIND: 'NESTLEIND.NS',
  BRITANNIA: 'BRITANNIA.NS',
  TITAN: 'TITAN.NS',
  ASIANPAINT: 'ASIANPAINT.NS',
  // -- telecom
  BHARTIARTL: 'BHARTIARTL.NS',
  // -- adani group
  ADANIENT: 'ADANIENT.NS',
  ADANIPORTS: 'ADANIPORTS.NS',
  ADANIGREEN: 'ADANIGREEN.NS',
  ADANIPOWER: 'ADANIPOWER.NS',
  // -- new-age / recent IPOs
  ZOMATO: 'ETERNAL.NS',  // Zomato renamed to Eternal Ltd in Aug 2024
  ETERNAL: 'ETERNAL.NS',
  PAYTM: 'PAYTM.NS',
  NYKAA: 'NYKAA.NS',
  POLICYBZR: 'POLICYBZR.NS',
  DMART: 'DMART.NS',
  // -- railway / PSU
  IRCTC: 'IRCTC.NS',
  IRFC: 'IRFC.NS',
  RVNL: 'RVNL.NS',
  RAILTEL: 'RAILTEL.NS',
  CONCOR: 'CONCOR.NS',
  // -- defense
  HAL: 'HAL.NS',
  BEL: 'BEL.NS',
  BDL: 'BDL.NS',
  MAZAGON: 'MAZDOCK.NS',

  // US indices
  SPX: '^GSPC',
  'S&P': '^GSPC',
  'S&P500': '^GSPC',
  SP500: '^GSPC',
  DOW: '^DJI',
  DJI: '^DJI',
  DJIA: '^DJI',
  NASDAQ: '^IXIC',
  NDX: '^IXIC',
  RUSSELL: '^RUT',
  RUT: '^RUT',
  VIX: '^VIX',
};

/** Normalize whatever the user typed into something Yahoo accepts. */
export function resolveSymbol(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/^\$/, '');
  if (!cleaned) return cleaned;
  return ALIASES[cleaned] ?? cleaned;
}

// Mirror of the backend's _currency.py heuristic for places that only have
// a symbol string (e.g. Trade rows from history).
const SUFFIX_CCY: Record<string, string> = {
  '.NS': 'INR', '.BO': 'INR', '.L': 'GBP', '.PA': 'EUR', '.DE': 'EUR',
  '.AS': 'EUR', '.MI': 'EUR', '.MC': 'EUR', '.SW': 'CHF', '.TO': 'CAD',
  '.V': 'CAD', '.AX': 'AUD', '.HK': 'HKD', '.T': 'JPY', '.KS': 'KRW',
  '.SS': 'CNY', '.SZ': 'CNY', '.SI': 'SGD', '.SA': 'BRL', '.MX': 'MXN',
  '.JO': 'ZAR',
};
const INDEX_PREFIX_CCY: Record<string, string> = {
  '^NSE': 'INR', '^BSE': 'INR', '^N225': 'JPY', '^FTSE': 'GBP',
  '^FCHI': 'EUR', '^GDAXI': 'EUR', '^HSI': 'HKD', '^STI': 'SGD',
  '^TWII': 'TWD', '^KS11': 'KRW',
};

export function inferCurrency(symbol: string | null | undefined): string {
  if (!symbol) return 'USD';
  const s = symbol.toUpperCase();
  for (const [prefix, ccy] of Object.entries(INDEX_PREFIX_CCY)) {
    if (s.startsWith(prefix)) return ccy;
  }
  for (const [suffix, ccy] of Object.entries(SUFFIX_CCY)) {
    if (s.endsWith(suffix)) return ccy;
  }
  return 'USD';
}

/** Curated quick-pick list shown in empty states. */
export interface SymbolSuggestion {
  symbol: string;     // Yahoo ticker (what gets navigated to)
  label: string;      // human label
  hint?: string;      // small subtitle
}

export const SUGGESTED_INDIAN: SymbolSuggestion[] = [
  { symbol: '^NSEI', label: 'NIFTY 50', hint: 'NSE index' },
  { symbol: '^BSESN', label: 'SENSEX', hint: 'BSE index' },
  { symbol: '^NSEBANK', label: 'Bank Nifty', hint: 'NSE bank index' },
  { symbol: 'RELIANCE.NS', label: 'Reliance Industries' },
  { symbol: 'TCS.NS', label: 'Tata Consultancy' },
  { symbol: 'HDFCBANK.NS', label: 'HDFC Bank' },
  { symbol: 'INFY.NS', label: 'Infosys' },
];

export const SUGGESTED_US: SymbolSuggestion[] = [
  { symbol: '^GSPC', label: 'S&P 500', hint: 'US index' },
  { symbol: '^DJI', label: 'Dow Jones', hint: 'US index' },
  { symbol: '^IXIC', label: 'NASDAQ', hint: 'US index' },
  { symbol: 'AAPL', label: 'Apple' },
  { symbol: 'MSFT', label: 'Microsoft' },
  { symbol: 'NVDA', label: 'NVIDIA' },
  { symbol: 'TSLA', label: 'Tesla' },
];
