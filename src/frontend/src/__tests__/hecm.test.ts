import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  calculateSellerNetWaterfallStrict,
  defaultAssumption,
  isCalculable,
  unknownField,
  userProvided,
  validateInput,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * HECM / Reverse Mortgage coverage.
 *
 * The HECM branch is a deterministic, framework-free calculation: when
 * `isHecm` is true the standard mortgage payoff is disabled (exactly 0) and the
 * accrued reverse-mortgage balance replaces it as the primary encumbrance. The
 * accrued balance compounds monthly at MIN(current rate, lifetime cap) and is
 * always an ESTIMATE — never a verified payoff.
 *
 * These tests pin the accepted formulas, the validation contract, the finite
 * output guard, the two informational shortfall figures, the LENDER review
 * domain, and the locked regression input. They also assert the inactive
 * standard-mortgage controls so the HECM branch cannot leak into the non-HECM
 * path.
 */

/** A complete, calculable non-HECM input with every field explicitly provided. */
function baseInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
  return {
    basePrice: userProvided(500_000),
    manualAdjustedPrice: userProvided(0),
    conditionTier: "GOOD",
    listingCommissionRateBps: userProvided(250),
    buyerCommissionRateBps: userProvided(250),
    escrowRateBps: defaultAssumption(SELLER_NET_CONFIG.escrowRateBps),
    titleRateBps: defaultAssumption(SELLER_NET_CONFIG.titleRateBps),
    transferTaxRateBps: defaultAssumption(SELLER_NET_CONFIG.transferTaxRateBps),
    recordingFees: defaultAssumption(SELLER_NET_CONFIG.recordingFees),
    homeWarranty: defaultAssumption(SELLER_NET_CONFIG.homeWarranty),
    annualPropertyTax: userProvided(6_000),
    taxDaysElapsed: userProvided(0),
    mortgageBalance: userProvided(300_000),
    mortgageRateBps: userProvided(0),
    mortgageMonthsRemaining: userProvided(0),
    mortgagePayoffMode: "VERIFIED_PAYOFF",
    hoaPayoff: userProvided(0),
    liensJudgments: userProvided(0),
    stagingPhotoCost: userProvided(0),
    sellerConcessionsToBuyer: userProvided(0),
    repairsCost: userProvided(0),
    renovationCost: userProvided(0),
    isHecm: false,
    hecmInitialBalance: unknownField(),
    hecmCurrentRateBps: unknownField(),
    hecmLifetimeCapBps: unknownField(),
    hecmMonthsElapsed: unknownField(),
    // Tax module untouched: every tax field UNKNOWN keeps it inactive.
    originalPurchasePrice: unknownField(),
    capitalImprovements: unknownField(),
    section121Status: "UNKNOWN",
    estimatedCapitalGainsTaxRateBps: unknownField(),
    // Friction module untouched: every friction field UNKNOWN keeps it inactive.
    monthlyCarryingCost: unknownField(),
    pctExpectedDom: unknownField(),
    pctExpectedDiscountPct: unknownField(),
    ...overrides,
  };
}

/** A complete, calculable HECM input with the four HECM fields provided. */
function hecmInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
  return baseInput({
    isHecm: true,
    hecmInitialBalance: userProvided(400_000),
    hecmCurrentRateBps: userProvided(500),
    hecmLifetimeCapBps: userProvided(0),
    hecmMonthsElapsed: userProvided(24),
    ...overrides,
  });
}

/**
 * The locked HECM regression input. Its expected outputs are the accepted
 * benchmark and must not drift.
 *
 * Known specification discrepancy: an older contradictory benchmark of
 * 844484.77 for `hecmAccruedPayoff` exists. It is documented here only and is
 * never asserted — the formula below is authoritative.
 */
function lockedHecmInput(): SellerNetInput {
  return baseInput({
    basePrice: userProvided(730_000),
    manualAdjustedPrice: userProvided(730_000),
    listingCommissionRateBps: userProvided(300),
    buyerCommissionRateBps: userProvided(250),
    escrowRateBps: userProvided(50),
    titleRateBps: userProvided(40),
    transferTaxRateBps: userProvided(11),
    annualPropertyTax: userProvided(2_000),
    taxDaysElapsed: userProvided(365),
    recordingFees: userProvided(0),
    homeWarranty: userProvided(0),
    mortgageBalance: userProvided(0),
    isHecm: true,
    hecmInitialBalance: userProvided(645_000),
    hecmCurrentRateBps: userProvided(580),
    hecmLifetimeCapBps: userProvided(714),
    hecmMonthsElapsed: userProvided(56),
    stagingPhotoCost: userProvided(2_500),
    sellerConcessionsToBuyer: userProvided(0),
    repairsCost: userProvided(0),
  });
}

describe("HECM off uses the standard mortgage path", () => {
  it("keeps mortgagePayoff as balance + interest and leaves HECM outputs null", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        mortgageBalance: userProvided(300_000),
        mortgageRateBps: userProvided(600),
        mortgageMonthsRemaining: userProvided(6),
        mortgagePayoffMode: "ESTIMATE",
      }),
    );
    expect(output.mortgagePayoff).toBe(309_000);
    expect(output.totalEncumbrances).toBe(309_000);
    expect(output.hecmAccruedPayoff).toBeNull();
    expect(output.hecmBalanceShortfall).toBeNull();
    expect(output.hudNonRecourseDeficit).toBeNull();
    expect(output.professionalReviewDomains).toEqual(["ESCROW", "TITLE"]);
  });
});

describe("HECM on disables the standard mortgage payoff", () => {
  it("sets mortgagePayoff to exactly 0 and ignores the standard balance", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({ mortgageBalance: userProvided(300_000) }),
    );
    expect(output.mortgagePayoff).toBe(0);
    expect(output.interestAccrual).toBe(0);
  });

  it("replaces the encumbrance with the accrued HECM balance", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        hecmInitialBalance: userProvided(400_000),
        hecmCurrentRateBps: userProvided(0),
        hecmMonthsElapsed: userProvided(0),
        hoaPayoff: userProvided(1_000),
        liensJudgments: userProvided(2_000),
      }),
    );
    // Zero rate and zero months: accrued = initial balance.
    expect(output.hecmAccruedPayoff).toBe(400_000);
    expect(output.totalEncumbrances).toBe(400_000 + 1_000 + 2_000);
  });
});

describe("HECM effective rate selection", () => {
  it("uses the current rate when it is below the lifetime cap", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        hecmInitialBalance: userProvided(100_000),
        hecmCurrentRateBps: userProvided(500),
        hecmLifetimeCapBps: userProvided(800),
        hecmMonthsElapsed: userProvided(12),
      }),
    );
    // 100000 × (1 + 0.05/12)^12 = 105116.19
    expect(output.hecmAccruedPayoff).toBeCloseTo(105_116.19, 2);
  });

  it("uses the lifetime cap when the current rate exceeds it", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        hecmInitialBalance: userProvided(100_000),
        hecmCurrentRateBps: userProvided(900),
        hecmLifetimeCapBps: userProvided(500),
        hecmMonthsElapsed: userProvided(12),
      }),
    );
    // Capped at 500 bps: same as the below-cap case.
    expect(output.hecmAccruedPayoff).toBeCloseTo(105_116.19, 2);
  });

  it("treats a zero lifetime cap as no cap and uses the current rate", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        hecmInitialBalance: userProvided(100_000),
        hecmCurrentRateBps: userProvided(900),
        hecmLifetimeCapBps: userProvided(0),
        hecmMonthsElapsed: userProvided(12),
      }),
    );
    // 100000 × (1 + 0.09/12)^12 = 109380.69
    expect(output.hecmAccruedPayoff).toBeCloseTo(109_380.69, 2);
  });
});

describe("HECM validation", () => {
  it("requires the initial balance when HECM is on", () => {
    const result = validateInput(
      hecmInput({ hecmInitialBalance: unknownField() }),
    );
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("hecmInitialBalance");
    expect(
      isCalculable(hecmInput({ hecmInitialBalance: unknownField() })),
    ).toBe(false);
  });

  it("requires the current rate when HECM is on", () => {
    const result = validateInput(
      hecmInput({ hecmCurrentRateBps: unknownField() }),
    );
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("hecmCurrentRateBps");
  });

  it("requires the elapsed months when HECM is on", () => {
    const result = validateInput(
      hecmInput({ hecmMonthsElapsed: unknownField() }),
    );
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("hecmMonthsElapsed");
  });

  it("keeps the lifetime cap optional when HECM is on", () => {
    const result = validateInput(
      hecmInput({ hecmLifetimeCapBps: unknownField() }),
    );
    expect(result.missingFields).not.toContain("hecmLifetimeCapBps");
    expect(result.valid).toBe(true);
  });

  it("does not require the HECM fields when HECM is off", () => {
    const result = validateInput(baseInput());
    expect(result.missingFields).not.toContain("hecmInitialBalance");
    expect(result.missingFields).not.toContain("hecmCurrentRateBps");
    expect(result.missingFields).not.toContain("hecmMonthsElapsed");
    expect(result.valid).toBe(true);
  });

  it("accepts explicit zeros as valid values, distinct from UNKNOWN", () => {
    const input = hecmInput({
      hecmInitialBalance: userProvided(0),
      hecmCurrentRateBps: userProvided(0),
      hecmMonthsElapsed: userProvided(0),
    });
    const result = validateInput(input);
    expect(result.missingFields).not.toContain("hecmInitialBalance");
    expect(result.missingFields).not.toContain("hecmCurrentRateBps");
    expect(result.missingFields).not.toContain("hecmMonthsElapsed");
    expect(result.valid).toBe(true);
    expect(isCalculable(input)).toBe(true);
  });

  it("rejects a negative HECM initial balance", () => {
    const result = validateInput(
      hecmInput({ hecmInitialBalance: userProvided(-1) }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.field === "hecmInitialBalance"),
    ).toBe(true);
  });

  it("rejects negative elapsed months", () => {
    const result = validateInput(
      hecmInput({ hecmMonthsElapsed: userProvided(-1) }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.field === "hecmMonthsElapsed"),
    ).toBe(true);
  });

  it("rejects a current rate above 10000 basis points", () => {
    const result = validateInput(
      hecmInput({ hecmCurrentRateBps: userProvided(10_001) }),
    );
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (candidate) => candidate.field === "hecmCurrentRateBps",
    );
    expect(issue?.message).toMatch(/between 0 and 10000/);
  });

  it("rejects a lifetime cap above 10000 basis points", () => {
    const result = validateInput(
      hecmInput({ hecmLifetimeCapBps: userProvided(10_001) }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.field === "hecmLifetimeCapBps"),
    ).toBe(true);
  });

  it("rejects a negative current rate", () => {
    const result = validateInput(
      hecmInput({ hecmCurrentRateBps: userProvided(-1) }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.field === "hecmCurrentRateBps"),
    ).toBe(true);
  });
});

describe("HECM finite-output guard", () => {
  it("rejects an overflowed accrued payoff instead of emitting Infinity", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        hecmInitialBalance: userProvided(1_000_000_000),
        hecmCurrentRateBps: userProvided(10_000),
        hecmLifetimeCapBps: userProvided(0),
        hecmMonthsElapsed: userProvided(10_000),
      }),
    );
    expect(output.hecmAccruedPayoff).toBe(0);
    expect(Number.isFinite(output.hecmAccruedPayoff as number)).toBe(true);
  });

  it("strict authoritative calculation rejects an overflowed HECM payoff", () => {
    expect(() =>
      calculateSellerNetWaterfallStrict(
        hecmInput({
          hecmInitialBalance: userProvided(1_000_000_000),
          hecmCurrentRateBps: userProvided(10_000),
          hecmLifetimeCapBps: userProvided(0),
          hecmMonthsElapsed: userProvided(10_000),
        }),
      ),
    ).toThrow(/HECM accrued payoff|non-finite/i);
  });

  it("never emits NaN or Infinity for non-finite HECM inputs", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        hecmInitialBalance: {
          value: Number.POSITIVE_INFINITY,
          provenance: "USER_PROVIDED",
        },
        hecmCurrentRateBps: { value: Number.NaN, provenance: "USER_PROVIDED" },
        hecmMonthsElapsed: {
          value: Number.POSITIVE_INFINITY,
          provenance: "USER_PROVIDED",
        },
      }),
    );
    for (const value of Object.values(output)) {
      if (typeof value === "number") {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});

describe("HECM shortfalls and provenance", () => {
  it("computes hecmBalanceShortfall as MAX(0, accrued − grossPrice)", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        basePrice: userProvided(100_000),
        manualAdjustedPrice: userProvided(100_000),
        hecmInitialBalance: userProvided(150_000),
        hecmCurrentRateBps: userProvided(0),
        hecmMonthsElapsed: userProvided(0),
      }),
    );
    expect(output.grossPrice).toBe(100_000);
    expect(output.hecmAccruedPayoff).toBe(150_000);
    expect(output.hecmBalanceShortfall).toBe(50_000);
  });

  it("reports a zero HECM balance shortfall when gross covers the accrued balance", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        basePrice: userProvided(500_000),
        manualAdjustedPrice: userProvided(500_000),
        hecmInitialBalance: userProvided(100_000),
        hecmCurrentRateBps: userProvided(0),
        hecmMonthsElapsed: userProvided(0),
      }),
    );
    expect(output.hecmBalanceShortfall).toBe(0);
  });

  it("sets hudNonRecourseDeficit to MAX(0, totalDeductions − grossPrice) when HECM is active", () => {
    const { output } = calculateSellerNetWaterfall(
      hecmInput({
        basePrice: userProvided(100_000),
        manualAdjustedPrice: userProvided(100_000),
        hecmInitialBalance: userProvided(150_000),
        hecmCurrentRateBps: userProvided(0),
        hecmMonthsElapsed: userProvided(0),
      }),
    );
    expect(output.hudNonRecourseDeficit).toBe(
      Math.max(0, output.totalDeductions - output.grossPrice),
    );
    expect(output.hudNonRecourseDeficit).toBe(output.estimatedSellerShortfall);
  });

  it("includes LENDER in professionalReviewDomains while HECM is active", () => {
    const { output } = calculateSellerNetWaterfall(hecmInput());
    expect(output.professionalReviewDomains).toContain("LENDER");
  });

  it("marks the HECM payoff as an ESTIMATE, never a verified payoff", () => {
    const { output } = calculateSellerNetWaterfall(hecmInput());
    // The calculator exposes no VERIFIED_PAYOFF provenance for the HECM
    // balance; the accrued figure is always an estimate.
    expect(output.hecmAccruedPayoff).not.toBeNull();
    expect(output.professionalReviewDomains).toContain("LENDER");
  });
});

describe("locked HECM regression input", () => {
  it("reproduces the accepted benchmark outputs", () => {
    const { output } = calculateSellerNetWaterfall(lockedHecmInput());
    expect(output.hecmAccruedPayoff).toBeCloseTo(844_939.45, 2);
    expect(output.totalDeductions).toBeCloseTo(896_962.45, 2);
    expect(output.estimatedNetProceeds).toBe(0);
    expect(output.hecmBalanceShortfall).toBeCloseTo(114_939.45, 2);
    expect(output.estimatedSellerShortfall).toBeCloseTo(166_962.45, 2);
    expect(output.hudNonRecourseDeficit).toBeCloseTo(166_962.45, 2);
    expect(output.mortgagePayoff).toBe(0);
  });
});
