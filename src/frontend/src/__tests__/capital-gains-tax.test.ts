import {
  SECTION_121_EXEMPTIONS,
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  defaultAssumption,
  isCalculable,
  isTaxModuleActive,
  unknownField,
  userProvided,
  validateInput,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * Capital Gains / Section 121 tax module coverage.
 *
 * The tax module is optional and deterministic. It stays inactive while every
 * tax field is untouched; touching any one activates it, after which all
 * required tax inputs are required. UNKNOWN Section 121 status blocks the
 * calculation and is never silently defaulted to None, while an explicit 0 for
 * capital improvements or the tax rate is a valid value distinct from UNKNOWN.
 *
 * These tests pin the accepted formulas, the activation rule, the validation
 * contract, the provenance of the exclusion assumption, and the locked vector.
 * They are framework-free calculator tests — no view or backend is involved.
 */

/** A complete, calculable input with the tax module untouched (inactive). */
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
    // Friction module untouched: every friction field UNKNOWN keeps it inactive.
    monthlyCarryingCost: unknownField(),
    pctExpectedDom: unknownField(),
    pctExpectedDiscountPct: unknownField(),
    ...overrides,
  };
}

/** A complete, calculable input with the tax module active. */
function taxInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
  return baseInput({
    originalPurchasePrice: userProvided(300_000),
    capitalImprovements: userProvided(50_000),
    section121Status: "NONE",
    estimatedCapitalGainsTaxRateBps: userProvided(1_500),
    ...overrides,
  });
}

/**
 * The locked Section 121 vector. Its expected outputs are the accepted
 * benchmark and must not drift.
 */
function lockedTaxInput(): SellerNetInput {
  return baseInput({
    basePrice: userProvided(1_400_000),
    manualAdjustedPrice: userProvided(1_400_000),
    renovationCost: userProvided(0),
    listingCommissionRateBps: userProvided(0),
    buyerCommissionRateBps: userProvided(0),
    annualPropertyTax: userProvided(0),
    taxDaysElapsed: userProvided(0),
    mortgageBalance: userProvided(0),
    originalPurchasePrice: userProvided(350_000),
    capitalImprovements: userProvided(200_000),
    section121Status: "MARRIED",
    estimatedCapitalGainsTaxRateBps: userProvided(1_500),
  });
}

describe("tax module activation", () => {
  it("stays inactive while every tax field is untouched", () => {
    const input = baseInput();
    expect(isTaxModuleActive(input)).toBe(false);
    const { output } = calculateSellerNetWaterfall(input);
    expect(output.taxActive).toBe(false);
    expect(output.adjustedBasis).toBe(0);
    expect(output.capitalGain).toBe(0);
    expect(output.section121Exemption).toBe(0);
    expect(output.taxableGain).toBe(0);
    expect(output.estimatedTaxOwed).toBe(0);
    expect(output.section121EligibilityAssumed).toBe(false);
  });

  it("activates when only the original purchase price is touched", () => {
    const input = baseInput({ originalPurchasePrice: userProvided(300_000) });
    expect(isTaxModuleActive(input)).toBe(true);
    expect(calculateSellerNetWaterfall(input).output.taxActive).toBe(true);
  });

  it("activates when only capital improvements is touched", () => {
    const input = baseInput({ capitalImprovements: userProvided(0) });
    expect(isTaxModuleActive(input)).toBe(true);
  });

  it("activates when only the tax rate is touched", () => {
    const input = baseInput({
      estimatedCapitalGainsTaxRateBps: userProvided(1_500),
    });
    expect(isTaxModuleActive(input)).toBe(true);
  });

  it("activates when only the Section 121 status is chosen", () => {
    const input = baseInput({ section121Status: "NONE" });
    expect(isTaxModuleActive(input)).toBe(true);
  });

  it("treats an explicit 0 as touched, distinct from UNKNOWN", () => {
    expect(
      isTaxModuleActive(baseInput({ capitalImprovements: userProvided(0) })),
    ).toBe(true);
    expect(
      isTaxModuleActive(
        baseInput({ estimatedCapitalGainsTaxRateBps: userProvided(0) }),
      ),
    ).toBe(true);
    expect(isTaxModuleActive(baseInput())).toBe(false);
  });
});

describe("tax module validation", () => {
  it("requires every tax input once the module is active", () => {
    const result = validateInput(
      baseInput({ originalPurchasePrice: userProvided(300_000) }),
    );
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("capitalImprovements");
    expect(result.missingFields).toContain("estimatedCapitalGainsTaxRateBps");
    expect(result.missingFields).toContain("section121Status");
  });

  it("blocks the calculation on UNKNOWN Section 121 status rather than defaulting to None", () => {
    const input = taxInput({ section121Status: "UNKNOWN" });
    const result = validateInput(input);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("section121Status");
    expect(isCalculable(input)).toBe(false);
    // The calculator must not silently apply the None exclusion.
    const { output } = calculateSellerNetWaterfall(input);
    expect(output.taxActive).toBe(true);
    expect(output.section121Exemption).toBe(0);
    expect(output.estimatedTaxOwed).toBe(0);
  });

  it("accepts an explicit 0 for capital improvements", () => {
    const input = taxInput({ capitalImprovements: userProvided(0) });
    const result = validateInput(input);
    expect(result.missingFields).not.toContain("capitalImprovements");
    expect(result.valid).toBe(true);
    expect(isCalculable(input)).toBe(true);
  });

  it("accepts an explicit 0 for the tax rate", () => {
    const input = taxInput({
      estimatedCapitalGainsTaxRateBps: userProvided(0),
    });
    const result = validateInput(input);
    expect(result.missingFields).not.toContain(
      "estimatedCapitalGainsTaxRateBps",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a tax rate above 100%", () => {
    const result = validateInput(
      taxInput({ estimatedCapitalGainsTaxRateBps: userProvided(10_001) }),
    );
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (candidate) => candidate.field === "estimatedCapitalGainsTaxRateBps",
    );
    expect(issue?.message).toMatch(/between 0 and 10000/);
  });

  it("rejects NaN and Infinity tax values", () => {
    const nan = validateInput(
      taxInput({
        estimatedCapitalGainsTaxRateBps: {
          value: Number.NaN,
          provenance: "USER_PROVIDED",
        },
      }),
    );
    expect(nan.valid).toBe(false);
    expect(
      nan.issues.some(
        (issue) => issue.field === "estimatedCapitalGainsTaxRateBps",
      ),
    ).toBe(true);

    const infinite = validateInput(
      taxInput({
        originalPurchasePrice: {
          value: Number.POSITIVE_INFINITY,
          provenance: "USER_PROVIDED",
        },
      }),
    );
    expect(infinite.valid).toBe(false);
    expect(
      infinite.issues.some((issue) => issue.field === "originalPurchasePrice"),
    ).toBe(true);
  });

  it("rejects a negative original purchase price", () => {
    const result = validateInput(
      taxInput({ originalPurchasePrice: userProvided(-1) }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.field === "originalPurchasePrice"),
    ).toBe(true);
  });
});

describe("tax formulas", () => {
  it("computes adjusted basis as original purchase price + capital improvements", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({
        originalPurchasePrice: userProvided(350_000),
        capitalImprovements: userProvided(200_000),
      }),
    );
    expect(output.adjustedBasis).toBe(550_000);
  });

  it("floors capital gain at 0 when basis exceeds gross price", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({
        basePrice: userProvided(100_000),
        manualAdjustedPrice: userProvided(100_000),
        originalPurchasePrice: userProvided(500_000),
        capitalImprovements: userProvided(0),
      }),
    );
    expect(output.grossPrice).toBe(100_000);
    expect(output.adjustedBasis).toBe(500_000);
    expect(output.capitalGain).toBe(0);
    expect(output.taxableGain).toBe(0);
    expect(output.estimatedTaxOwed).toBe(0);
  });

  it("floors taxable gain at 0 when the exclusion covers the gain", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({
        basePrice: userProvided(400_000),
        manualAdjustedPrice: userProvided(400_000),
        originalPurchasePrice: userProvided(100_000),
        capitalImprovements: userProvided(0),
        section121Status: "MARRIED",
      }),
    );
    // gain 300,000 − 500,000 exclusion → 0 taxable.
    expect(output.capitalGain).toBe(300_000);
    expect(output.section121Exemption).toBe(500_000);
    expect(output.taxableGain).toBe(0);
    expect(output.estimatedTaxOwed).toBe(0);
  });

  it("applies the None exclusion as 0", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({ section121Status: "NONE" }),
    );
    expect(output.section121Exemption).toBe(0);
  });

  it("applies the Single exclusion of 250000", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({ section121Status: "SINGLE" }),
    );
    expect(output.section121Exemption).toBe(250_000);
  });

  it("applies the Married exclusion of 500000", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({ section121Status: "MARRIED" }),
    );
    expect(output.section121Exemption).toBe(500_000);
  });

  it("reads the exemption amounts from the shared canonical config only", () => {
    expect(SECTION_121_EXEMPTIONS).toEqual({
      UNKNOWN: 0,
      NONE: 0,
      SINGLE: 250_000,
      MARRIED: 500_000,
    });
    expect(SELLER_NET_CONFIG.section121Exemptions).toBe(SECTION_121_EXEMPTIONS);
  });

  it("computes estimated tax owed as taxable gain × rate bps / 10000, rounded to cents", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({
        basePrice: userProvided(500_000),
        manualAdjustedPrice: userProvided(500_000),
        originalPurchasePrice: userProvided(300_000),
        capitalImprovements: userProvided(0),
        section121Status: "NONE",
        estimatedCapitalGainsTaxRateBps: userProvided(1_500),
      }),
    );
    // gain 200,000; taxable 200,000; 200,000 × 1500 / 10000 = 30,000.
    expect(output.taxableGain).toBe(200_000);
    expect(output.estimatedTaxOwed).toBe(30_000);
  });

  it("rounds estimated tax owed to cents", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({
        basePrice: userProvided(333_333.33),
        manualAdjustedPrice: userProvided(333_333.33),
        originalPurchasePrice: userProvided(0),
        capitalImprovements: userProvided(0),
        section121Status: "NONE",
        estimatedCapitalGainsTaxRateBps: userProvided(1_234),
      }),
    );
    // 333,333.33 × 0.1234 = 41,133.332... → 41,133.33
    expect(output.estimatedTaxOwed).toBe(41_133.33);
  });

  it("excludes estimated tax owed from total deductions", () => {
    const { output } = calculateSellerNetWaterfall(taxInput());
    expect(output.estimatedTaxOwed).toBeGreaterThan(0);
    expect(output.totalDeductions).toBe(
      output.totalEncumbrances +
        output.totalCommissions +
        output.totalClosingCosts,
    );
  });

  it("deducts estimated tax owed from estimated net proceeds", () => {
    const { output } = calculateSellerNetWaterfall(taxInput());
    expect(output.estimatedNetProceeds).toBe(
      Math.max(0, output.nominalNet - output.estimatedTaxOwed),
    );
  });

  it("floors estimated net proceeds at 0 after tax", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({
        basePrice: userProvided(100_000),
        manualAdjustedPrice: userProvided(100_000),
        mortgageBalance: userProvided(0),
        originalPurchasePrice: userProvided(0),
        capitalImprovements: userProvided(0),
        section121Status: "NONE",
        estimatedCapitalGainsTaxRateBps: userProvided(10_000),
      }),
    );
    expect(output.estimatedNetProceeds).toBe(0);
  });

  it("includes estimated tax owed in the seller-shortfall calculation", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({
        basePrice: userProvided(100_000),
        manualAdjustedPrice: userProvided(100_000),
        mortgageBalance: userProvided(0),
        originalPurchasePrice: userProvided(0),
        capitalImprovements: userProvided(0),
        section121Status: "NONE",
        estimatedCapitalGainsTaxRateBps: userProvided(10_000),
      }),
    );
    expect(output.estimatedSellerShortfall).toBe(
      Math.max(
        0,
        output.totalDeductions + output.estimatedTaxOwed - output.grossPrice,
      ),
    );
    expect(output.estimatedSellerShortfall).toBeGreaterThan(0);
  });
});

describe("section121EligibilityAssumed provenance", () => {
  it("is false for None", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({ section121Status: "NONE" }),
    );
    expect(output.taxActive).toBe(true);
    expect(output.section121EligibilityAssumed).toBe(false);
  });

  it("is true for Single", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({ section121Status: "SINGLE" }),
    );
    expect(output.section121EligibilityAssumed).toBe(true);
  });

  it("is true for Married", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({ section121Status: "MARRIED" }),
    );
    expect(output.section121EligibilityAssumed).toBe(true);
  });

  it("is false while the module is inactive even though the status is UNKNOWN", () => {
    const { output } = calculateSellerNetWaterfall(baseInput());
    expect(output.taxActive).toBe(false);
    expect(output.section121EligibilityAssumed).toBe(false);
  });
});

describe("professional review domains", () => {
  it("adds CPA_TAX while the tax module is active", () => {
    const { output } = calculateSellerNetWaterfall(taxInput());
    expect(output.professionalReviewDomains).toContain("CPA_TAX");
  });

  it("omits CPA_TAX while the tax module is inactive", () => {
    const { output } = calculateSellerNetWaterfall(baseInput());
    expect(output.professionalReviewDomains).not.toContain("CPA_TAX");
  });

  it("includes both LENDER and CPA_TAX when HECM and tax are both active", () => {
    const { output } = calculateSellerNetWaterfall(
      taxInput({
        isHecm: true,
        hecmInitialBalance: userProvided(100_000),
        hecmCurrentRateBps: userProvided(0),
        hecmMonthsElapsed: userProvided(0),
      }),
    );
    expect(output.professionalReviewDomains).toContain("LENDER");
    expect(output.professionalReviewDomains).toContain("CPA_TAX");
  });
});

describe("locked Section 121 vector", () => {
  it("reproduces the accepted benchmark outputs", () => {
    const { output } = calculateSellerNetWaterfall(lockedTaxInput());
    expect(output.adjustedBasis).toBe(550_000);
    expect(output.capitalGain).toBe(850_000);
    expect(output.section121Exemption).toBe(500_000);
    expect(output.taxableGain).toBe(350_000);
    expect(output.estimatedTaxOwed).toBeCloseTo(52_500, 2);
    expect(output.taxActive).toBe(true);
    expect(output.section121EligibilityAssumed).toBe(true);
  });
});

describe("tax module determinism", () => {
  it("produces identical outputs and hash for identical tax inputs", () => {
    const input = taxInput();
    const first = calculateSellerNetWaterfall(input);
    const second = calculateSellerNetWaterfall(input);
    expect(second.output).toEqual(first.output);
    expect(second.inputHash).toBe(first.inputHash);
  });

  it("changes the hash when a tax input changes", () => {
    const a = calculateSellerNetWaterfall(taxInput()).inputHash;
    const b = calculateSellerNetWaterfall(
      taxInput({ capitalImprovements: userProvided(50_001) }),
    ).inputHash;
    expect(a).not.toBe(b);
  });
});
