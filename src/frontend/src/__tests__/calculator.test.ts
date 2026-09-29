import {
  type ConditionTier,
  type MortgagePayoffMode,
  type ProvenancedNumber,
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  computeInputHash,
  defaultAssumption,
  isCalculable,
  roundMoney,
  unknownField,
  userProvided,
  validateInput,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * Canonical calculator coverage.
 *
 * These tests assert the accepted formulas and the invariants the whole app
 * depends on: one calculator, cents-rounded money, finite outputs, provenance
 * distinct from an explicit 0, and deterministic replay identity.
 */

/** A complete, calculable input with every field explicitly provided. */
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

function withTier(tier: ConditionTier): SellerNetInput {
  return baseInput({ conditionTier: tier });
}

function withPayoffMode(mode: MortgagePayoffMode): SellerNetInput {
  return baseInput({ mortgagePayoffMode: mode });
}

describe("condition tier price logic", () => {
  it("applies -10% for NEEDS_WORK", () => {
    const { output } = calculateSellerNetWaterfall(withTier("NEEDS_WORK"));
    expect(output.conditionAdjustmentPct).toBe(-0.1);
    expect(output.baseAdjustedPrice).toBe(450_000);
  });

  it("applies 0% for GOOD", () => {
    const { output } = calculateSellerNetWaterfall(withTier("GOOD"));
    expect(output.conditionAdjustmentPct).toBe(0);
    expect(output.baseAdjustedPrice).toBe(500_000);
  });

  it("applies +10% for TURNKEY_10_PLUS", () => {
    const { output } = calculateSellerNetWaterfall(withTier("TURNKEY_10_PLUS"));
    expect(output.conditionAdjustmentPct).toBe(0.1);
    expect(output.baseAdjustedPrice).toBe(550_000);
  });

  it("lets a manual adjusted price override the tier and zero the adjustment", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        conditionTier: "NEEDS_WORK",
        manualAdjustedPrice: userProvided(600_000),
      }),
    );
    expect(output.conditionAdjustmentPct).toBe(0);
    expect(output.baseAdjustedPrice).toBe(600_000);
  });

  it("ignores a manual price of exactly 0 and keeps the tier", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        conditionTier: "TURNKEY_10_PLUS",
        manualAdjustedPrice: userProvided(0),
      }),
    );
    expect(output.conditionAdjustmentPct).toBe(0.1);
    expect(output.baseAdjustedPrice).toBe(550_000);
  });
});

describe("canonical config defaults", () => {
  it("holds the accepted default assumptions", () => {
    expect(SELLER_NET_CONFIG.escrowRateBps).toBe(50);
    expect(SELLER_NET_CONFIG.titleRateBps).toBe(40);
    expect(SELLER_NET_CONFIG.transferTaxRateBps).toBe(11);
    expect(SELLER_NET_CONFIG.recordingFees).toBe(300);
    expect(SELLER_NET_CONFIG.homeWarranty).toBe(0);
    expect(SELLER_NET_CONFIG.renovationMultiplier).toBe(1.0);
    expect(SELLER_NET_CONFIG.conditionTierAdjustments).toEqual({
      NEEDS_WORK: -0.1,
      GOOD: 0,
      TURNKEY_10_PLUS: 0.1,
    });
  });
});

describe("commission and closing-cost formulas", () => {
  it("computes each rate line from the gross price in basis points", () => {
    const { output } = calculateSellerNetWaterfall(baseInput());
    // gross = 500,000; 250 bps = 2.5% each side.
    expect(output.listingCommission).toBe(12_500);
    expect(output.buyerCommission).toBe(12_500);
    expect(output.totalCommissions).toBe(25_000);
    // 50 bps escrow, 40 bps title, 11 bps transfer tax on the gross price.
    expect(output.escrowFee).toBe(2_500);
    expect(output.titleFee).toBe(2_000);
    expect(output.transferTax).toBe(550);
    // Flat recording fees plus the zero warranty.
    expect(output.totalClosingCosts).toBe(2_500 + 2_000 + 550 + 300);
  });

  it("sums encumbrances, deductions, and nominal net exactly", () => {
    const { output } = calculateSellerNetWaterfall(baseInput());
    expect(output.totalEncumbrances).toBe(300_000);
    expect(output.totalDeductions).toBe(
      roundMoney(
        output.totalEncumbrances +
          output.totalCommissions +
          output.totalClosingCosts,
      ),
    );
    expect(output.nominalNet).toBe(
      roundMoney(output.grossPrice - output.totalDeductions),
    );
  });
});

describe("renovation lift", () => {
  it("adds renovationCost × multiplier to gross price and deducts the cost", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({ renovationCost: userProvided(20_000) }),
    );
    expect(output.renovationLift).toBe(20_000);
    expect(output.grossPrice).toBe(520_000);
    // The renovation spend is also a deduction.
    expect(output.totalDeductions).toBeGreaterThanOrEqual(20_000);
  });
});

describe("prorated property tax", () => {
  it("yields $0 when taxDaysElapsed is 0", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        annualPropertyTax: userProvided(3_650),
        taxDaysElapsed: userProvided(0),
      }),
    );
    expect(output.proratedPropertyTax).toBe(0);
  });

  it("yields the full annual tax when taxDaysElapsed is 365", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        annualPropertyTax: userProvided(3_650),
        taxDaysElapsed: userProvided(365),
      }),
    );
    expect(output.proratedPropertyTax).toBe(3_650);
  });
});

describe("mortgage payoff", () => {
  it("uses the balance unchanged for VERIFIED_PAYOFF", () => {
    const { output } = calculateSellerNetWaterfall(
      withPayoffMode("VERIFIED_PAYOFF"),
    );
    expect(output.interestAccrual).toBe(0);
    expect(output.mortgagePayoff).toBe(300_000);
  });

  it("accrues simple interest over months remaining for ESTIMATE", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        mortgagePayoffMode: "ESTIMATE",
        mortgageBalance: userProvided(300_000),
        mortgageRateBps: userProvided(600),
        mortgageMonthsRemaining: userProvided(6),
      }),
    );
    // 300000 × 0.06 × 6 / 12 = 9000
    expect(output.interestAccrual).toBe(9_000);
    expect(output.mortgagePayoff).toBe(309_000);
  });
});

describe("net proceeds and shortfall", () => {
  it("reports a shortfall and zero net when deductions exceed gross price", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        basePrice: userProvided(100_000),
        mortgageBalance: userProvided(500_000),
      }),
    );
    expect(output.nominalNet).toBeLessThan(0);
    expect(output.estimatedNetProceeds).toBe(0);
    expect(output.estimatedSellerShortfall).toBe(
      roundMoney(output.totalDeductions - output.grossPrice),
    );
    expect(output.estimatedSellerShortfall).toBeGreaterThan(0);
  });

  it("reports zero shortfall when gross price covers deductions", () => {
    const { output } = calculateSellerNetWaterfall(baseInput());
    expect(output.estimatedNetProceeds).toBeGreaterThan(0);
    expect(output.estimatedSellerShortfall).toBe(0);
  });
});

describe("output invariants", () => {
  it("rounds every money line to cents", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({ basePrice: userProvided(333_333.333) }),
    );
    // The output also carries the non-numeric professionalReviewDomains list;
    // the money invariant applies to every numeric line.
    for (const value of Object.values(output)) {
      if (typeof value !== "number") continue;
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.round(value * 100) / 100).toBe(value);
    }
  });

  it("never emits NaN or Infinity even for non-finite inputs", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        basePrice: {
          value: Number.POSITIVE_INFINITY,
          provenance: "USER_PROVIDED",
        },
        annualPropertyTax: { value: Number.NaN, provenance: "USER_PROVIDED" },
      }),
    );
    for (const value of Object.values(output)) {
      if (typeof value !== "number") continue;
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("deterministic replay identity", () => {
  it("produces identical outputs and hash for identical inputs", () => {
    const input = baseInput({ renovationCost: userProvided(12_345.67) });
    const first = calculateSellerNetWaterfall(input);
    const second = calculateSellerNetWaterfall(input);
    expect(second.output).toEqual(first.output);
    expect(second.inputHash).toBe(first.inputHash);
    expect(second.calculatorVersion).toBe(first.calculatorVersion);
  });

  it("changes the hash when an effective input changes", () => {
    const a = computeInputHash(baseInput());
    const b = computeInputHash(baseInput({ basePrice: userProvided(500_001) }));
    expect(a).not.toBe(b);
  });
});

describe("validation and provenance", () => {
  it("blocks calculation and names the missing field when required input is UNKNOWN", () => {
    const input = baseInput({ basePrice: unknownField() });
    const result = validateInput(input);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("basePrice");
    expect(isCalculable(input)).toBe(false);
  });

  it("does not block on an explicit 0", () => {
    const input = baseInput({ basePrice: userProvided(0) });
    const result = validateInput(input);
    expect(result.missingFields).not.toContain("basePrice");
    expect(result.valid).toBe(true);
  });

  it("rejects a basis-point rate above 10000 with a field-level message", () => {
    const input = baseInput({ listingCommissionRateBps: userProvided(10_001) });
    const result = validateInput(input);
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (candidate) => candidate.field === "listingCommissionRateBps",
    );
    expect(issue?.message).toMatch(/between 0 and 10000/);
  });

  it("rejects a negative dollar value", () => {
    const input = baseInput({ recordingFees: userProvided(-1) });
    const result = validateInput(input);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "recordingFees")).toBe(
      true,
    );
  });

  it("treats UNKNOWN as distinct from an explicit 0", () => {
    const unknown: ProvenancedNumber = unknownField();
    const zero: ProvenancedNumber = userProvided(0);
    expect(unknown.value).toBeNull();
    expect(zero.value).toBe(0);
  });
});
