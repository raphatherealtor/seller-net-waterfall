/**
 * Seller Net Waterfall — canonical type contract.
 *
 * This module is framework-free and deterministic. Every monetary value is a
 * plain number in dollars; every rate is an integer basis point (1 bp = 0.01%).
 * No formula lives here — types only.
 */

/** Provenance state attached to every input. */
export const PROVENANCE_STATES = [
  "USER_PROVIDED",
  "DEFAULT_ASSUMPTION",
  "ESTIMATE",
  "VERIFIED_PAYOFF",
  "UNKNOWN",
] as const;

export type ProvenanceState = (typeof PROVENANCE_STATES)[number];

/** Condition tiers that adjust the base price when no manual price is set. */
export const CONDITION_TIERS = [
  "NEEDS_WORK",
  "GOOD",
  "TURNKEY_10_PLUS",
] as const;

export type ConditionTier = (typeof CONDITION_TIERS)[number];

/** How the mortgage payoff is derived. */
export const MORTGAGE_PAYOFF_MODES = ["VERIFIED_PAYOFF", "ESTIMATE"] as const;

export type MortgagePayoffMode = (typeof MORTGAGE_PAYOFF_MODES)[number];

/**
 * Domains that must be reviewed by a licensed professional before the seller
 * relies on the projection. HECM projections always include LENDER; an active
 * tax projection adds CPA_TAX.
 */
export const PROFESSIONAL_REVIEW_DOMAINS = ["LENDER", "CPA_TAX"] as const;

export type ProfessionalReviewDomain =
  (typeof PROFESSIONAL_REVIEW_DOMAINS)[number];

/**
 * Section 121 primary-residence exclusion status. UNKNOWN means the seller has
 * not told us; it is never silently treated as None.
 */
export const SECTION_121_STATUSES = [
  "UNKNOWN",
  "NONE",
  "SINGLE",
  "MARRIED",
] as const;

export type Section121Status = (typeof SECTION_121_STATUSES)[number];

/**
 * A single input value plus its provenance. `value` is `null` when the field is
 * UNKNOWN — UNKNOWN is deliberately distinct from an explicit 0.
 */
export interface ProvenancedNumber {
  value: number | null;
  provenance: ProvenanceState;
}

/** Canonical calculator input. All fields are required; use UNKNOWN for gaps. */
export interface SellerNetInput {
  /** Base list price before any condition adjustment. */
  basePrice: ProvenancedNumber;
  /** When > 0, overrides basePrice and disables the condition adjustment. */
  manualAdjustedPrice: ProvenancedNumber;
  /** Condition tier applied to basePrice when manualAdjustedPrice is not set. */
  conditionTier: ConditionTier;

  /** Listing-side commission rate in basis points. */
  listingCommissionRateBps: ProvenancedNumber;
  /** Buyer-side commission rate in basis points. */
  buyerCommissionRateBps: ProvenancedNumber;

  /** Escrow fee rate in basis points of gross price. */
  escrowRateBps: ProvenancedNumber;
  /** Title fee rate in basis points of gross price. */
  titleRateBps: ProvenancedNumber;
  /** Transfer tax rate in basis points of gross price. */
  transferTaxRateBps: ProvenancedNumber;
  /** Flat recording fees in dollars. */
  recordingFees: ProvenancedNumber;
  /** Flat home warranty cost in dollars. */
  homeWarranty: ProvenancedNumber;

  /** Annual property tax in dollars, used for the proration. */
  annualPropertyTax: ProvenancedNumber;
  /** Days of the tax year elapsed at closing (0–365). */
  taxDaysElapsed: ProvenancedNumber;

  /** Outstanding mortgage principal in dollars. */
  mortgageBalance: ProvenancedNumber;
  /** Annual mortgage rate in basis points, used only for ESTIMATE mode. */
  mortgageRateBps: ProvenancedNumber;
  /** Whole months of interest accrued for ESTIMATE mode. */
  mortgageMonthsRemaining: ProvenancedNumber;
  /** Whether the payoff is verified or estimated. */
  mortgagePayoffMode: MortgagePayoffMode;

  /** HOA payoff in dollars. */
  hoaPayoff: ProvenancedNumber;
  /** Liens and judgments in dollars. */
  liensJudgments: ProvenancedNumber;

  /** Staging and photography cost in dollars. */
  stagingPhotoCost: ProvenancedNumber;
  /** Seller concessions to buyer in dollars. */
  sellerConcessionsToBuyer: ProvenancedNumber;
  /** Repair credits in dollars. */
  repairsCost: ProvenancedNumber;
  /** Renovation spend in dollars; also lifted by the renovation multiplier. */
  renovationCost: ProvenancedNumber;

  /**
   * When true the property carries a HECM / reverse mortgage and the standard
   * mortgage payoff path is disabled. The HECM fields below are then required.
   */
  isHecm: boolean;
  /** HECM initial (origination) balance in dollars. */
  hecmInitialBalance: ProvenancedNumber;
  /** HECM current accrual rate in basis points. */
  hecmCurrentRateBps: ProvenancedNumber;
  /** HECM lifetime interest-rate cap in basis points; optional (0 = no cap). */
  hecmLifetimeCapBps: ProvenancedNumber;
  /** Whole months elapsed since HECM origination. */
  hecmMonthsElapsed: ProvenancedNumber;

  /**
   * ── Optional capital-gains tax module ────────────────────────────────────
   * The tax module stays inactive while every tax field is untouched. Touching
   * any one of them activates it, after which all required tax inputs are
   * required. UNKNOWN is distinct from an explicit 0.
   */
  /** Original purchase price in dollars. */
  originalPurchasePrice: ProvenancedNumber;
  /** Capital improvements in dollars; an explicit 0 is valid. */
  capitalImprovements: ProvenancedNumber;
  /** Section 121 primary-residence exclusion status. */
  section121Status: Section121Status;
  /** Estimated capital-gains tax rate in basis points; explicit 0 is valid. */
  estimatedCapitalGainsTaxRateBps: ProvenancedNumber;

  /**
   * ── Optional market / time friction module ───────────────────────────────
   * The friction module stays inactive while every friction field is untouched.
   * Touching any one of them activates it, after which all three are required.
   * An explicit 0 counts as touched. Friction output is supplemental and never
   * replaces the primary estimatedNetProceeds figure.
   */
  /** Monthly carrying cost in dollars (taxes, insurance, utilities, upkeep). */
  monthlyCarryingCost: ProvenancedNumber;
  /** Expected days on market. */
  pctExpectedDom: ProvenancedNumber;
  /** Expected price discount as a decimal fraction (0.05 = 5%). */
  pctExpectedDiscountPct: ProvenancedNumber;
}

/** Every derived money line, rounded to cents. */
export interface SellerNetOutput {
  /** Price after manual override or condition adjustment. */
  baseAdjustedPrice: number;
  /** Percentage applied by the condition tier (0 when manual price wins). */
  conditionAdjustmentPct: number;
  /** Renovation spend × multiplier. */
  renovationLift: number;
  /** baseAdjustedPrice + renovationLift. */
  grossPrice: number;

  listingCommission: number;
  buyerCommission: number;
  totalCommissions: number;

  escrowFee: number;
  titleFee: number;
  transferTax: number;
  proratedPropertyTax: number;
  totalClosingCosts: number;

  /** Interest accrued in ESTIMATE mode (0 for VERIFIED_PAYOFF). */
  interestAccrual: number;
  mortgagePayoff: number;
  totalEncumbrances: number;

  totalDeductions: number;
  /** grossPrice − totalDeductions; may be negative. */
  nominalNet: number;
  /** MAX(0, nominalNet). */
  estimatedNetProceeds: number;
  /** MAX(0, totalDeductions − grossPrice). */
  estimatedSellerShortfall: number;

  /**
   * HECM accrued payoff (initial balance compounded monthly). `null` when HECM
   * is inactive. Always an ESTIMATE — verify with the lender.
   */
  hecmAccruedPayoff: number | null;
  /** MAX(0, hecmAccruedPayoff − grossPrice); `null` when HECM is inactive. */
  hecmBalanceShortfall: number | null;
  /**
   * HUD non-recourse deficit: MAX(0, totalDeductions − grossPrice) when HECM is
   * active, otherwise `null`. Same figure as estimatedSellerShortfall.
   */
  hudNonRecourseDeficit: number | null;
  /** Domains requiring professional review; empty when HECM is inactive. */
  professionalReviewDomains: readonly ProfessionalReviewDomain[];

  /**
   * ── Capital-gains tax outputs ────────────────────────────────────────────
   * All zero / false while the tax module is inactive. Estimated tax owed is
   * deliberately excluded from totalDeductions and applied only to the net and
   * shortfall figures.
   */
  /** originalPurchasePrice + capitalImprovements. */
  adjustedBasis: number;
  /** MAX(0, grossPrice − adjustedBasis). */
  capitalGain: number;
  /** Section 121 exclusion actually applied (0 when None or inactive). */
  section121Exemption: number;
  /** MAX(0, capitalGain − section121Exemption). */
  taxableGain: number;
  /** taxableGain × tax rate bps / 10000, rounded to cents. */
  estimatedTaxOwed: number;
  /** True while the tax module is active. */
  taxActive: boolean;
  /**
   * True only when a Single or Married exclusion assumption is actually used,
   * never merely because the module is active.
   */
  section121EligibilityAssumed: boolean;

  /**
   * ── Market / time friction outputs ───────────────────────────────────────
   * Supplemental only. These never replace or alter estimatedNetProceeds; they
   * are applied after estimated net (and after tax) to the already-computed
   * transaction costs. All zero / false while the friction module is inactive.
   */
  /** (pctExpectedDom / 30) × monthlyCarryingCost, rounded to cents. */
  carryingLoss: number;
  /** grossPrice × pctExpectedDiscountPct, rounded to cents. */
  staleDiscountLoss: number;
  /** MAX(0, estimatedNetProceeds − carryingLoss − staleDiscountLoss). */
  probabilisticTrueNet: number;
  /** True while the friction module is active. */
  frictionActive: boolean;
}

/** Result of a full calculation, including provenance echo and identity. */
export interface SellerNetResult {
  output: SellerNetOutput;
  /** Deterministic hash of the effective inputs. */
  inputHash: string;
  /** Calculator version that produced this result. */
  calculatorVersion: string;
}

/** A field-level validation problem. */
export interface ValidationIssue {
  /** Dot path of the offending input, e.g. "listingCommissionRateBps". */
  field: string;
  message: string;
}

/** Outcome of validating a SellerNetInput. */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** Required fields that are still UNKNOWN. */
  missingFields: string[];
}

/**
 * Extension point: an optional adjustment module that can post-process the
 * waterfall. Future HECM, Section 121, and market-friction modules register
 * here without touching the core formulas.
 */
export interface AdjustmentModule {
  id: string;
  label: string;
  /** Pure transform applied in registration order. */
  apply: (output: SellerNetOutput, input: SellerNetInput) => SellerNetOutput;
}
