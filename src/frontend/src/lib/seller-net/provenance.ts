/**
 * Seller Net Waterfall — provenance helpers.
 *
 * Provenance is tracked by explicit user action, never inferred from value
 * equality with a default. These helpers construct and inspect ProvenancedNumber
 * values without ever guessing.
 */

import type { ProvenanceState, ProvenancedNumber } from "./types";

/** A field the user has not touched yet. */
export function unknownField(): ProvenancedNumber {
  return { value: null, provenance: "UNKNOWN" };
}

/** A field the user explicitly entered. */
export function userProvided(value: number): ProvenancedNumber {
  return { value, provenance: "USER_PROVIDED" };
}

/** A field left at the canonical default. */
export function defaultAssumption(value: number): ProvenancedNumber {
  return { value, provenance: "DEFAULT_ASSUMPTION" };
}

/** A field the user marked as an estimate. */
export function estimate(value: number): ProvenancedNumber {
  return { value, provenance: "ESTIMATE" };
}

/** A field backed by a verified payoff statement. */
export function verifiedPayoff(value: number): ProvenancedNumber {
  return { value, provenance: "VERIFIED_PAYOFF" };
}

/** True when the field carries no usable value. */
export function isUnknown(field: ProvenancedNumber): boolean {
  return field.provenance === "UNKNOWN" || field.value === null;
}

/** The numeric value, or `null` when UNKNOWN. */
export function fieldValue(field: ProvenancedNumber): number | null {
  return isUnknown(field) ? null : field.value;
}

/** The numeric value, or `fallback` when UNKNOWN. */
export function valueOr(field: ProvenancedNumber, fallback: number): number {
  const value = fieldValue(field);
  return value === null ? fallback : value;
}

/** Human label for a provenance state, shared by calculator and UI. */
export const PROVENANCE_LABELS: Record<ProvenanceState, string> = {
  USER_PROVIDED: "User provided",
  DEFAULT_ASSUMPTION: "Default assumption",
  ESTIMATE: "Estimate",
  VERIFIED_PAYOFF: "Verified payoff",
  UNKNOWN: "Unknown",
};
