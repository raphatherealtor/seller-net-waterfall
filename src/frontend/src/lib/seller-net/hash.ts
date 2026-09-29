/**
 * Seller Net Waterfall — deterministic input hashing.
 *
 * Produces a stable hash of the effective inputs so two identical scenarios
 * always yield the same identity, regardless of key insertion order.
 */

import type { ProvenancedNumber, SellerNetInput } from "./types";

/** Stable serialization of a single provenanced field. */
function serializeField(field: ProvenancedNumber): string {
  return `${field.provenance}:${field.value === null ? "null" : field.value}`;
}

/**
 * Stable serialization of the effective inputs. Keys are emitted in a fixed
 * order so the output never depends on object key ordering.
 */
export function serializeInput(input: SellerNetInput): string {
  const parts: string[] = [
    `basePrice=${serializeField(input.basePrice)}`,
    `manualAdjustedPrice=${serializeField(input.manualAdjustedPrice)}`,
    `conditionTier=${input.conditionTier}`,
    `listingCommissionRateBps=${serializeField(input.listingCommissionRateBps)}`,
    `buyerCommissionRateBps=${serializeField(input.buyerCommissionRateBps)}`,
    `escrowRateBps=${serializeField(input.escrowRateBps)}`,
    `titleRateBps=${serializeField(input.titleRateBps)}`,
    `transferTaxRateBps=${serializeField(input.transferTaxRateBps)}`,
    `recordingFees=${serializeField(input.recordingFees)}`,
    `homeWarranty=${serializeField(input.homeWarranty)}`,
    `annualPropertyTax=${serializeField(input.annualPropertyTax)}`,
    `taxDaysElapsed=${serializeField(input.taxDaysElapsed)}`,
    `mortgageBalance=${serializeField(input.mortgageBalance)}`,
    `mortgageRateBps=${serializeField(input.mortgageRateBps)}`,
    `mortgageMonthsRemaining=${serializeField(input.mortgageMonthsRemaining)}`,
    `mortgagePayoffMode=${input.mortgagePayoffMode}`,
    `hoaPayoff=${serializeField(input.hoaPayoff)}`,
    `liensJudgments=${serializeField(input.liensJudgments)}`,
    `stagingPhotoCost=${serializeField(input.stagingPhotoCost)}`,
    `sellerConcessionsToBuyer=${serializeField(input.sellerConcessionsToBuyer)}`,
    `repairsCost=${serializeField(input.repairsCost)}`,
    `renovationCost=${serializeField(input.renovationCost)}`,
    `isHecm=${input.isHecm === true}`,
    `hecmInitialBalance=${serializeField(input.hecmInitialBalance)}`,
    `hecmCurrentRateBps=${serializeField(input.hecmCurrentRateBps)}`,
    `hecmLifetimeCapBps=${serializeField(input.hecmLifetimeCapBps)}`,
    `hecmMonthsElapsed=${serializeField(input.hecmMonthsElapsed)}`,
    `originalPurchasePrice=${serializeField(input.originalPurchasePrice)}`,
    `capitalImprovements=${serializeField(input.capitalImprovements)}`,
    `section121Status=${input.section121Status}`,
    `estimatedCapitalGainsTaxRateBps=${serializeField(input.estimatedCapitalGainsTaxRateBps)}`,
    `monthlyCarryingCost=${serializeField(input.monthlyCarryingCost)}`,
    `pctExpectedDom=${serializeField(input.pctExpectedDom)}`,
    `pctExpectedDiscountPct=${serializeField(input.pctExpectedDiscountPct)}`,
  ];
  return parts.join("|");
}

/**
 * FNV-1a 32-bit hash rendered as 8 lowercase hex characters. Deterministic and
 * dependency-free — sufficient for scenario identity, not for security.
 */
export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic hash of the effective inputs. */
export function computeInputHash(input: SellerNetInput): string {
  return hashString(serializeInput(input));
}
