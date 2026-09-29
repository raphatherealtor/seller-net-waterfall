/**
 * Seller Net Waterfall — canonical calculator.
 *
 * The single source of truth for every formula. No view may re-derive any of
 * these values. All money is rounded to cents and every output is guaranteed
 * finite.
 */

import { SELLER_NET_CONFIG } from "./config";
import { computeInputHash } from "./hash";
import { valueOr } from "./provenance";
import type {
  AdjustmentModule,
  ProfessionalReviewDomain,
  SellerNetInput,
  SellerNetOutput,
  SellerNetResult,
} from "./types";
import { isFrictionModuleActive, isTaxModuleActive } from "./validation";

/** Round to cents, coercing non-finite results to 0. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Guard a computed value so NaN and Infinity never reach outputs or the UI. */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Rate in basis points applied to an amount. */
function applyBps(amount: number, bps: number): number {
  return roundMoney((amount * bps) / SELLER_NET_CONFIG.bpsDenominator);
}

/**
 * Compute the full waterfall. Pure and deterministic: identical inputs always
 * produce identical outputs and the same inputHash.
 */
export function calculateSellerNetWaterfall(
  input: SellerNetInput,
  modules: readonly AdjustmentModule[] = [],
): SellerNetResult {
  const cfg = SELLER_NET_CONFIG;

  // ── Price ────────────────────────────────────────────────────────────────
  const basePrice = valueOr(input.basePrice, 0);
  const manualPrice = valueOr(input.manualAdjustedPrice, 0);
  const hasManualPrice = manualPrice > 0;

  const conditionAdjustmentPct = hasManualPrice
    ? 0
    : cfg.conditionTierAdjustments[input.conditionTier];

  const baseAdjustedPrice = roundMoney(
    hasManualPrice ? manualPrice : basePrice * (1 + conditionAdjustmentPct),
  );

  const renovationCost = valueOr(input.renovationCost, 0);
  const renovationLift = roundMoney(renovationCost * cfg.renovationMultiplier);
  const grossPrice = roundMoney(baseAdjustedPrice + renovationLift);

  // ── Commissions ──────────────────────────────────────────────────────────
  const listingCommission = applyBps(
    grossPrice,
    valueOr(input.listingCommissionRateBps, 0),
  );
  const buyerCommission = applyBps(
    grossPrice,
    valueOr(input.buyerCommissionRateBps, 0),
  );
  const totalCommissions = roundMoney(listingCommission + buyerCommission);

  // ── Closing costs ────────────────────────────────────────────────────────
  const escrowFee = applyBps(grossPrice, valueOr(input.escrowRateBps, 0));
  const titleFee = applyBps(grossPrice, valueOr(input.titleRateBps, 0));
  const transferTax = applyBps(
    grossPrice,
    valueOr(input.transferTaxRateBps, 0),
  );
  const proratedPropertyTax = roundMoney(
    (valueOr(input.annualPropertyTax, 0) * valueOr(input.taxDaysElapsed, 0)) /
      cfg.taxYearDays,
  );
  const totalClosingCosts = roundMoney(
    escrowFee +
      titleFee +
      transferTax +
      proratedPropertyTax +
      valueOr(input.recordingFees, 0) +
      valueOr(input.homeWarranty, 0),
  );

  // ── Mortgage payoff ──────────────────────────────────────────────────────
  // HECM / reverse mortgage branch. When active, the standard mortgage payoff
  // is disabled entirely (mortgagePayoff is exactly 0) and the accrued HECM
  // balance replaces it as the primary encumbrance.
  //
  // Locked regression input (must not drift):
  //   basePrice=730000, manualAdjustedPrice=730000, listingCommissionRateBps=300,
  //   buyerCommissionRateBps=250, escrowRateBps=50, titleRateBps=40,
  //   transferTaxRateBps=11, annualPropertyTax=2000, taxDaysElapsed=365,
  //   recordingFees=0, homeWarranty=0, mortgageBalance=0, isHecm=true,
  //   hecmInitialBalance=645000, hecmCurrentRateBps=580, hecmLifetimeCapBps=714,
  //   hecmMonthsElapsed=56, stagingPhotoCost=2500, sellerConcessionsToBuyer=0,
  //   repairsCost=0
  //   → hecmAccruedPayoff ≈ 844939.45, totalDeductions ≈ 896962.45,
  //     estimatedNetProceeds = 0, hecmBalanceShortfall ≈ 114939.45,
  //     overall transaction shortfall ≈ 166962.45
  //
  // Known specification discrepancy: an older contradictory benchmark of
  // 844484.77 exists. It is documented here only and is never forced — the
  // formula below is authoritative.
  const isHecm = input.isHecm === true;

  const mortgageBalance = valueOr(input.mortgageBalance, 0);
  const interestAccrual =
    !isHecm && input.mortgagePayoffMode === "ESTIMATE"
      ? roundMoney(
          (mortgageBalance *
            (valueOr(input.mortgageRateBps, 0) / cfg.bpsDenominator) *
            valueOr(input.mortgageMonthsRemaining, 0)) /
            cfg.monthsPerYear,
        )
      : 0;

  let hecmAccruedPayoff: number | null = null;
  let hecmBalanceShortfall: number | null = null;
  let hudNonRecourseDeficit: number | null = null;
  let professionalReviewDomains: readonly ProfessionalReviewDomain[] = [];

  if (isHecm) {
    const hecmInitialBalance = valueOr(input.hecmInitialBalance, 0);
    const hecmCurrentRateBps = valueOr(input.hecmCurrentRateBps, 0);
    const hecmLifetimeCapBps = valueOr(input.hecmLifetimeCapBps, 0);
    const hecmMonthsElapsed = valueOr(input.hecmMonthsElapsed, 0);

    // The lifetime cap only binds when it is a positive rate.
    const effectiveRateBps =
      hecmLifetimeCapBps > 0
        ? Math.min(hecmCurrentRateBps, hecmLifetimeCapBps)
        : hecmCurrentRateBps;
    const monthlyRate =
      effectiveRateBps / cfg.bpsDenominator / cfg.hecmMonthsPerYear;

    const accrued = roundMoney(
      hecmInitialBalance * (1 + monthlyRate) ** hecmMonthsElapsed,
    );
    // Finite-output guard: never emit NaN / Infinity / overflow.
    hecmAccruedPayoff =
      Number.isFinite(accrued) && Math.abs(accrued) <= cfg.hecmMaxAccruedPayoff
        ? accrued
        : 0;

    professionalReviewDomains = ["LENDER"];
  }

  const mortgagePayoff = isHecm
    ? 0
    : roundMoney(mortgageBalance + interestAccrual);

  const totalEncumbrances = roundMoney(
    (isHecm ? (hecmAccruedPayoff ?? 0) : mortgagePayoff) +
      valueOr(input.hoaPayoff, 0) +
      valueOr(input.liensJudgments, 0),
  );

  // ── Deductions and net ───────────────────────────────────────────────────
  const totalDeductions = roundMoney(
    totalEncumbrances +
      totalCommissions +
      totalClosingCosts +
      valueOr(input.stagingPhotoCost, 0) +
      valueOr(input.sellerConcessionsToBuyer, 0) +
      valueOr(input.repairsCost, 0) +
      renovationCost,
  );

  const nominalNet = roundMoney(grossPrice - totalDeductions);

  // The overall transaction shortfall is the same MAX(0, totalDeductions −
  // grossPrice) figure under both names; hudNonRecourseDeficit is the
  // HECM-active label and must never diverge from estimatedSellerShortfall.
  const transactionShortfall = roundMoney(
    Math.max(0, totalDeductions - grossPrice),
  );

  if (isHecm && hecmAccruedPayoff !== null) {
    hecmBalanceShortfall = roundMoney(
      Math.max(0, hecmAccruedPayoff - grossPrice),
    );
    hudNonRecourseDeficit = transactionShortfall;
  }

  // ── Optional capital-gains tax module ────────────────────────────────────
  // The module is inactive while every tax field is untouched. Touching any one
  // activates it. UNKNOWN Section 121 status blocks the calculation entirely —
  // it is never silently defaulted to None.
  const taxActive = isTaxModuleActive(input);
  const section121Status = input.section121Status;

  let adjustedBasis = 0;
  let capitalGain = 0;
  let section121Exemption = 0;
  let taxableGain = 0;
  let estimatedTaxOwed = 0;
  let section121EligibilityAssumed = false;

  if (taxActive && section121Status !== "UNKNOWN") {
    adjustedBasis = roundMoney(
      valueOr(input.originalPurchasePrice, 0) +
        valueOr(input.capitalImprovements, 0),
    );
    capitalGain = roundMoney(Math.max(0, grossPrice - adjustedBasis));
    section121Exemption = cfg.section121Exemptions[section121Status];
    taxableGain = roundMoney(Math.max(0, capitalGain - section121Exemption));
    estimatedTaxOwed = applyBps(
      taxableGain,
      valueOr(input.estimatedCapitalGainsTaxRateBps, 0),
    );
    // Eligibility is assumed only when a Single or Married exclusion is
    // actually applied, never merely because the module is active.
    section121EligibilityAssumed =
      section121Status === "SINGLE" || section121Status === "MARRIED";
  }

  // Estimated tax owed is deliberately excluded from totalDeductions; it only
  // reduces the net and increases the shortfall.
  const netAfterTax = roundMoney(nominalNet - estimatedTaxOwed);
  const shortfallAfterTax = roundMoney(
    Math.max(0, totalDeductions + estimatedTaxOwed - grossPrice),
  );

  // ── Optional market / time friction module ───────────────────────────────
  // DELIBERATELY CONSERVATIVE v1.1 MODEL: the stale discount is applied to the
  // gross price AFTER the original sale-price transaction costs (commissions,
  // escrow, title, transfer tax, tax) have already been computed. The friction
  // figure therefore overstates the loss relative to a true discounted-price
  // waterfall, which is intentional — it is a conservative supplemental signal,
  // not a replacement for estimatedNetProceeds. Do not change this formula.
  const frictionActive = isFrictionModuleActive(input);

  let carryingLoss = 0;
  let staleDiscountLoss = 0;
  let probabilisticTrueNet = 0;

  if (frictionActive) {
    const monthlyCarryingCost = valueOr(input.monthlyCarryingCost, 0);
    const pctExpectedDom = valueOr(input.pctExpectedDom, 0);
    const pctExpectedDiscountPct = valueOr(input.pctExpectedDiscountPct, 0);

    carryingLoss = roundMoney(
      (pctExpectedDom / cfg.frictionDaysPerMonth) * monthlyCarryingCost,
    );
    staleDiscountLoss = roundMoney(grossPrice * pctExpectedDiscountPct);
    probabilisticTrueNet = roundMoney(
      Math.max(0, netAfterTax - carryingLoss - staleDiscountLoss),
    );
  }

  let output: SellerNetOutput = {
    baseAdjustedPrice,
    conditionAdjustmentPct,
    renovationLift,
    grossPrice,
    listingCommission,
    buyerCommission,
    totalCommissions,
    escrowFee,
    titleFee,
    transferTax,
    proratedPropertyTax,
    totalClosingCosts,
    interestAccrual,
    mortgagePayoff,
    totalEncumbrances,
    totalDeductions,
    nominalNet,
    estimatedNetProceeds: roundMoney(Math.max(0, netAfterTax)),
    estimatedSellerShortfall: shortfallAfterTax,
    hecmAccruedPayoff,
    hecmBalanceShortfall,
    hudNonRecourseDeficit,
    professionalReviewDomains: taxActive
      ? [...professionalReviewDomains, "CPA_TAX"]
      : professionalReviewDomains,
    adjustedBasis,
    capitalGain,
    section121Exemption,
    taxableGain,
    estimatedTaxOwed,
    taxActive,
    section121EligibilityAssumed,
    carryingLoss,
    staleDiscountLoss,
    probabilisticTrueNet,
    frictionActive,
  };

  // ── Extension points ─────────────────────────────────────────────────────
  for (const module of modules) {
    output = module.apply(output, input);
  }

  return {
    output: sanitizeOutput(output),
    inputHash: computeInputHash(input),
    calculatorVersion: cfg.calculatorVersion,
  };
}

/** Force every numeric field finite and cent-rounded. */
function sanitizeOutput(output: SellerNetOutput): SellerNetOutput {
  const sanitized = { ...output };
  for (const key of Object.keys(sanitized) as Array<keyof SellerNetOutput>) {
    const value = sanitized[key];
    if (typeof value === "number") {
      sanitized[key] = roundMoney(finite(value)) as never;
    }
  }
  return sanitized;
}
