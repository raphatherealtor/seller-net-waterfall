/**
 * Shared display formatting for the Seller Net work surface.
 *
 * Formatting only — never arithmetic. Every monetary value rendered by the UI
 * passes through here so the ledger column stays perfectly aligned.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `$1,234.56` — the canonical money readout. */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return USD.format(value);
}

/** `$1,235` — compact money for KPI headlines. */
export function formatMoneyWhole(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return USD_WHOLE.format(value);
}

/** `-$1,234.56` — a deduction line, always signed. */
export function formatDeduction(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value === 0) return USD.format(0);
  return `-${USD.format(Math.abs(value))}`;
}

/** Basis points → `5.00%`. */
export function formatBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

/** Fraction → `+10.0%` / `-10.0%` / `0.0%`. */
export function formatPercent(fraction: number | null | undefined): string {
  if (
    fraction === null ||
    fraction === undefined ||
    !Number.isFinite(fraction)
  ) {
    return "—";
  }
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** `Oct 26, 2023` — stable across locales for the net sheet header. */
export function formatDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** `Oct 26, 2023, 2:14 PM` — run record timestamps. */
export function formatDateTime(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * Motoko `Time.now()` nanoseconds → `Date`. Returns `null` for invalid input so
 * callers can render a fallback instead of `Invalid Date`.
 */
export function timestampToDate(timestamp: bigint): Date | null {
  const date = new Date(Number(timestamp / 1_000_000n));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `PID 947281` or a neutral fallback when the identifier is empty. */
export function formatPropertyId(
  propertyId: string | null | undefined,
): string {
  const trimmed = (propertyId ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Untitled property";
}
