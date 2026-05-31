"""Symbol → ISO 4217 currency heuristic.

When an upstream API doesn't tell us the currency, infer it from the Yahoo-
style suffix or `^EXCHANGE`-style prefix. Conservative — falls back to USD
for unknown forms.
"""
from __future__ import annotations


# yahoo suffix  -> ISO 4217
_SUFFIX_MAP: dict[str, str] = {
    ".NS": "INR",      # NSE
    ".BO": "INR",      # BSE
    ".L":  "GBP",      # London
    ".PA": "EUR",      # Paris
    ".DE": "EUR",      # Xetra (Germany)
    ".AS": "EUR",      # Amsterdam
    ".MI": "EUR",      # Milan
    ".MC": "EUR",      # Madrid
    ".SW": "CHF",      # Swiss
    ".TO": "CAD",      # Toronto
    ".V":  "CAD",      # Venture (Canada)
    ".AX": "AUD",      # Australia
    ".HK": "HKD",      # Hong Kong
    ".T":  "JPY",      # Tokyo
    ".KS": "KRW",      # Korea
    ".SS": "CNY",      # Shanghai
    ".SZ": "CNY",      # Shenzhen
    ".SI": "SGD",      # Singapore
    ".SA": "BRL",      # São Paulo
    ".MX": "MXN",      # Mexico
    ".JO": "ZAR",      # Johannesburg
}

# yahoo index prefix shortcuts (^NSEI etc.)
_INDEX_PREFIX_MAP: dict[str, str] = {
    "^NSE":  "INR",
    "^BSE":  "INR",
    "^NSEI": "INR",
    "^N225": "JPY",
    "^FTSE": "GBP",
    "^FCHI": "EUR",
    "^GDAXI": "EUR",
    "^HSI":  "HKD",
    "^STOXX50E": "EUR",
    "^STI":  "SGD",
    "^TWII": "TWD",
    "^KS11": "KRW",
}


def infer_currency(symbol: str) -> str:
    """Best-effort currency code for a Yahoo Finance symbol. Defaults to USD."""
    if not symbol:
        return "USD"
    s = symbol.upper()

    # Index prefix check (^NSEI, ^FTSE, ...) — most specific first.
    for prefix, ccy in _INDEX_PREFIX_MAP.items():
        if s.startswith(prefix):
            return ccy

    # Exchange suffix check (.NS, .L, ...).
    for suffix, ccy in _SUFFIX_MAP.items():
        if s.endswith(suffix):
            return ccy

    return "USD"
