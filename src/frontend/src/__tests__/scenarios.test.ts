import {
  SCENARIO_DEFAULT_SPREAD,
  SCENARIO_KEYS,
  SCENARIO_LABELS,
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  computeScenarios,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * Price scenario comparison coverage.
 *
 * `computeScenarios()` owns no formula: it calls the canonical calculator once
 * per scenario with a single price override and reads every figure back from
 * the returned output. These tests pin the accepted contract: Downside /
 * Current / Upside in order, the default 25000 spread, the adjustable spread,
 * the delta versus Current, the clamped-price rule, and the containment of an
 * impossible scenario so it never crashes the primary net sheet.
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

function scenariosFor(input: SellerNetInput, spread?: number) {
  const current = calculateSellerNetWaterfall(input);
  return computeScenarios(input, current, spread);
}

describe("scenario shape and defaults", () => {
  it("exposes the accepted default spread and ordered keys", () => {
    expect(SCENARIO_DEFAULT_SPREAD).toBe(25_000);
    expect(SCENARIO_KEYS).toEqual(["downside", "current", "upside"]);
    expect(SCENARIO_LABELS).toEqual({
      downside: "Downside",
      current: "Current",
      upside: "Upside",
    });
  });

  it("returns Downside, Current, and Upside in order with the default spread", () => {
    const comparison = scenariosFor(baseInput());
    expect(comparison.spread).toBe(25_000);
    expect(comparison.scenarios.map((scenario) => scenario.key)).toEqual([
      "downside",
      "current",
      "upside",
    ]);
    expect(comparison.scenarios.map((scenario) => scenario.label)).toEqual([
      "Downside",
      "Current",
      "Upside",
    ]);
  });

  it("targets current gross ± spread", () => {
    const comparison = scenariosFor(baseInput());
    const [downside, current, upside] = comparison.scenarios;
    expect(current.requestedPrice).toBe(500_000);
    expect(downside.requestedPrice).toBe(475_000);
    expect(upside.requestedPrice).toBe(525_000);
  });

  it("applies an adjustable spread to the Downside and Upside targets", () => {
    const comparison = scenariosFor(baseInput(), 10_000);
    expect(comparison.spread).toBe(10_000);
    expect(comparison.scenarios[0].requestedPrice).toBe(490_000);
    expect(comparison.scenarios[2].requestedPrice).toBe(510_000);
  });

  it("falls back to the default spread for a non-finite or negative spread", () => {
    expect(scenariosFor(baseInput(), Number.NaN).spread).toBe(25_000);
    expect(scenariosFor(baseInput(), Number.POSITIVE_INFINITY).spread).toBe(
      25_000,
    );
    expect(scenariosFor(baseInput(), -1).spread).toBe(25_000);
  });
});

describe("scenario figures come from the canonical calculator", () => {
  it("displays the actual calculated grossPrice for each scenario", () => {
    const comparison = scenariosFor(baseInput());
    for (const scenario of comparison.scenarios) {
      expect(scenario.available).toBe(true);
      expect(scenario.figures).not.toBeNull();
      expect(scenario.figures?.grossPrice).toBe(scenario.requestedPrice);
    }
  });

  it("matches a direct canonical calculation for the same price override", () => {
    const input = baseInput();
    const comparison = scenariosFor(input);
    const upside = comparison.scenarios[2];
    const direct = calculateSellerNetWaterfall({
      ...input,
      manualAdjustedPrice: userProvided(525_000),
    });
    expect(upside.figures?.grossPrice).toBe(direct.output.grossPrice);
    expect(upside.figures?.commissions).toBe(direct.output.totalCommissions);
    expect(upside.figures?.closingCosts).toBe(direct.output.totalClosingCosts);
    expect(upside.figures?.mortgagePayoff).toBe(direct.output.mortgagePayoff);
    expect(upside.figures?.estimatedNetProceeds).toBe(
      direct.output.estimatedNetProceeds,
    );
  });

  it("reports the delta versus Current for Downside and Upside", () => {
    const comparison = scenariosFor(baseInput());
    const [downside, current, upside] = comparison.scenarios;
    expect(current.deltaVsCurrent).toBe(0);
    expect(downside.deltaVsCurrent).toBe(
      (downside.figures?.estimatedNetProceeds ?? 0) -
        (current.figures?.estimatedNetProceeds ?? 0),
    );
    expect(upside.deltaVsCurrent).toBe(
      (upside.figures?.estimatedNetProceeds ?? 0) -
        (current.figures?.estimatedNetProceeds ?? 0),
    );
    expect(downside.deltaVsCurrent).toBeLessThan(0);
    expect(upside.deltaVsCurrent).toBeGreaterThan(0);
  });

  it("exposes null tax and friction figures while those modules are inactive", () => {
    const comparison = scenariosFor(baseInput());
    for (const scenario of comparison.scenarios) {
      expect(scenario.figures?.estimatedTax).toBeNull();
      expect(scenario.figures?.frictionNet).toBeNull();
    }
  });

  it("exposes tax and friction figures when those modules are active", () => {
    const comparison = scenariosFor(
      baseInput({
        originalPurchasePrice: userProvided(300_000),
        capitalImprovements: userProvided(50_000),
        section121Status: "NONE",
        estimatedCapitalGainsTaxRateBps: userProvided(1_500),
        monthlyCarryingCost: userProvided(3_000),
        pctExpectedDom: userProvided(60),
        pctExpectedDiscountPct: userProvided(0.05),
      }),
    );
    for (const scenario of comparison.scenarios) {
      expect(scenario.figures?.estimatedTax).not.toBeNull();
      expect(scenario.figures?.frictionNet).not.toBeNull();
    }
  });
});

describe("scenario clamping and containment", () => {
  it("shows the actual clamped grossPrice when renovation lift forces a minimum", () => {
    // Renovation spend lifts the gross price by 100,000, so a requested
    // downside target below that minimum is clamped up to the actual price.
    const comparison = scenariosFor(
      baseInput({ renovationCost: userProvided(100_000) }),
    );
    const downside = comparison.scenarios[0];
    expect(downside.available).toBe(true);
    expect(downside.clamped).toBe(true);
    // The displayed price is the actual one, never the unachieved request:
    // requested 575,000 + 100,000 renovation lift = 675,000 actual.
    expect(downside.figures?.grossPrice).toBe(675_000);
    expect(downside.figures?.grossPrice).not.toBe(downside.requestedPrice);
    expect(downside.reason).toMatch(/clamped/i);
  });

  it("marks a scenario unavailable with a reason when the target is not a valid amount", () => {
    // A spread larger than the current price drives the downside target <= 0.
    const comparison = scenariosFor(baseInput(), 600_000);
    const downside = comparison.scenarios[0];
    expect(downside.available).toBe(false);
    expect(downside.figures).toBeNull();
    expect(downside.deltaVsCurrent).toBeNull();
    expect(downside.reason.length).toBeGreaterThan(0);
  });

  it("keeps the primary net sheet usable when a scenario is unavailable", () => {
    const input = baseInput();
    const current = calculateSellerNetWaterfall(input);
    const comparison = computeScenarios(input, current, 600_000);
    // The Current scenario is unaffected by the failing Downside.
    const currentScenario = comparison.scenarios[1];
    expect(currentScenario.available).toBe(true);
    expect(currentScenario.figures?.estimatedNetProceeds).toBe(
      current.output.estimatedNetProceeds,
    );
    // The primary result itself is untouched.
    expect(current.output.estimatedNetProceeds).toBeGreaterThan(0);
  });

  it("contains an invalid scenario without throwing", () => {
    const input = baseInput({ basePrice: unknownField() });
    const current = calculateSellerNetWaterfall(input);
    expect(() => computeScenarios(input, current)).not.toThrow();
    const comparison = computeScenarios(input, current);
    for (const scenario of comparison.scenarios) {
      expect(scenario.available).toBe(false);
      expect(scenario.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("scenario determinism", () => {
  it("produces identical scenarios for identical inputs", () => {
    const input = baseInput();
    const first = scenariosFor(input);
    const second = scenariosFor(input);
    expect(second).toEqual(first);
  });
});
