/**
 * Seller Net Waterfall — deterministic input hashing.
 *
 * Produces a stable hash of the effective inputs so two identical scenarios
 * always yield the same identity, regardless of key insertion order.
 */

import { deriveEffectiveInput } from "./effective-input";
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
  const effective = deriveEffectiveInput(input);
  const parts: string[] = [
    `basePrice=${serializeField(effective.basePrice)}`,
    `manualAdjustedPrice=${serializeField(effective.manualAdjustedPrice)}`,
    `conditionTier=${effective.conditionTier}`,
    `listingCommissionRateBps=${serializeField(effective.listingCommissionRateBps)}`,
    `buyerCommissionRateBps=${serializeField(effective.buyerCommissionRateBps)}`,
    `escrowRateBps=${serializeField(effective.escrowRateBps)}`,
    `titleRateBps=${serializeField(effective.titleRateBps)}`,
    `transferTaxRateBps=${serializeField(effective.transferTaxRateBps)}`,
    `recordingFees=${serializeField(effective.recordingFees)}`,
    `homeWarranty=${serializeField(effective.homeWarranty)}`,
    `annualPropertyTax=${serializeField(effective.annualPropertyTax)}`,
    `taxDaysElapsed=${serializeField(effective.taxDaysElapsed)}`,
    `mortgageBalance=${serializeField(effective.mortgageBalance)}`,
    `mortgageRateBps=${serializeField(effective.mortgageRateBps)}`,
    `mortgageMonthsRemaining=${serializeField(effective.mortgageMonthsRemaining)}`,
    `mortgagePayoffMode=${effective.mortgagePayoffMode}`,
    `hoaPayoff=${serializeField(effective.hoaPayoff)}`,
    `liensJudgments=${serializeField(effective.liensJudgments)}`,
    `stagingPhotoCost=${serializeField(effective.stagingPhotoCost)}`,
    `sellerConcessionsToBuyer=${serializeField(effective.sellerConcessionsToBuyer)}`,
    `repairsCost=${serializeField(effective.repairsCost)}`,
    `renovationCost=${serializeField(effective.renovationCost)}`,
    `isHecm=${effective.isHecm === true}`,
    `hecmInitialBalance=${serializeField(effective.hecmInitialBalance)}`,
    `hecmCurrentRateBps=${serializeField(effective.hecmCurrentRateBps)}`,
    `hecmLifetimeCapBps=${serializeField(effective.hecmLifetimeCapBps)}`,
    `hecmMonthsElapsed=${serializeField(effective.hecmMonthsElapsed)}`,
    `originalPurchasePrice=${serializeField(effective.originalPurchasePrice)}`,
    `capitalImprovements=${serializeField(effective.capitalImprovements)}`,
    `section121Status=${effective.section121Status}`,
    `estimatedCapitalGainsTaxRateBps=${serializeField(effective.estimatedCapitalGainsTaxRateBps)}`,
    `monthlyCarryingCost=${serializeField(effective.monthlyCarryingCost)}`,
    `pctExpectedDom=${serializeField(effective.pctExpectedDom)}`,
    `pctExpectedDiscountPct=${serializeField(effective.pctExpectedDiscountPct)}`,
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
