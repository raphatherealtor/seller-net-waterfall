import {
  ADJUSTMENT_MODULES,
  type AdjustmentModule,
  CALCULATOR_VERSION,
  type SellerNetInput,
  type SellerNetOutput,
  calculateSellerNetWaterfall,
  computeInputHash,
  defaultAssumption,
  roundMoney,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * Canonical calculator public-contract characterization.
 *
 * A provider-neutral MCP integration layer is being added on top of this app.
 * Its one non-negotiable rule is that it delegates ALL financial math to the
 * canonical calculator and never re-derives a figure. These tests freeze the
 * exact seam that layer consumes — the complete `SellerNetResult` envelope for a
 * representative input, the `AdjustmentModule` extension point, and the
 * determinism guarantees — so an integration layer that quietly recomputes a
 * value, reshapes the result, or mutates the extension contract is caught here
 * rather than in front of a user.
 *
 * They deliberately assert only behavior that exists today; no MCP code is
 * exercised. The existing per-formula suites stay authoritative for the
 * individual lines; this file pins the whole-output contract they compose into.
 */

/** A complete, calculable input with every field explicitly provided. */
function baseInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
  return {
    basePrice: userProvided(500_000),
    manualAdjustedPrice: userProvided(0),
    conditionTier: "GOOD",
    listingCommissionRateBps: userProvided(250),
    buyerCommissionRateBps: userProvided(250),
    escrowRateBps: defaultAssumption(50),
    titleRateBps: defaultAssumption(40),
    transferTaxRateBps: defaultAssumption(11),
    recordingFees: defaultAssumption(300),
    homeWarranty: defaultAssumption(0),
    annualPropertyTax: userProvided(3_650),
    taxDaysElapsed: userProvided(365),
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

describe("canonical result envelope", () => {
  it("returns exactly output, inputHash, and calculatorVersion", () => {
    const result = calculateSellerNetWaterfall(baseInput());
    expect(Object.keys(result).sort()).toEqual([
      "calculatorVersion",
      "inputHash",
      "output",
    ]);
    expect(result.calculatorVersion).toBe(CALCULATOR_VERSION);
    expect(result.calculatorVersion).toBe("SELLER_NET_WATERFALL v1.4.0");
    expect(result.inputHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("freezes the complete output for a representative input", () => {
    // Every figure below is derived from the documented formulas:
    //   gross = 500,000 (GOOD tier, no manual price, no renovation)
    //   commissions = 2 × 500,000 × 250/10000 = 25,000
    //   closing = 2,500 escrow + 2,000 title + 550 transfer + 3,650 prorated
    //             + 300 recording + 0 warranty = 9,000
    //   encumbrances = 300,000 verified payoff
    //   deductions = 300,000 + 25,000 + 9,000 = 334,000
    //   nominalNet = 500,000 − 334,000 = 166,000
    const { output } = calculateSellerNetWaterfall(baseInput());
    expect(output).toEqual({
      baseAdjustedPrice: 500_000,
      conditionAdjustmentPct: 0,
      renovationLift: 0,
      grossPrice: 500_000,
      listingCommission: 12_500,
      buyerCommission: 12_500,
      totalCommissions: 25_000,
      escrowFee: 2_500,
      titleFee: 2_000,
      transferTax: 550,
      proratedPropertyTax: 3_650,
      totalClosingCosts: 9_000,
      interestAccrual: 0,
      mortgagePayoff: 300_000,
      totalEncumbrances: 300_000,
      totalDeductions: 334_000,
      nominalNet: 166_000,
      estimatedNetProceeds: 166_000,
      estimatedSellerShortfall: 0,
      hecmAccruedPayoff: null,
      hecmBalanceShortfall: null,
      hudNonRecourseDeficit: null,
      professionalReviewDomains: ["ESCROW", "TITLE"],
      adjustedBasis: 0,
      capitalGain: 0,
      section121Exemption: 0,
      taxableGain: 0,
      estimatedTaxOwed: 0,
      taxActive: false,
      section121EligibilityAssumed: false,
      carryingLoss: 0,
      staleDiscountLoss: 0,
      probabilisticTrueNet: 0,
      frictionActive: false,
    });
  });

  it("keeps the output JSON-serializable with no undefined or function values", () => {
    const { output } = calculateSellerNetWaterfall(baseInput());
    const roundTripped = JSON.parse(JSON.stringify(output)) as SellerNetOutput;
    expect(roundTripped).toEqual(output);
    for (const value of Object.values(output)) {
      expect(value).not.toBeUndefined();
      expect(typeof value).not.toBe("function");
    }
  });
});

describe("determinism guarantees an integration layer relies on", () => {
  it("produces byte-identical results for the same input object", () => {
    const input = baseInput({ renovationCost: userProvided(12_345.67) });
    const first = calculateSellerNetWaterfall(input);
    const second = calculateSellerNetWaterfall(input);
    expect(second).toEqual(first);
  });

  it("produces identical results for structurally equal but distinct inputs", () => {
    const first = calculateSellerNetWaterfall(baseInput());
    const second = calculateSellerNetWaterfall(baseInput());
    expect(second.output).toEqual(first.output);
    expect(second.inputHash).toBe(first.inputHash);
  });

  it("does not mutate the input it is given", () => {
    const input = baseInput();
    const before = JSON.parse(JSON.stringify(input)) as SellerNetInput;
    calculateSellerNetWaterfall(input);
    expect(input).toEqual(before);
  });
});

describe("AdjustmentModule extension point", () => {
  it("applies registered modules in order after the core waterfall", () => {
    const seen: string[] = [];
    const first: AdjustmentModule = {
      id: "first",
      label: "First",
      apply: (output) => {
        seen.push("first");
        return {
          ...output,
          estimatedNetProceeds: output.estimatedNetProceeds + 1,
        };
      },
    };
    const second: AdjustmentModule = {
      id: "second",
      label: "Second",
      apply: (output) => {
        seen.push("second");
        return {
          ...output,
          estimatedNetProceeds: output.estimatedNetProceeds + 10,
        };
      },
    };

    const baseline = calculateSellerNetWaterfall(baseInput()).output;
    const { output } = calculateSellerNetWaterfall(baseInput(), [
      first,
      second,
    ]);

    expect(seen).toEqual(["first", "second"]);
    expect(output.estimatedNetProceeds).toBe(
      baseline.estimatedNetProceeds + 11,
    );
  });

  it("leaves the core output untouched when no modules are registered", () => {
    const withNone = calculateSellerNetWaterfall(baseInput(), []).output;
    const withDefault = calculateSellerNetWaterfall(baseInput()).output;
    expect(withNone).toEqual(withDefault);
  });

  it("exposes an empty ordered module registry today", () => {
    expect(ADJUSTMENT_MODULES).toEqual([]);
  });
});

describe("roundMoney is the single rounding primitive", () => {
  it("rounds to cents and coerces non-finite values to 0", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.344)).toBe(2.34);
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("agrees with the input hash for a replayed input", () => {
    const input = baseInput({ hoaPayoff: userProvided(1_200) });
    const result = calculateSellerNetWaterfall(input);
    expect(result.inputHash).toBe(computeInputHash(input));
  });
});
