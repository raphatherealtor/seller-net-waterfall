/**
 * Seller Net Waterfall — input validation.
 *
 * Rejects negative invalid values and any basis-point rate outside 0–10000 with
 * a clear field-level message, and reports which required fields are still
 * UNKNOWN. UNKNOWN is distinct from an explicit 0.
 */

import { SELLER_NET_CONFIG } from "./config";
import { fieldValue, isUnknown } from "./provenance";
import type {
  ProvenancedNumber,
  SellerNetInput,
  ValidationIssue,
  ValidationResult,
} from "./types";

/** Fields that must carry a value before a calculation can run. */
const REQUIRED_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "basePrice",
  "listingCommissionRateBps",
  "buyerCommissionRateBps",
  "escrowRateBps",
  "titleRateBps",
  "transferTaxRateBps",
  "recordingFees",
  "homeWarranty",
  "annualPropertyTax",
  "taxDaysElapsed",
  "mortgageBalance",
  "hoaPayoff",
  "liensJudgments",
  "stagingPhotoCost",
  "sellerConcessionsToBuyer",
  "repairsCost",
  "renovationCost",
];

/** Fields that must be non-negative dollars. */
const NON_NEGATIVE_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "basePrice",
  "manualAdjustedPrice",
  "recordingFees",
  "homeWarranty",
  "annualPropertyTax",
  "taxDaysElapsed",
  "mortgageBalance",
  "hoaPayoff",
  "liensJudgments",
  "stagingPhotoCost",
  "sellerConcessionsToBuyer",
  "repairsCost",
  "renovationCost",
];

/** Fields that must be a basis-point rate within 0–10000. */
const BPS_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "listingCommissionRateBps",
  "buyerCommissionRateBps",
  "escrowRateBps",
  "titleRateBps",
  "transferTaxRateBps",
  "mortgageRateBps",
];

/** Standard mortgage fields that HECM replaces. */
const STANDARD_MORTGAGE_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "mortgageBalance",
];

/** HECM fields required when isHecm is true. */
const HECM_REQUIRED_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "hecmInitialBalance",
  "hecmCurrentRateBps",
  "hecmMonthsElapsed",
];

/** HECM fields that must be non-negative dollars / whole months. */
const HECM_NON_NEGATIVE_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "hecmInitialBalance",
  "hecmMonthsElapsed",
];

/** HECM fields that must be a basis-point rate within 0–10000. */
const HECM_BPS_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "hecmCurrentRateBps",
  "hecmLifetimeCapBps",
];

/** Optional tax fields; touching any one activates the tax module. */
const TAX_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "originalPurchasePrice",
  "capitalImprovements",
  "estimatedCapitalGainsTaxRateBps",
];

/** Tax fields that must carry a value once the module is active. */
const TAX_REQUIRED_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "originalPurchasePrice",
  "capitalImprovements",
  "estimatedCapitalGainsTaxRateBps",
];

/** Tax fields that must be non-negative dollars. */
const TAX_NON_NEGATIVE_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "originalPurchasePrice",
  "capitalImprovements",
];

/** Tax fields that must be a basis-point rate within 0–10000. */
const TAX_BPS_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "estimatedCapitalGainsTaxRateBps",
];

/** Optional friction fields; touching any one activates the friction module. */
const FRICTION_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "monthlyCarryingCost",
  "pctExpectedDom",
  "pctExpectedDiscountPct",
];

/** Friction fields that must carry a value once the module is active. */
const FRICTION_REQUIRED_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "monthlyCarryingCost",
  "pctExpectedDom",
  "pctExpectedDiscountPct",
];

/** Friction fields that must be non-negative dollars / whole days. */
const FRICTION_NON_NEGATIVE_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "monthlyCarryingCost",
  "pctExpectedDom",
];

/** Friction fields that must be a decimal fraction within 0–1. */
const FRICTION_DECIMAL_FIELDS: ReadonlyArray<keyof SellerNetInput> = [
  "pctExpectedDiscountPct",
];

/**
 * True when the optional friction module is active. It activates as soon as any
 * friction field is touched — a non-UNKNOWN provenance. An explicit 0 counts as
 * touched.
 */
export function isFrictionModuleActive(input: SellerNetInput): boolean {
  return FRICTION_FIELDS.some((key) => {
    const field = readField(input, key);
    return field !== null && !isUnknown(field);
  });
}

/**
 * True when the optional tax module is active. It activates as soon as any tax
 * field is touched — a non-UNKNOWN provenance or a Section 121 status other
 * than UNKNOWN. An explicit 0 counts as touched.
 */
export function isTaxModuleActive(input: SellerNetInput): boolean {
  if (input.section121Status !== "UNKNOWN") return true;
  return TAX_FIELDS.some((key) => {
    const field = readField(input, key);
    return field !== null && !isUnknown(field);
  });
}

function readField(
  input: SellerNetInput,
  key: keyof SellerNetInput,
): ProvenancedNumber | null {
  const raw = input[key];
  if (typeof raw === "object" && raw !== null && "provenance" in raw) {
    return raw as ProvenancedNumber;
  }
  return null;
}

/** Validate a full input, returning every issue found. */
export function validateInput(input: SellerNetInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const missingFields: string[] = [];
  const isHecm = input.isHecm === true;

  for (const key of REQUIRED_FIELDS) {
    // HECM replaces the standard mortgage payoff, so its fields are not
    // required while HECM is active.
    if (isHecm && STANDARD_MORTGAGE_FIELDS.includes(key)) continue;
    const field = readField(input, key);
    if (field && isUnknown(field)) {
      missingFields.push(key);
    }
  }

  if (isHecm) {
    for (const key of HECM_REQUIRED_FIELDS) {
      const field = readField(input, key);
      if (field && isUnknown(field)) {
        missingFields.push(key);
      }
    }
  }

  for (const key of NON_NEGATIVE_FIELDS) {
    const field = readField(input, key);
    const value = field ? fieldValue(field) : null;
    if (value === null) continue;
    if (!Number.isFinite(value)) {
      issues.push({ field: key, message: "Value must be a finite number." });
    } else if (value < 0) {
      issues.push({ field: key, message: "Value cannot be negative." });
    }
  }

  for (const key of BPS_FIELDS) {
    const field = readField(input, key);
    const value = field ? fieldValue(field) : null;
    if (value === null) continue;
    if (!Number.isFinite(value)) {
      issues.push({ field: key, message: "Rate must be a finite number." });
    } else if (value < 0 || value > SELLER_NET_CONFIG.bpsDenominator) {
      issues.push({
        field: key,
        message: `Rate must be between 0 and ${SELLER_NET_CONFIG.bpsDenominator} basis points.`,
      });
    }
  }

  if (isHecm) {
    for (const key of HECM_NON_NEGATIVE_FIELDS) {
      const field = readField(input, key);
      const value = field ? fieldValue(field) : null;
      if (value === null) continue;
      if (!Number.isFinite(value)) {
        issues.push({ field: key, message: "Value must be a finite number." });
      } else if (value < 0) {
        issues.push({ field: key, message: "Value cannot be negative." });
      }
    }

    for (const key of HECM_BPS_FIELDS) {
      const field = readField(input, key);
      const value = field ? fieldValue(field) : null;
      if (value === null) continue;
      if (!Number.isFinite(value)) {
        issues.push({ field: key, message: "Rate must be a finite number." });
      } else if (value < 0 || value > SELLER_NET_CONFIG.bpsDenominator) {
        issues.push({
          field: key,
          message: `Rate must be between 0 and ${SELLER_NET_CONFIG.bpsDenominator} basis points.`,
        });
      }
    }
  }

  const taxDays = fieldValue(input.taxDaysElapsed);
  if (
    taxDays !== null &&
    Number.isFinite(taxDays) &&
    taxDays > SELLER_NET_CONFIG.taxYearDays
  ) {
    issues.push({
      field: "taxDaysElapsed",
      message: `Days elapsed cannot exceed ${SELLER_NET_CONFIG.taxYearDays}.`,
    });
  }

  const months = fieldValue(input.mortgageMonthsRemaining);
  if (months !== null && Number.isFinite(months) && months < 0) {
    issues.push({
      field: "mortgageMonthsRemaining",
      message: "Months remaining cannot be negative.",
    });
  }

  // An estimated payoff with a positive balance cannot silently substitute
  // UNKNOWN rate/month values with zero. VERIFIED_PAYOFF does not use them.
  const mortgageBalance = fieldValue(input.mortgageBalance);
  if (
    !isHecm &&
    input.mortgagePayoffMode === "ESTIMATE" &&
    mortgageBalance !== null &&
    Number.isFinite(mortgageBalance) &&
    mortgageBalance > 0
  ) {
    for (const key of [
      "mortgageRateBps",
      "mortgageMonthsRemaining",
    ] as const) {
      const field = readField(input, key);
      if (field && isUnknown(field) && !missingFields.includes(key)) {
        missingFields.push(key);
      }
    }
  }

  // ── Optional tax module ──────────────────────────────────────────────────
  if (isTaxModuleActive(input)) {
    // UNKNOWN Section 121 status blocks the calculation; it is never silently
    // defaulted to None.
    if (input.section121Status === "UNKNOWN") {
      missingFields.push("section121Status");
    }

    for (const key of TAX_REQUIRED_FIELDS) {
      const field = readField(input, key);
      if (field && isUnknown(field)) {
        missingFields.push(key);
      }
    }

    for (const key of TAX_NON_NEGATIVE_FIELDS) {
      const field = readField(input, key);
      const value = field ? fieldValue(field) : null;
      if (value === null) continue;
      if (!Number.isFinite(value)) {
        issues.push({ field: key, message: "Value must be a finite number." });
      } else if (value < 0) {
        issues.push({ field: key, message: "Value cannot be negative." });
      }
    }

    for (const key of TAX_BPS_FIELDS) {
      const field = readField(input, key);
      const value = field ? fieldValue(field) : null;
      if (value === null) continue;
      if (!Number.isFinite(value)) {
        issues.push({ field: key, message: "Rate must be a finite number." });
      } else if (value < 0 || value > SELLER_NET_CONFIG.bpsDenominator) {
        issues.push({
          field: key,
          message: `Rate must be between 0 and ${SELLER_NET_CONFIG.bpsDenominator} basis points.`,
        });
      }
    }
  }

  // ── Optional market / time friction module ───────────────────────────────
  if (isFrictionModuleActive(input)) {
    for (const key of FRICTION_REQUIRED_FIELDS) {
      const field = readField(input, key);
      if (field && isUnknown(field)) {
        missingFields.push(key);
      }
    }

    for (const key of FRICTION_NON_NEGATIVE_FIELDS) {
      const field = readField(input, key);
      const value = field ? fieldValue(field) : null;
      if (value === null) continue;
      if (!Number.isFinite(value)) {
        issues.push({ field: key, message: "Value must be a finite number." });
      } else if (value < 0) {
        issues.push({ field: key, message: "Value cannot be negative." });
      }
    }

    for (const key of FRICTION_DECIMAL_FIELDS) {
      const field = readField(input, key);
      const value = field ? fieldValue(field) : null;
      if (value === null) continue;
      if (!Number.isFinite(value)) {
        issues.push({ field: key, message: "Value must be a finite number." });
      } else if (value < 0 || value > 1) {
        issues.push({
          field: key,
          message: "Percentage must be between 0 and 1 (0.05 = 5%).",
        });
      }
    }
  }

  return {
    valid: issues.length === 0 && missingFields.length === 0,
    issues,
    missingFields,
  };
}

/** True when the input is complete and free of invalid values. */
export function isCalculable(input: SellerNetInput): boolean {
  return validateInput(input).valid;
}
