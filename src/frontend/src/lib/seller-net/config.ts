/**
 * Seller Net Waterfall — canonical configuration.
 *
 * ONE exported config object holds every default the calculator and the UI
 * share. Nothing else in the app may hardcode these numbers.
 */

import type { ConditionTier, Section121Status } from "./types";

export const CALCULATOR_VERSION = "SELLER_NET_WATERFALL v1.3.0";

/** Condition tier → price adjustment percentage (fraction, not basis points). */
export const CONDITION_TIER_ADJUSTMENTS: Record<ConditionTier, number> = {
  NEEDS_WORK: -0.1,
  GOOD: 0,
  TURNKEY_10_PLUS: 0.1,
};

/** Human labels for the condition tiers, shared by calculator and UI. */
export const CONDITION_TIER_LABELS: Record<ConditionTier, string> = {
  NEEDS_WORK: "Needs work",
  GOOD: "Good",
  TURNKEY_10_PLUS: "Turnkey 10+",
};

/**
 * Section 121 primary-residence exclusion amounts in dollars, keyed by status.
 * UNKNOWN is deliberately absent — it blocks the tax calculation rather than
 * defaulting to None. UI components must read these from config, never
 * hardcode them.
 */
export const SECTION_121_EXEMPTIONS: Record<Section121Status, number> = {
  UNKNOWN: 0,
  NONE: 0,
  SINGLE: 250_000,
  MARRIED: 500_000,
};

export interface SellerNetConfig {
  /** Escrow fee, basis points of gross price. */
  escrowRateBps: number;
  /** Title fee, basis points of gross price. */
  titleRateBps: number;
  /** Transfer tax, basis points of gross price. */
  transferTaxRateBps: number;
  /** Flat recording fees, dollars. */
  recordingFees: number;
  /** Flat home warranty, dollars. */
  homeWarranty: number;
  /** Multiplier applied to renovation spend when computing the lift. */
  renovationMultiplier: number;
  /** Condition tier adjustments as fractions. */
  conditionTierAdjustments: Record<ConditionTier, number>;
  /** Section 121 exclusion amounts in dollars, keyed by status. */
  section121Exemptions: Record<Section121Status, number>;
  /** Days in the property-tax year used for proration. */
  taxYearDays: number;
  /** Months in a year used for simple-interest accrual. */
  monthsPerYear: number;
  /** Basis points in 100%. */
  bpsDenominator: number;
  /** Months in a year used for HECM monthly compounding. */
  hecmMonthsPerYear: number;
  /**
   * Upper bound for a finite HECM accrued payoff. Values above this are treated
   * as overflow and rejected rather than surfaced as a bogus number.
   */
  hecmMaxAccruedPayoff: number;
  /** Days in the friction carrying-cost month used by the v1.1 model. */
  frictionDaysPerMonth: number;
  /** Calculator version string. */
  calculatorVersion: string;
}

/** The single canonical defaults object. */
export const SELLER_NET_CONFIG: SellerNetConfig = {
  escrowRateBps: 50,
  titleRateBps: 40,
  transferTaxRateBps: 11,
  recordingFees: 300,
  homeWarranty: 0,
  renovationMultiplier: 1.0,
  conditionTierAdjustments: CONDITION_TIER_ADJUSTMENTS,
  section121Exemptions: SECTION_121_EXEMPTIONS,
  taxYearDays: 365,
  monthsPerYear: 12,
  bpsDenominator: 10000,
  hecmMonthsPerYear: 12,
  hecmMaxAccruedPayoff: 1_000_000_000,
  frictionDaysPerMonth: 30,
  calculatorVersion: CALCULATOR_VERSION,
};

/**
 * Ordered extension points for future adjustment modules. Empty today; HECM,
 * Section 121, and market-friction modules append here without core changes.
 */
export const ADJUSTMENT_MODULES: readonly string[] = [];
