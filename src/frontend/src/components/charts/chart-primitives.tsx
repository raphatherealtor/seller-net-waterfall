import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Shared deterministic chart primitives.
 *
 * Every helper here is pure and presentation-only: it maps already-computed
 * numbers onto geometry. No financial formula lives in this file, and nothing
 * here reads the calculator — callers pass in the canonical figures.
 */

/** A finite, non-negative number, or 0 for anything unusable. */
export function safeValue(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/** Clamp a fraction into [0, 1]; non-finite input becomes 0. */
export function clampFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

/** `value / max` as a clamped fraction; a zero max yields 0. */
export function fractionOf(value: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return clampFraction(value / max);
}

/** A percentage label for a share, e.g. `34.2%`. */
export function formatShare(fraction: number): string {
  return `${(clampFraction(fraction) * 100).toFixed(1)}%`;
}

/** A compact money label for tight chart gutters, e.g. `$412.5k`. */
export function formatCompactMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** A compact money label with no decimals, e.g. `$412k` — axis ticks. */
export function formatCompactMoneyWhole(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

/** Evenly spaced tick values from 0 to `max`, inclusive. */
export function buildTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const ticks: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    ticks.push((max * index) / count);
  }
  return ticks;
}

/** One category in a proportional breakdown. */
export interface BreakdownSlice {
  id: string;
  label: string;
  value: number;
  /** A `chart-*` token name, e.g. `"chart-1"`. */
  color: string;
}

/** A slice plus its computed share of the total. */
export interface BreakdownShare extends BreakdownSlice {
  share: number;
}

/**
 * Attach each slice's share of the total. Shares are display proportions of
 * the already-computed deduction figures — never a re-derived financial value.
 */
export function withShares(slices: BreakdownSlice[]): BreakdownShare[] {
  const total = slices.reduce((sum, slice) => sum + safeValue(slice.value), 0);
  return slices.map((slice) => ({
    ...slice,
    share: total > 0 ? safeValue(slice.value) / total : 0,
  }));
}

/** A `chart-*` token name mapped to a concrete CSS color value. */
export function chartColor(token: string): string {
  return `oklch(var(--${token}))`;
}

/** A small uppercase chart caption. */
export function ChartCaption({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("eyebrow text-[oklch(var(--panel-muted))]", className)}>
      {children}
    </p>
  );
}

/**
 * Accessible SVG scaffolding: a labelled `role="img"` figure with a title and
 * description so screen readers get the chart's meaning, not its geometry.
 *
 * `viewBox` defaults to the normalized `0 0 100 100` box used by the
 * proportional charts; the waterfall passes a pixel-space box so its labels
 * stay legible instead of being stretched by `preserveAspectRatio="none"`.
 */
export function ChartFigure({
  title,
  description,
  className,
  viewBox = "0 0 100 100",
  children,
}: {
  title: string;
  description: string;
  className?: string;
  viewBox?: string;
  children: ReactNode;
}) {
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={viewBox}
      preserveAspectRatio="none"
      className={cn("block w-full", className)}
    >
      <title>{title}</title>
      <desc>{description}</desc>
      {children}
    </svg>
  );
}
