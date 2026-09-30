/**
 * Seller Net Waterfall — canonical effective-input normalization.
 *
 * A run identity must not change because of stale values in fields the selected
 * mortgage branch does not read. This module strips only branch-inactive
 * mortgage/HECM fields; it does not collapse meaningful provenance elsewhere.
 */

import { unknownField } from "./provenance";
import type { SellerNetInput } from "./types";

/**
 * Return the exact branch-effective input used for snapshot identity/replay.
 *
 * - HECM active: standard mortgage balance/rate/month fields are inactive.
 * - HECM inactive: all HECM fields are inactive.
 * - Standard VERIFIED_PAYOFF: rate/month fields are inactive.
 *
 * The input object is never mutated.
 */
export function deriveEffectiveInput(input: SellerNetInput): SellerNetInput {
  if (input.isHecm) {
    return {
      ...input,
      mortgageBalance: unknownField(),
      mortgageRateBps: unknownField(),
      mortgageMonthsRemaining: unknownField(),
    };
  }

  const withoutInactiveHecm: SellerNetInput = {
    ...input,
    hecmInitialBalance: unknownField(),
    hecmCurrentRateBps: unknownField(),
    hecmLifetimeCapBps: unknownField(),
    hecmMonthsElapsed: unknownField(),
  };

  if (input.mortgagePayoffMode === "VERIFIED_PAYOFF") {
    return {
      ...withoutInactiveHecm,
      mortgageRateBps: unknownField(),
      mortgageMonthsRemaining: unknownField(),
    };
  }

  return withoutInactiveHecm;
}
