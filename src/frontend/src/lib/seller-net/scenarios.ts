/**
 * Seller Net Waterfall — price scenario comparison.
 *
 * Framework-free and pure. This module owns NO financial formula: every scenario
 * is produced by calling the canonical `calculateSellerNetWaterfall()` with a
 * single price override. Commissions, closing costs, mortgage/HECM payoff,
 * HOA/liens, seller costs, tax, net proceeds, and friction are all read back
 * from the returned `SellerNetOutput` — never re-derived here.
 *
 * The displayed gross price is always the price the calculator actually
 * produced. When a rule (renovation lift, condition adjustment) forces a higher
 * minimum gross than the requested target, the scenario is reported as clamped
 * to that minimum with a clear reason — the requested target is never faked.
 */

import { calculateSellerNetWaterfall } from "./calculator";
import { userProvided } from "./provenance";
import type { SellerNetInput, SellerNetOutput, SellerNetResult } from "./types";
import { validateInput } from "./validation";

/** Default dollar spread applied above and below the current price. */
export const SCENARIO_DEFAULT_SPREAD = 25_000;

/** The three fixed scenario positions, in display order. */
export const SCENARIO_KEYS = ["downside", "current", "upside"] as const;

export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

/** Human labels for each scenario position. */
export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  downside: "Downside",
  current: "Current",
  upside: "Upside",
};

/**
 * The figures a scenario exposes to the UI. Every value is read from the
 * canonical calculator output; `null` marks a figure that is inactive for this
 * scenario (HECM payoff when HECM is off, tax when the tax module is off,
 * friction net when the friction module is off).
 */
export interface ScenarioFigures {
  /** Gross price the calculator actually produced for this scenario. */
  grossPrice: number;
  /** Listing + buyer commission total. */
  commissions: number;
  /** Escrow, title, transfer tax, prorated tax, recording, warranty. */
  closingCosts: number;
  /** Mortgage payoff, or the accrued HECM balance when HECM is active. */
  mortgagePayoff: number;
  /** HOA payoff + liens and judgments. */
  hoaAndLiens: number;
  /** Staging, concessions, repairs, and renovation spend. */
  sellerCosts: number;
  /** Estimated capital-gains tax; `null` while the tax module is inactive. */
  estimatedTax: number | null;
  /** Estimated net proceeds after tax. */
  estimatedNetProceeds: number;
  /** Market/time-friction net; `null` while the friction module is inactive. */
  frictionNet: number | null;
}

/** One scenario position: its request, its actual result, and its delta. */
export interface ScenarioResult {
  key: ScenarioKey;
  label: string;
  /** True when the scenario produced a usable, finite result. */
  available: boolean;
  /** Short human-readable reason when `available` is false, else "". */
  reason: string;
  /** The price requested for this scenario (current gross ± spread). */
  requestedPrice: number;
  /**
   * True when the calculator returned a different gross price than requested
   * (e.g. renovation lift forced a higher minimum). The displayed price is the
   * actual one.
   */
  clamped: boolean;
  /** The actual figures; `null` when the scenario is unavailable. */
  figures: ScenarioFigures | null;
  /** Net proceeds minus the Current scenario's net proceeds; `null` if unavailable. */
  deltaVsCurrent: number | null;
}

/** The full comparison: the spread used and the three ordered scenarios. */
export interface ScenarioComparison {
  /** The dollar spread actually applied above and below the current price. */
  spread: number;
  /** Downside, Current, Upside — in that order. */
  scenarios: ScenarioResult[];
}

/** Read the effective current gross price from the canonical result. */
function currentGrossPrice(currentResult: SellerNetResult): number {
  return currentResult.output.grossPrice;
}

/**
 * Build a scenario input by overriding ONLY the price. `manualAdjustedPrice`
 * is the canonical price-override field: when it is positive the calculator
 * uses it directly and disables the condition adjustment, so no other input
 * field is touched.
 */
function withPrice(input: SellerNetInput, price: number): SellerNetInput {
  return { ...input, manualAdjustedPrice: userProvided(price) };
}

/** Extract the display figures from a canonical output. */
function figuresFrom(output: SellerNetOutput): ScenarioFigures {
  // The primary encumbrance is the accrued HECM balance when HECM is active,
  // otherwise the standard mortgage payoff. totalEncumbrances is that figure
  // plus HOA and liens, so subtracting it isolates HOA + liens in both branches.
  const primaryEncumbrance =
    output.hecmAccruedPayoff !== null
      ? output.hecmAccruedPayoff
      : output.mortgagePayoff;
  return {
    grossPrice: output.grossPrice,
    commissions: output.totalCommissions,
    closingCosts: output.totalClosingCosts,
    mortgagePayoff: primaryEncumbrance,
    hoaAndLiens: output.totalEncumbrances - primaryEncumbrance,
    sellerCosts:
      output.totalDeductions -
      output.totalCommissions -
      output.totalClosingCosts -
      output.totalEncumbrances,
    estimatedTax: output.taxActive ? output.estimatedTaxOwed : null,
    estimatedNetProceeds: output.estimatedNetProceeds,
    frictionNet: output.frictionActive ? output.probabilisticTrueNet : null,
  };
}

/** True when every numeric figure in the output is finite. */
function outputIsFinite(output: SellerNetOutput): boolean {
  for (const value of Object.values(output)) {
    if (typeof value === "number" && !Number.isFinite(value)) return false;
  }
  return true;
}

/** An unavailable scenario carrying a short reason. */
function unavailable(
  key: ScenarioKey,
  requestedPrice: number,
  reason: string,
): ScenarioResult {
  return {
    key,
    label: SCENARIO_LABELS[key],
    available: false,
    reason,
    requestedPrice,
    clamped: false,
    figures: null,
    deltaVsCurrent: null,
  };
}

/**
 * Compute one scenario in isolation. Any validation failure, thrown error, or
 * non-finite result is contained here and returned as an unavailable scenario —
 * it never propagates out of `computeScenarios`.
 */
function computeScenario(
  key: ScenarioKey,
  input: SellerNetInput,
  requestedPrice: number,
): ScenarioResult {
  if (!Number.isFinite(requestedPrice) || requestedPrice <= 0) {
    return unavailable(
      key,
      requestedPrice,
      "Target price is not a valid amount.",
    );
  }

  const scenarioInput = withPrice(input, requestedPrice);

  const validation = validateInput(scenarioInput);
  if (!validation.valid) {
    const detail =
      validation.issues[0]?.message ??
      (validation.missingFields.length > 0
        ? `Missing ${validation.missingFields[0]}.`
        : "Input is incomplete.");
    return unavailable(key, requestedPrice, detail);
  }

  let result: SellerNetResult;
  try {
    result = calculateSellerNetWaterfall(scenarioInput);
  } catch {
    return unavailable(
      key,
      requestedPrice,
      "Calculation failed for this price.",
    );
  }

  if (!outputIsFinite(result.output)) {
    return unavailable(
      key,
      requestedPrice,
      "Calculation produced an invalid result.",
    );
  }

  const actualPrice = result.output.grossPrice;
  const clamped = Math.abs(actualPrice - requestedPrice) > 0.005;

  return {
    key,
    label: SCENARIO_LABELS[key],
    available: true,
    reason: clamped
      ? `Clamped to the minimum possible price of ${actualPrice.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`
      : "",
    requestedPrice,
    clamped,
    figures: figuresFrom(result.output),
    deltaVsCurrent: null,
  };
}

/**
 * Compute the three price scenarios by calling the canonical calculator once
 * per scenario. The Current scenario always uses the current gross price, so it
 * is the delta baseline and is never affected by a failing Downside or Upside.
 */
export function computeScenarios(
  input: SellerNetInput,
  currentResult: SellerNetResult,
  spread: number = SCENARIO_DEFAULT_SPREAD,
): ScenarioComparison {
  const base = currentGrossPrice(currentResult);
  const effectiveSpread =
    Number.isFinite(spread) && spread >= 0 ? spread : SCENARIO_DEFAULT_SPREAD;

  const targets: Record<ScenarioKey, number> = {
    downside: base - effectiveSpread,
    current: base,
    upside: base + effectiveSpread,
  };

  const scenarios = SCENARIO_KEYS.map((key) =>
    computeScenario(key, input, targets[key]),
  );

  const currentNet = scenarios.find((s) => s.key === "current")?.figures
    ?.estimatedNetProceeds;

  const withDeltas = scenarios.map((scenario) => {
    if (
      !scenario.available ||
      scenario.figures === null ||
      currentNet === undefined
    ) {
      return scenario;
    }
    return {
      ...scenario,
      deltaVsCurrent: scenario.figures.estimatedNetProceeds - currentNet,
    };
  });

  return { spread: effectiveSpread, scenarios: withDeltas };
}


/**
 * Compute the fixed Downside / Current / Upside positions at three explicit
 * requested prices. This is primarily used by external capability adapters
 * such as MCP. Each price still runs through computeScenario(), which delegates
 * every financial figure to the canonical calculator.
 */
export function computeScenariosAtTargets(
  input: SellerNetInput,
  targets: readonly [number, number, number],
): ScenarioComparison {
  const requested: Record<ScenarioKey, number> = {
    downside: targets[0],
    current: targets[1],
    upside: targets[2],
  };

  const scenarios = SCENARIO_KEYS.map((key) =>
    computeScenario(key, input, requested[key]),
  );

  const currentNet = scenarios.find((scenario) => scenario.key === "current")
    ?.figures?.estimatedNetProceeds;

  const withDeltas = scenarios.map((scenario) => {
    if (
      !scenario.available ||
      scenario.figures === null ||
      currentNet === undefined
    ) {
      return scenario;
    }
    return {
      ...scenario,
      deltaVsCurrent: scenario.figures.estimatedNetProceeds - currentNet,
    };
  });

  const downsideDistance = Math.abs(targets[1] - targets[0]);
  const upsideDistance = Math.abs(targets[2] - targets[1]);
  const symmetric =
    Number.isFinite(downsideDistance) &&
    Number.isFinite(upsideDistance) &&
    Math.abs(downsideDistance - upsideDistance) <= 0.005;

  return {
    spread: symmetric ? downsideDistance : 0,
    scenarios: withDeltas,
  };
}
