import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Common ISO 4217 codes -> symbol. Falls back to the code itself for unknown.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  HKD: 'HK$',
  CAD: 'C$',
  AUD: 'A$',
  SGD: 'S$',
  CHF: 'CHF ',
  KRW: '₩',
};

export function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return '$';
  const code = currency.toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

/**
 * Format a money value with a currency symbol.
 * Pass either an ISO 4217 code (e.g. "INR", "USD") OR a literal symbol ("₹").
 */
export function fmtMoney(
  n: number | null | undefined,
  currency: string = 'USD',
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  // If caller already passed a symbol (single non-letter char), use as-is.
  const sym = /^[A-Z]{3}$/i.test(currency) ? currencySymbol(currency) : currency;
  return `${sym}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
