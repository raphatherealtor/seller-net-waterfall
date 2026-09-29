import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import {
  type ProvenancedFieldKey,
  SellerNetProvider,
  parseDraft,
  useSellerNet,
} from "@/state/seller-net-context";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Shared-context provenance characterization.
 *
 * The work-surface / client-view / print-view journeys already exercise the
 * context indirectly, but nothing pins the provenance state machine itself:
 * how a raw draft becomes USER_PROVIDED, how clearing returns a field to
 * UNKNOWN, how marking an estimate or verified payoff preserves the value, and
 * how loading a saved snapshot replaces the whole draft. These are the seams a
 * future module (Section 121, market friction) is most likely to disturb, so
 * they are frozen here against the current accepted behavior.
 */

/** A complete, calculable input, as a saved snapshot would carry it. */
function completeInput(): SellerNetInput {
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
    annualPropertyTax: userProvided(3_650),
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
  };
}

/**
 * Exposes the context's actions and a compact, observable projection of its
 * state. Every assertion reads rendered text, so the test observes the same
 * surface a view would.
 */
function Harness() {
  const ctx = useSellerNet();
  const field = (key: ProvenancedFieldKey) => {
    const value = ctx.fields[key];
    return `${value.provenance}:${value.value === null ? "null" : value.value}`;
  };
  return (
    <div>
      <output data-ocid="state.propertyId">{ctx.propertyId}</output>
      <output data-ocid="state.basePrice">{field("basePrice")}</output>
      <output data-ocid="state.escrowRateBps">{field("escrowRateBps")}</output>
      <output data-ocid="state.mortgageBalance">
        {field("mortgageBalance")}
      </output>
      <output data-ocid="state.draft.basePrice">{ctx.drafts.basePrice}</output>
      <output data-ocid="state.conditionTier">{ctx.conditionTier}</output>
      <output data-ocid="state.mortgagePayoffMode">
        {ctx.mortgagePayoffMode}
      </output>
      <output data-ocid="state.isHecm">{String(ctx.isHecm)}</output>
      <output data-ocid="state.calculable">{String(ctx.calculable)}</output>
      <output data-ocid="state.inputHash">{ctx.result.inputHash}</output>
      <button
        type="button"
        data-ocid="action.setBasePrice"
        onClick={() => ctx.setField("basePrice", "$500,000")}
      />
      <button
        type="button"
        data-ocid="action.setBasePriceInvalid"
        onClick={() => ctx.setField("basePrice", "not a number")}
      />
      <button
        type="button"
        data-ocid="action.clearBasePrice"
        onClick={() => ctx.clearField("basePrice")}
      />
      <button
        type="button"
        data-ocid="action.markEstimateBasePrice"
        onClick={() => ctx.markEstimate("basePrice")}
      />
      <button
        type="button"
        data-ocid="action.markVerifiedBasePrice"
        onClick={() => ctx.markVerified("basePrice")}
      />
      <button
        type="button"
        data-ocid="action.loadInput"
        onClick={() => ctx.loadInput(completeInput(), "PID 4242")}
      />
      <button
        type="button"
        data-ocid="action.reset"
        onClick={() => ctx.reset()}
      />
    </div>
  );
}

function renderHarness() {
  return render(
    <SellerNetProvider>
      <Harness />
    </SellerNetProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("parseDraft", () => {
  it("strips currency, percent, comma, and whitespace decoration", () => {
    expect(parseDraft("$500,000")).toBe(500_000);
    expect(parseDraft(" 250 % ")).toBe(250);
    expect(parseDraft("1 200")).toBe(1_200);
  });

  it("returns null for an empty or non-numeric draft", () => {
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("   ")).toBeNull();
    expect(parseDraft("not a number")).toBeNull();
    expect(parseDraft("$")).toBeNull();
  });

  it("parses zero and negative values as finite numbers", () => {
    expect(parseDraft("0")).toBe(0);
    expect(parseDraft("-5")).toBe(-5);
  });
});

describe("initial context state", () => {
  it("starts required fields UNKNOWN and canonical defaults DEFAULT_ASSUMPTION", () => {
    renderHarness();
    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "UNKNOWN:null",
    );
    expect(screen.getByTestId("state.mortgageBalance")).toHaveTextContent(
      "UNKNOWN:null",
    );
    expect(screen.getByTestId("state.escrowRateBps")).toHaveTextContent(
      `DEFAULT_ASSUMPTION:${SELLER_NET_CONFIG.escrowRateBps}`,
    );
    expect(screen.getByTestId("state.calculable")).toHaveTextContent("false");
  });
});

describe("setField provenance transition", () => {
  it("marks a parsed value USER_PROVIDED and keeps the raw draft", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("action.setBasePrice"));

    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "USER_PROVIDED:500000",
    );
    expect(screen.getByTestId("state.draft.basePrice")).toHaveTextContent(
      "$500,000",
    );
  });

  it("returns the field to UNKNOWN when the draft is not a usable number", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("action.setBasePrice"));
    await user.click(screen.getByTestId("action.setBasePriceInvalid"));

    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "UNKNOWN:null",
    );
  });
});

describe("clearField", () => {
  it("resets a user-provided field to UNKNOWN and empties its draft", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("action.setBasePrice"));
    await user.click(screen.getByTestId("action.clearBasePrice"));

    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "UNKNOWN:null",
    );
    expect(screen.getByTestId("state.draft.basePrice")).toHaveTextContent("");
  });
});

describe("markEstimate / markVerified", () => {
  it("changes provenance while preserving the value", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("action.setBasePrice"));
    await user.click(screen.getByTestId("action.markEstimateBasePrice"));

    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "ESTIMATE:500000",
    );

    await user.click(screen.getByTestId("action.markVerifiedBasePrice"));
    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "VERIFIED_PAYOFF:500000",
    );
  });

  it("is a no-op on an UNKNOWN field, never inventing a value", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("action.markEstimateBasePrice"));
    await user.click(screen.getByTestId("action.markVerifiedBasePrice"));

    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "UNKNOWN:null",
    );
  });
});

describe("loadInput", () => {
  it("replaces the whole draft, tier, payoff mode, HECM flag, and identifier", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("action.loadInput"));

    expect(screen.getByTestId("state.propertyId")).toHaveTextContent(
      "PID 4242",
    );
    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "USER_PROVIDED:500000",
    );
    expect(screen.getByTestId("state.mortgageBalance")).toHaveTextContent(
      "USER_PROVIDED:300000",
    );
    expect(screen.getByTestId("state.conditionTier")).toHaveTextContent("GOOD");
    expect(screen.getByTestId("state.mortgagePayoffMode")).toHaveTextContent(
      "VERIFIED_PAYOFF",
    );
    expect(screen.getByTestId("state.isHecm")).toHaveTextContent("false");
    expect(screen.getByTestId("state.calculable")).toHaveTextContent("true");
  });

  it("replays a loaded snapshot to the same input hash deterministically", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("action.loadInput"));
    const first = screen.getByTestId("state.inputHash").textContent;

    await user.click(screen.getByTestId("action.reset"));
    await user.click(screen.getByTestId("action.loadInput"));
    const second = screen.getByTestId("state.inputHash").textContent;

    expect(second).toBe(first);
  });
});

describe("reset", () => {
  it("returns every field to UNKNOWN, restores defaults, and clears the identifier", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("action.loadInput"));
    await user.click(screen.getByTestId("action.reset"));

    expect(screen.getByTestId("state.propertyId")).toHaveTextContent("");
    expect(screen.getByTestId("state.basePrice")).toHaveTextContent(
      "UNKNOWN:null",
    );
    expect(screen.getByTestId("state.mortgageBalance")).toHaveTextContent(
      "UNKNOWN:null",
    );
    expect(screen.getByTestId("state.escrowRateBps")).toHaveTextContent(
      `DEFAULT_ASSUMPTION:${SELLER_NET_CONFIG.escrowRateBps}`,
    );
    expect(screen.getByTestId("state.conditionTier")).toHaveTextContent("GOOD");
    expect(screen.getByTestId("state.mortgagePayoffMode")).toHaveTextContent(
      "VERIFIED_PAYOFF",
    );
    expect(screen.getByTestId("state.isHecm")).toHaveTextContent("false");
    expect(screen.getByTestId("state.calculable")).toHaveTextContent("false");
  });
});
