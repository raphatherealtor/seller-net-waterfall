import type { RunRecordView } from "@/backend";
import {
  type SellerNetInput,
  calculateSellerNetWaterfall,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { SavedRunsPage } from "@/pages/saved-runs";
import { WorkSurfacePage } from "@/pages/work-surface";
import { SellerNetProvider } from "@/state/seller-net-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saved-runs replay journey.
 *
 * The load-bearing acceptance criterion is that replaying a snapshot reproduces
 * identical outputs. The page parses `effectiveInputsJson` and hands it to the
 * shared context, which recomputes through the canonical calculator; stored
 * outputs are never trusted. This test drives that path end to end with a local
 * typed actor mock.
 */

const { mockActor, navigateMock } = vi.hoisted(() => ({
  mockActor: {
    saveRunRecord: vi.fn(),
    listRunRecords: vi.fn(),
    getRunRecord: vi.fn(),
    deleteRunRecord: vi.fn(),
  },
  navigateMock: vi.fn(),
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
  useNavigate: () => navigateMock,
  useRouterState: () => ({ location: { pathname: "/runs" } }),
}));

/** A complete, calculable input, as a saved snapshot would carry it. */
function savedInput(): SellerNetInput {
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

function savedRecord(input: SellerNetInput): RunRecordView {
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

describe("saved runs", () => {
  it("lists the caller's saved run records", async () => {
    const input = savedInput();
    mockActor.listRunRecords.mockResolvedValue([savedRecord(input)]);
    renderWithProviders(<SavedRunsPage />);

    expect(await screen.findByTestId("runs.list")).toBeInTheDocument();
    expect(screen.getByText("PID 4242")).toBeInTheDocument();
    expect(screen.getByTestId("runs.item.1")).toBeInTheDocument();
  });

  it("shows an empty state when the caller has no saved runs", async () => {
    mockActor.listRunRecords.mockResolvedValue([]);
    renderWithProviders(<SavedRunsPage />);
    expect(await screen.findByTestId("runs.empty_state")).toBeInTheDocument();
  });

  it("replays a snapshot and reproduces identical outputs on the work surface", async () => {
    const user = userEvent.setup();
    const input = savedInput();
    const expected = calculateSellerNetWaterfall(input);
    mockActor.listRunRecords.mockResolvedValue([savedRecord(input)]);

    renderWithProviders(
      <>
        <SavedRunsPage />
        <WorkSurfacePage />
      </>,
    );

    await screen.findByTestId("runs.list");
    await user.click(screen.getByTestId("runs.replay_button.1"));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
    });

    // The work surface recomputed from the replayed inputs, not from stored
    // outputs: the gross price KPI matches the canonical calculator.
    const gross = screen.getByTestId("kpi.gross_price");
    expect(
      within(gross).getByText(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(expected.output.grossPrice),
      ),
    ).toBeInTheDocument();
  });

  it("reports an unreadable snapshot instead of replaying it", async () => {
    const user = userEvent.setup();
    mockActor.listRunRecords.mockResolvedValue([
      { ...savedRecord(savedInput()), effectiveInputsJson: "not json" },
    ]);
    renderWithProviders(<SavedRunsPage />);

    await screen.findByTestId("runs.list");
    await user.click(screen.getByTestId("runs.replay_button.1"));

    expect(await screen.findByTestId("runs.error_state")).toHaveTextContent(
      /cannot be replayed/i,
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
