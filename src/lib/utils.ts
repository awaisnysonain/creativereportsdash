/** Format a number as USD currency with sensible defaults. */
export function formatCurrency(value: number | null | undefined, opts?: { compact?: boolean }): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts?.compact ? "compact" : "standard",
    maximumFractionDigits: opts?.compact ? 1 : n >= 1000 ? 0 : 2,
  }).format(n);
}

/** Format a plain number with grouping. */
export function formatNumber(value: number | null | undefined, opts?: { compact?: boolean }): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US", {
    notation: opts?.compact ? "compact" : "standard",
    maximumFractionDigits: opts?.compact ? 1 : 0,
  }).format(n);
}

/** Format a ratio as ROAS (e.g. 2.34x). */
export function formatRoas(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "—";
  return `${n.toFixed(2)}x`;
}

/** Format a fraction (0..1) as a percentage. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(digits)}%`;
}

/** Safe division that returns 0 instead of NaN/Infinity. */
export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : 0;
}

/** Round to a fixed number of decimals as a number. */
export function round(value: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round((Number(value) || 0) * f) / f;
}

/** Percentage change between two values, expressed as a fraction. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

/** A compact random-ish id (not cryptographically secure). Good for run/job ids. */
export function shortId(prefix = ""): string {
  const s = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}_${s}` : s;
}

/** Truncate with ellipsis. */
export function truncate(str: string, len = 48): string {
  if (!str) return "";
  return str.length > len ? `${str.slice(0, len - 1)}…` : str;
}
