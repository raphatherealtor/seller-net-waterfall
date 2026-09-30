import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  computeInputHash,
  defaultAssumption,
  serializeInput,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * Non-HECM baseline characterization.
 *
 * The HECM / Reverse Mortgage module is being added next. It intentionally
 * changes the waterfall ONLY when HECM is active: `mortgagePayoff` becomes 0,
 * `totalEncumbrances` switches to `hecmAccruedPayoff + hoaPayoff +
 * liensJudgments`, two informational shortfall outputs are added, and a
 * professional-review domain list including LENDER appears.
 *
 * With HECM off — the only state that exists today — every existing output must
 * remain byte-identical. These tests freeze the exact composition of the lines
 * HECM will touch, so a regression in the non-HECM path is caught rather than
 * silently absorbed by the new branch. They deliberately do NOT assert any
 * HECM-specific behavior; no HECM code exists yet.
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

describe("non-HECM mortgage payoff composition", () => {
  it("keeps mortgagePayoff as balance + interest when HECM is off", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        mortgageBalance: userProvided(300_000),
        mortgageRateBps: userProvided(600),
        mortgageMonthsRemaining: userProvided(6),
        mortgagePayoffMode: "ESTIMATE",
      }),
    );
    // 300,000 principal + 9,000 simple interest; HECM must not zero this.
    expect(output.interestAccrual).toBe(9_000);
    expect(output.mortgagePayoff).toBe(309_000);
  });

  it("keeps mortgagePayoff equal to the balance for VERIFIED_PAYOFF", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({ mortgagePayoffMode: "VERIFIED_PAYOFF" }),
    );
    expect(output.interestAccrual).toBe(0);
    expect(output.mortgagePayoff).toBe(300_000);
  });
});

describe("non-HECM totalEncumbrances composition", () => {
  it("sums mortgagePayoff + hoaPayoff + liensJudgments", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        mortgageBalance: userProvided(300_000),
        hoaPayoff: userProvided(1_200),
        liensJudgments: userProvided(4_500),
      }),
    );
    expect(output.mortgagePayoff).toBe(300_000);
    expect(output.totalEncumbrances).toBe(300_000 + 1_200 + 4_500);
  });

  it("includes accrued interest in the encumbrance total for ESTIMATE", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        mortgageBalance: userProvided(300_000),
        mortgageRateBps: userProvided(600),
        mortgageMonthsRemaining: userProvided(6),
        mortgagePayoffMode: "ESTIMATE",
        hoaPayoff: userProvided(1_000),
        liensJudgments: userProvided(2_000),
      }),
    );
    expect(output.totalEncumbrances).toBe(309_000 + 1_000 + 2_000);
  });
});

describe("non-HECM totalDeductions composition", () => {
  it("adds every seller-funded cost on top of encumbrances, commissions, and closing", () => {
    const { output } = calculateSellerNetWaterfall(
      baseInput({
        stagingPhotoCost: userProvided(1_500),
        sellerConcessionsToBuyer: userProvided(5_000),
        repairsCost: userProvided(2_500),
        renovationCost: userProvided(10_000),
      }),
    );
    expect(output.totalDeductions).toBe(
      output.totalEncumbrances +
        output.totalCommissions +
        output.totalClosingCosts +
        1_500 +
        5_000 +
        2_500 +
        10_000,
    );
  });
});

describe("non-HECM output shape", () => {
  it("exposes exactly the accepted output keys, with HECM and tax fields inactive", () => {
    const { output } = calculateSellerNetWaterfall(baseInput());
    // The HECM module always emits its four output keys; while HECM is inactive
    // the three numeric ones are null and the review-domain list is empty. The
    // capital-gains tax module always emits its seven keys; while inactive the
    // five money lines are 0 and both flags are false. The market/time friction
    // module always emits its four keys; while inactive the three money lines
    // are 0 and the flag is false.
    expect(Object.keys(output).sort()).toEqual(
      [
        "adjustedBasis",
        "baseAdjustedPrice",
        "buyerCommission",
        "capitalGain",
        "carryingLoss",
        "conditionAdjustmentPct",
        "escrowFee",
        "estimatedNetProceeds",
        "estimatedSellerShortfall",
        "estimatedTaxOwed",
        "frictionActive",
        "grossPrice",
        "hecmAccruedPayoff",
        "hecmBalanceShortfall",
        "hudNonRecourseDeficit",
        "interestAccrual",
        "listingCommission",
        "mortgagePayoff",
        "nominalNet",
        "probabilisticTrueNet",
        "professionalReviewDomains",
        "proratedPropertyTax",
        "renovationLift",
        "section121EligibilityAssumed",
        "section121Exemption",
        "staleDiscountLoss",
        "taxActive",
        "taxableGain",
        "titleFee",
        "totalClosingCosts",
        "totalCommissions",
        "totalDeductions",
        "totalEncumbrances",
        "transferTax",
      ].sort(),
    );
    expect(output.hecmAccruedPayoff).toBeNull();
    expect(output.hecmBalanceShortfall).toBeNull();
    expect(output.hudNonRecourseDeficit).toBeNull();
    expect(output.professionalReviewDomains).toEqual(["ESCROW", "TITLE"]);
    expect(output.taxActive).toBe(false);
    expect(output.section121EligibilityAssumed).toBe(false);
    expect(output.adjustedBasis).toBe(0);
    expect(output.capitalGain).toBe(0);
    expect(output.section121Exemption).toBe(0);
    expect(output.taxableGain).toBe(0);
    expect(output.estimatedTaxOwed).toBe(0);
    expect(output.frictionActive).toBe(false);
    expect(output.carryingLoss).toBe(0);
    expect(output.staleDiscountLoss).toBe(0);
    expect(output.probabilisticTrueNet).toBe(0);
  });
});

describe("non-HECM input hash stability", () => {
  it("serializes the accepted fields in a fixed order", () => {
    const serialized = serializeInput(baseInput());
    expect(serialized).toBe(
      [
        "basePrice=USER_PROVIDED:500000",
        "manualAdjustedPrice=USER_PROVIDED:0",
        "conditionTier=GOOD",
        "listingCommissionRateBps=USER_PROVIDED:250",
        "buyerCommissionRateBps=USER_PROVIDED:250",
        "escrowRateBps=DEFAULT_ASSUMPTION:50",
        "titleRateBps=DEFAULT_ASSUMPTION:40",
        "transferTaxRateBps=DEFAULT_ASSUMPTION:11",
        "recordingFees=DEFAULT_ASSUMPTION:300",
        "homeWarranty=DEFAULT_ASSUMPTION:0",
        "annualPropertyTax=USER_PROVIDED:6000",
        "taxDaysElapsed=USER_PROVIDED:0",
        "mortgageBalance=USER_PROVIDED:300000",
        "mortgageRateBps=USER_PROVIDED:0",
        "mortgageMonthsRemaining=USER_PROVIDED:0",
        "mortgagePayoffMode=VERIFIED_PAYOFF",
        "hoaPayoff=USER_PROVIDED:0",
        "liensJudgments=USER_PROVIDED:0",
        "stagingPhotoCost=USER_PROVIDED:0",
        "sellerConcessionsToBuyer=USER_PROVIDED:0",
        "repairsCost=USER_PROVIDED:0",
        "renovationCost=USER_PROVIDED:0",
        "isHecm=false",
        "hecmInitialBalance=UNKNOWN:null",
        "hecmCurrentRateBps=UNKNOWN:null",
        "hecmLifetimeCapBps=UNKNOWN:null",
        "hecmMonthsElapsed=UNKNOWN:null",
        "originalPurchasePrice=UNKNOWN:null",
        "capitalImprovements=UNKNOWN:null",
        "section121Status=UNKNOWN",
        "estimatedCapitalGainsTaxRateBps=UNKNOWN:null",
        "monthlyCarryingCost=UNKNOWN:null",
        "pctExpectedDom=UNKNOWN:null",
        "pctExpectedDiscountPct=UNKNOWN:null",
      ].join("|"),
    );
  });

  it("keeps the non-HECM input hash stable across a replay", () => {
    const input = baseInput({ hoaPayoff: userProvided(1_200) });
    const first = calculateSellerNetWaterfall(input);
    const second = calculateSellerNetWaterfall(input);
    expect(second.inputHash).toBe(first.inputHash);
    expect(second.inputHash).toBe(computeInputHash(input));
  });
});
