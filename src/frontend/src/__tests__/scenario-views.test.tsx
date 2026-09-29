import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { WorkSurfacePage } from "@/pages/work-surface";
import { SellerNetProvider, useSellerNet } from "@/state/seller-net-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Price Scenario Comparison view journeys.
 *
 * Component/integration tests over the real provider and canonical calculator
 * with the backend actor mocked locally. They pin the accepted user-visible
 * contract:
 *
 *  - the panel sits below the waterfall and renders Downside / Current / Upside;
 *  - the Current column is the baseline and shows the primary net proceeds;
 *  - the adjustable spread retargets the Downside and Upside columns;
 *  - an unavailable scenario shows a reason instead of a faked figure;
 *  - the primary net sheet stays usable when a scenario cannot be calculated.
 *
 * They do NOT exercise a deployed browser or a real backend.
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

/** A complete, calculable input with every field explicitly provided. */
function completeInput(
  overrides: Partial<SellerNetInput> = {},
): SellerNetInput {
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
    monthlyCarryingCost: unknownField(),
    pctExpectedDom: unknownField(),
    pctExpectedDiscountPct: unknownField(),
    ...overrides,
  };
}

/** Seeds the shared context with a complete input on mount. */
function SeedInput({ input }: { input: SellerNetInput }) {
  const { loadInput } = useSellerNet();
  useEffect(() => {
    loadInput(input, "PID 4242");
  }, [input, loadInput]);
  return null;
}

function renderWithProviders(ui: ReactElement, input?: SellerNetInput) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerNetProvider>
        {input ? <SeedInput input={input} /> : null}
        {ui}
      </SellerNetProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("scenario panel placement and columns", () => {
  it("renders below the waterfall with Downside, Current, and Upside", async () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const section = await screen.findByTestId("scenario.section");
    expect(section).toBeInTheDocument();
    expect(screen.getByTestId("scenario.column.downside")).toBeInTheDocument();
    expect(screen.getByTestId("scenario.column.current")).toBeInTheDocument();
    expect(screen.getByTestId("scenario.column.upside")).toBeInTheDocument();

    // The scenario panel follows the waterfall in document order.
    const waterfall = screen.getByTestId("waterfall.section");
    expect(
      waterfall.compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the primary net proceeds in the Current baseline column", async () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const current = await screen.findByTestId("scenario.column.current");
    expect(within(current).getByText("Baseline")).toBeInTheDocument();
    expect(
      within(current).getByTestId("scenario.net_proceeds"),
    ).toHaveTextContent("$169,650.00");
  });

  it("shows a negative delta on Downside and a positive delta on Upside", async () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const downside = await screen.findByTestId("scenario.column.downside");
    const upside = screen.getByTestId("scenario.column.upside");
    expect(within(downside).getByTestId("scenario.delta")).toHaveTextContent(
      /^-/,
    );
    expect(within(upside).getByTestId("scenario.delta")).toHaveTextContent(
      /^\+/,
    );
  });

  it("shows a zero delta on the Current baseline column", async () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const current = await screen.findByTestId("scenario.column.current");
    // The Current column is the delta baseline, so its delta renders as $0
    // rather than being omitted.
    expect(within(current).getByTestId("scenario.delta")).toHaveTextContent(
      "$0",
    );
  });
});

describe("adjustable spread", () => {
  it("retargets the Downside and Upside gross prices", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    await screen.findByTestId("scenario.section");
    const spread = screen.getByTestId("scenario.spread_input");
    await user.clear(spread);
    await user.type(spread, "10000");

    await waitFor(() => {
      const downside = screen.getByTestId("scenario.column.downside");
      expect(within(downside).getByText("$490,000.00")).toBeInTheDocument();
    });
    const upside = screen.getByTestId("scenario.column.upside");
    expect(within(upside).getByText("$510,000.00")).toBeInTheDocument();
  });

  it("falls back to the default spread for a non-numeric entry", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    await screen.findByTestId("scenario.section");
    const spread = screen.getByTestId("scenario.spread_input");
    await user.clear(spread);
    await user.type(spread, "abc");

    await waitFor(() => {
      const downside = screen.getByTestId("scenario.column.downside");
      expect(within(downside).getByText("$475,000.00")).toBeInTheDocument();
    });
  });
});

describe("unavailable scenario containment", () => {
  it("shows a reason instead of a faked figure when a target is invalid", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    await screen.findByTestId("scenario.section");
    const spread = screen.getByTestId("scenario.spread_input");
    await user.clear(spread);
    await user.type(spread, "600000");

    const unavailable = await screen.findByTestId(
      "scenario.unavailable.downside",
    );
    expect(unavailable).toHaveTextContent(/unavailable/i);
    // The Current baseline is unaffected and the primary sheet still resolves.
    expect(
      within(screen.getByTestId("scenario.column.current")).getByTestId(
        "scenario.net_proceeds",
      ),
    ).toHaveTextContent("$169,650.00");
    expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
      "$169,650.00",
    );
  });
});
