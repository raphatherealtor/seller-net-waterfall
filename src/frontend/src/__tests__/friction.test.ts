import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  defaultAssumption,
  isCalculable,
  isFrictionModuleActive,
  unknownField,
  userProvided,
  validateInput,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * Market / time friction module coverage.
 *
 * The friction module is optional and deterministic. It stays inactive while
 * every friction field is untouched; touching any one activates it, after which
 * all three are required. An explicit 0 counts as touched. Friction output is
 * SUPPLEMENTAL: it never replaces or alters the primary estimatedNetProceeds.
 *
 * These are framework-free calculator tests — no view or backend is involved.
 */

/** A complete, calculable input with the friction module untouched (inactive). */
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
    originalPurchasePrice: unknownField(),
    capitalImprovements: unknownField(),
    section121Status: "UNKNOWN",
    estimatedCapitalGainsTaxRateBps: unknownField(),
    monthlyCarryingCost: unknownField(),
    pctExpectedDom: unknownField(),
    pctExpectedDiscountPct: unknownField(),
    ...overrides,
  };
}

/** A complete, calculable input with the friction module active. */
function frictionInput(
  overrides: Partial<SellerNetInput> = {},
): SellerNetInput {
  return baseInput({
    monthlyCarryingCost: userProvided(3_000),
    pctExpectedDom: userProvided(60),
    pctExpectedDiscountPct: userProvided(0.05),
    ...overrides,
  });
}

describe("friction module activation", () => {
  it("stays inactive while every friction field is untouched", () => {
    const input = baseInput();
    expect(isFrictionModuleActive(input)).toBe(false);
    const { output } = calculateSellerNetWaterfall(input);
    expect(output.frictionActive).toBe(false);
    expect(output.carryingLoss).toBe(0);
    expect(output.staleDiscountLoss).toBe(0);
    expect(output.probabilisticTrueNet).toBe(0);
  });

  it("activates when only the monthly carrying cost is touched", () => {
    const input = baseInput({ monthlyCarryingCost: userProvided(3_000) });
    expect(isFrictionModuleActive(input)).toBe(true);
    expect(calculateSellerNetWaterfall(input).output.frictionActive).toBe(true);
  });

  it("activates when only the expected days on market is touched", () => {
    const input = baseInput({ pctExpectedDom: userProvided(60) });
    expect(isFrictionModuleActive(input)).toBe(true);
  });

  it("activates when only the expected discount is touched", () => {
    const input = baseInput({ pctExpectedDiscountPct: userProvided(0.05) });
    expect(isFrictionModuleActive(input)).toBe(true);
  });

  it("treats an explicit 0 as touched, distinct from UNKNOWN", () => {
    expect(
      isFrictionModuleActive(
        baseInput({ monthlyCarryingCost: userProvided(0) }),
      ),
    ).toBe(true);
    expect(
      isFrictionModuleActive(baseInput({ pctExpectedDom: userProvided(0) })),
    ).toBe(true);
    expect(
      isFrictionModuleActive(
        baseInput({ pctExpectedDiscountPct: userProvided(0) }),
      ),
    ).toBe(true);
    expect(isFrictionModuleActive(baseInput())).toBe(false);
  });
});

describe("friction module validation", () => {
  it("requires every friction input once the module is active", () => {
    const result = validateInput(
      baseInput({ monthlyCarryingCost: userProvided(3_000) }),
    );
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("pctExpectedDom");
    expect(result.missingFields).toContain("pctExpectedDiscountPct");
  });

  it("accepts explicit zeros for all three friction fields", () => {
    const input = frictionInput({
      monthlyCarryingCost: userProvided(0),
      pctExpectedDom: userProvided(0),
      pctExpectedDiscountPct: userProvided(0),
    });
    const result = validateInput(input);
    expect(result.valid).toBe(true);
    expect(isCalculable(input)).toBe(true);
  });

  it("rejects a stale discount above 1 (100%) with a field-level error", () => {
    const result = validateInput(
      frictionInput({ pctExpectedDiscountPct: userProvided(1.01) }),
    );
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (candidate) => candidate.field === "pctExpectedDiscountPct",
    );
    expect(issue?.message).toMatch(/between 0 and 1/);
  });

  it("rejects a negative stale discount", () => {
    const result = validateInput(
      frictionInput({ pctExpectedDiscountPct: userProvided(-0.01) }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.field === "pctExpectedDiscountPct"),
    ).toBe(true);
  });

  it("rejects a negative monthly carrying cost", () => {
    const result = validateInput(
      frictionInput({ monthlyCarryingCost: userProvided(-1) }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.field === "monthlyCarryingCost"),
    ).toBe(true);
  });

  it("rejects a negative expected days on market", () => {
    const result = validateInput(
      frictionInput({ pctExpectedDom: userProvided(-1) }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.field === "pctExpectedDom"),
    ).toBe(true);
  });

  it("rejects NaN and Infinity friction values", () => {
    const nan = validateInput(
      frictionInput({
        monthlyCarryingCost: { value: Number.NaN, provenance: "USER_PROVIDED" },
      }),
    );
    expect(nan.valid).toBe(false);
    expect(
      nan.issues.some((issue) => issue.field === "monthlyCarryingCost"),
    ).toBe(true);

    const infinite = validateInput(
      frictionInput({
        pctExpectedDom: {
          value: Number.POSITIVE_INFINITY,
          provenance: "USER_PROVIDED",
        },
      }),
    );
    expect(infinite.valid).toBe(false);
    expect(
      infinite.issues.some((issue) => issue.field === "pctExpectedDom"),
    ).toBe(true);
  });
});

describe("friction formulas", () => {
  it("computes carryingLoss as (pctExpectedDom / 30) × monthlyCarryingCost", () => {
    const { output } = calculateSellerNetWaterfall(frictionInput());
    // (60 / 30) × 3000 = 6000
    expect(output.carryingLoss).toBe(6_000);
  });

  it("computes staleDiscountLoss as grossPrice × pctExpectedDiscountPct", () => {
    const { output } = calculateSellerNetWaterfall(frictionInput());
    // 500,000 × 0.05 = 25,000
    expect(output.staleDiscountLoss).toBe(25_000);
  });

  it("computes probabilisticTrueNet as MAX(0, net − carrying − stale discount)", () => {
    const { output } = calculateSellerNetWaterfall(frictionInput());
    expect(output.probabilisticTrueNet).toBe(
      Math.max(
        0,
        output.estimatedNetProceeds -
          output.carryingLoss -
          output.staleDiscountLoss,
      ),
    );
    // gross 500,000; deductions 300,000 + 25,000 + 5,350 = 330,350;
    // net 169,650; friction 6,000 + 25,000 = 31,000; true net 138,650.
    expect(output.estimatedNetProceeds).toBe(169_650);
    expect(output.probabilisticTrueNet).toBe(138_650);
  });

  it("floors probabilisticTrueNet at 0 when friction exceeds net proceeds", () => {
    const { output } = calculateSellerNetWaterfall(
      frictionInput({
        monthlyCarryingCost: userProvided(100_000),
        pctExpectedDom: userProvided(300),
        pctExpectedDiscountPct: userProvided(0.5),
      }),
    );
    expect(output.probabilisticTrueNet).toBe(0);
  });

  it("yields zero friction losses and net equal to net proceeds for explicit zeros", () => {
    const { output } = calculateSellerNetWaterfall(
      frictionInput({
        monthlyCarryingCost: userProvided(0),
        pctExpectedDom: userProvided(0),
        pctExpectedDiscountPct: userProvided(0),
      }),
    );
    expect(output.frictionActive).toBe(true);
    expect(output.carryingLoss).toBe(0);
    expect(output.staleDiscountLoss).toBe(0);
    expect(output.probabilisticTrueNet).toBe(output.estimatedNetProceeds);
  });

  it("never replaces the primary estimatedNetProceeds", () => {
    const withoutFriction = calculateSellerNetWaterfall(baseInput());
    const withFriction = calculateSellerNetWaterfall(frictionInput());
    expect(withFriction.output.estimatedNetProceeds).toBe(
      withoutFriction.output.estimatedNetProceeds,
    );
    expect(withFriction.output.totalDeductions).toBe(
      withoutFriction.output.totalDeductions,
    );
    expect(withFriction.output.grossPrice).toBe(
      withoutFriction.output.grossPrice,
    );
  });

  it("rounds every friction money line to cents", () => {
    const { output } = calculateSellerNetWaterfall(
      frictionInput({
        monthlyCarryingCost: userProvided(3_333.33),
        pctExpectedDom: userProvided(47),
        pctExpectedDiscountPct: userProvided(0.037),
      }),
    );
    for (const value of [
      output.carryingLoss,
      output.staleDiscountLoss,
      output.probabilisticTrueNet,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.round(value * 100) / 100).toBe(value);
    }
  });

  it("never emits NaN or Infinity for non-finite friction inputs", () => {
    const { output } = calculateSellerNetWaterfall(
      frictionInput({
        monthlyCarryingCost: {
          value: Number.POSITIVE_INFINITY,
          provenance: "USER_PROVIDED",
        },
        pctExpectedDom: { value: Number.NaN, provenance: "USER_PROVIDED" },
        pctExpectedDiscountPct: {
          value: Number.NEGATIVE_INFINITY,
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

  it("handles extreme but finite friction values without overflow", () => {
    const { output } = calculateSellerNetWaterfall(
      frictionInput({
        monthlyCarryingCost: userProvided(1_000_000_000),
        pctExpectedDom: userProvided(365),
        pctExpectedDiscountPct: userProvided(1),
      }),
    );
    for (const value of Object.values(output)) {
      if (typeof value === "number") {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(output.probabilisticTrueNet).toBe(0);
  });
});

describe("friction combined with other modules", () => {
  it("applies friction after Section 121 tax to the after-tax net", () => {
    const { output } = calculateSellerNetWaterfall(
      frictionInput({
        originalPurchasePrice: userProvided(300_000),
        capitalImprovements: userProvided(50_000),
        section121Status: "NONE",
        estimatedCapitalGainsTaxRateBps: userProvided(1_500),
      }),
    );
    expect(output.taxActive).toBe(true);
    expect(output.frictionActive).toBe(true);
    // net after tax 147,150; friction 31,000; true net 116,150.
    expect(output.estimatedNetProceeds).toBe(147_150);
    expect(output.probabilisticTrueNet).toBe(116_150);
  });

  it("applies friction alongside an active HECM projection", () => {
    const { output } = calculateSellerNetWaterfall(
      frictionInput({
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
        stagingPhotoCost: userProvided(2_500),
        isHecm: true,
        hecmInitialBalance: userProvided(645_000),
        hecmCurrentRateBps: userProvided(580),
        hecmLifetimeCapBps: userProvided(714),
        hecmMonthsElapsed: userProvided(56),
      }),
    );
    expect(output.hecmAccruedPayoff).toBeCloseTo(844_939.45, 2);
    expect(output.frictionActive).toBe(true);
    // The HECM shortfall is unchanged by friction; friction only affects the
    // supplemental probabilistic net.
    expect(output.estimatedNetProceeds).toBe(0);
    expect(output.probabilisticTrueNet).toBe(0);
    expect(output.estimatedSellerShortfall).toBeCloseTo(166_962.45, 2);
  });
});

describe("friction determinism", () => {
  it("produces identical outputs and hash for identical friction inputs", () => {
    const input = frictionInput();
    const first = calculateSellerNetWaterfall(input);
    const second = calculateSellerNetWaterfall(input);
    expect(second.output).toEqual(first.output);
    expect(second.inputHash).toBe(first.inputHash);
  });

  it("changes the hash when a friction input changes", () => {
    const a = calculateSellerNetWaterfall(frictionInput()).inputHash;
    const b = calculateSellerNetWaterfall(
      frictionInput({ pctExpectedDom: userProvided(61) }),
    ).inputHash;
    expect(a).not.toBe(b);
  });
});
