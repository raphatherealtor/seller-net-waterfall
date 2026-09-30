/**
 * Seller Net Waterfall — public module surface.
 *
 * Import everything from `@/lib/seller-net`. Views must never reach into the
 * individual files or re-derive any formula.
 */

export {
  CALCULATOR_VERSION,
  CONDITION_TIER_ADJUSTMENTS,
  CONDITION_TIER_LABELS,
  SECTION_121_EXEMPTIONS,
  SELLER_NET_CONFIG,
  ADJUSTMENT_MODULES,
} from "./config";
export type { SellerNetConfig } from "./config";

export {
  CONDITION_TIERS,
  MORTGAGE_PAYOFF_MODES,
  PROFESSIONAL_REVIEW_DOMAINS,
  PROVENANCE_STATES,
  SECTION_121_STATUSES,
} from "./types";
export type {
  AdjustmentModule,
  ConditionTier,
  MortgagePayoffMode,
  ProfessionalReviewDomain,
  ProvenanceState,
  ProvenancedNumber,
  Section121Status,
  SellerNetInput,
  SellerNetOutput,
  SellerNetResult,
  ValidationIssue,
  ValidationResult,
} from "./types";

export {
  SellerNetCalculationError,
  calculateSellerNetWaterfall,
  calculateSellerNetWaterfallStrict,
  roundMoney,
} from "./calculator";

export {
  isCalculable,
  isFrictionModuleActive,
  isTaxModuleActive,
  isSellerNetInputShape,
  isSellerNetOutputShape,
  validateInput,
} from "./validation";

export {
  PROVENANCE_LABELS,
  defaultAssumption,
  estimate,
  isUnknown,
  unknownField,
  userProvided,
  fieldValue,
  valueOr,
  verifiedPayoff,
} from "./provenance";

export { computeInputHash, hashString, serializeInput } from "./hash";

export {
  SCENARIO_DEFAULT_SPREAD,
  SCENARIO_KEYS,
  SCENARIO_LABELS,
  computeScenarios,
  computeScenariosAtTargets,
} from "./scenarios";
export type {
  ScenarioComparison,
  ScenarioFigures,
  ScenarioKey,
  ScenarioResult,
} from "./scenarios";
