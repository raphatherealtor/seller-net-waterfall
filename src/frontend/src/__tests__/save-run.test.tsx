import type { RunRecordView, SaveRunRecordInput } from "@/backend";
import { SaveRunDialog } from "@/components/work-surface/save-run-dialog";
import { RUN_RECORDS_QUERY_KEY } from "@/hooks/use-run-records";
import {
  type SellerNetInput,
  calculateSellerNetWaterfall,
  deriveEffectiveInput,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import {
  SellerNetProvider,
  useSellerNet,
} from "@/state/seller-net-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Save-run snapshot journey.
 *
 * The load-bearing acceptance criterion is that a saved snapshot's inputs
 * exactly match the effective inputs the calculator used, so replaying it
 * reproduces identical outputs. This test drives the real dialog against a
 * local typed actor mock and asserts the submitted payload, the query
 * invalidation that refreshes the archive, and the error surface.
 */

const { mockActor } = vi.hoisted(() => ({
  mockActor: {
    saveRunRecord: vi.fn(),
    listRunRecords: vi.fn(),
    getRunRecord: vi.fn(),
    deleteRunRecord: vi.fn(),
  },
}));

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    isInitializing: false,
    login: vi.fn(),
    clear: vi.fn(),
    loginStatus: "success",
    isLoginIdle: false,
    isLoggingIn: false,
    isLoginSuccess: true,
    isLoginError: false,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: "/" } }),
}));

/** A complete, calculable input, as the work surface would assemble it. */
function completeInput(): SellerNetInput {
  return {
    basePrice: userProvided(500_000),
    manualAdjustedPrice: userProvided(0),
    conditionTier: "GOOD",
    listingCommissionRateBps: userProvided(250),
    buyerCommissionRateBps: userProvided(250),
    escrowRateBps: defaultAssumption(50),
    titleRateBps: defaultAssumption(40),
    transferTaxRateBps: defaultAssumption(11),
    recordingFees: defaultAssumption(300),
    homeWarranty: defaultAssumption(0),
    annualPropertyTax: userProvided(3_650),
    taxDaysElapsed: userProvided(0),
    mortgageBalance: userProvided(300_000),
    // Non-zero rate/months in VERIFIED_PAYOFF mode: the calculator ignores
    // them, so the snapshot must store them as inactive/UNKNOWN rather than
    // inventing literal zero values.
    mortgageRateBps: userProvided(650),
    mortgageMonthsRemaining: userProvided(24),
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

function savedView(input: SellerNetInput): RunRecordView {
  const result = calculateSellerNetWaterfall(input);
  return {
    runId: "run-1",
    propertyId: "PID 4242",
    calculatorVersion: result.calculatorVersion,
    inputHash: result.inputHash,
    effectiveInputsJson: JSON.stringify(input),
    inputProvenanceJson: JSON.stringify({ basePrice: "USER_PROVIDED" }),
    outputsJson: JSON.stringify(result.output),
    createdAt: 1_700_000_000_000_000_000n,
  };
}

/**
 * Seeds the shared context with a complete input and opens the save dialog, so
 * the journey exercises the real dialog against real provider state.
 *
 * The seed runs in an effect rather than behind a button: an open Radix dialog
 * sets `pointer-events: none` on the document body, so a click on a sibling
 * control would be rejected before the dialog is ever exercised.
 */
function SaveHarness() {
  const { loadInput } = useSellerNet();
  useEffect(() => {
    loadInput(completeInput(), "PID 4242");
  }, [loadInput]);
  return <SaveRunDialog open onOpenChange={() => {}} />;
}

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerNetProvider>{ui}</SellerNetProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("save run snapshot", () => {
  it("submits effective inputs that replay to identical outputs", async () => {
    const user = userEvent.setup();
    const input = completeInput();
    // The dialog snapshots the branch-effective input. VERIFIED_PAYOFF removes
    // unused rate/month values from identity rather than treating them as zero.
    const effective = deriveEffectiveInput(input);
    const expected = calculateSellerNetWaterfall(effective);
    mockActor.saveRunRecord.mockResolvedValue({
      __kind__: "ok",
      ok: savedView(effective),
    });

    renderWithProviders(<SaveHarness />);
    await user.click(screen.getByTestId("save_run.submit_button"));

    await waitFor(() => {
      expect(mockActor.saveRunRecord).toHaveBeenCalledTimes(1);
    });

    const submitted = mockActor.saveRunRecord.mock
      .calls[0][0] as SaveRunRecordInput;
    expect(submitted.propertyId).toBe("PID 4242");
    expect(submitted.calculatorVersion).toBe(expected.calculatorVersion);
    expect(submitted.inputHash).toBe(expected.inputHash);

    // The stored inputs are exactly the effective inputs the calculator used,
    // so replaying them reproduces identical outputs.
    const stored = JSON.parse(submitted.effectiveInputsJson) as SellerNetInput;
    // Inactive VERIFIED_PAYOFF rate/months are UNKNOWN in the effective
    // snapshot, so replaying it reproduces the same hash without invented data.
    expect(stored.mortgageRateBps).toEqual(unknownField());
    expect(stored.mortgageMonthsRemaining).toEqual(unknownField());
    const replayed = calculateSellerNetWaterfall(stored);
    expect(replayed.output).toEqual(expected.output);
    expect(replayed.inputHash).toBe(submitted.inputHash);
    expect(JSON.parse(submitted.outputsJson)).toEqual(expected.output);

    // Provenance is recorded per field, never inferred from value equality.
    const provenance = JSON.parse(submitted.inputProvenanceJson) as Record<
      string,
      string
    >;
    expect(provenance.basePrice).toBe("USER_PROVIDED");
    expect(provenance.escrowRateBps).toBe("DEFAULT_ASSUMPTION");

    // The success state echoes the runId the backend acknowledged.
    expect(
      await screen.findByTestId("save_run.success_state"),
    ).toHaveTextContent("run-1");
  });

  it("invalidates the run-records query after a successful save", async () => {
    const user = userEvent.setup();
    const input = completeInput();
    mockActor.saveRunRecord.mockResolvedValue({
      __kind__: "ok",
      ok: savedView(input),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <SellerNetProvider>
          <SaveHarness />
        </SellerNetProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("save_run.submit_button"));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: RUN_RECORDS_QUERY_KEY,
      });
    });
  });

  it("surfaces a backend rejection instead of reporting success", async () => {
    const user = userEvent.setup();
    mockActor.saveRunRecord.mockResolvedValue({
      __kind__: "err",
      err: { __kind__: "alreadyExists", alreadyExists: "run-1" },
    });

    renderWithProviders(<SaveHarness />);
    await user.click(screen.getByTestId("save_run.submit_button"));

    expect(await screen.findByTestId("save_run.error_state")).toHaveTextContent(
      /already exists/i,
    );
    expect(screen.queryByTestId("save_run.success_state")).toBeNull();
  });
});
