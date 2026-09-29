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
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HECM work-surface journey.
 *
 * These are component/integration tests over the real provider and calculator
 * with the backend actor mocked locally. They prove the accepted HECM
 * presentation contract: the standard mortgage controls are hidden while HECM
 * is active, the two informational shortfall figures render as separately
 * labeled rows, and the HECM payoff is presented as an ESTIMATE requiring
 * lender review.
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
    isAuthenticated: false,
    isInitializing: false,
    login: vi.fn(),
    clear: vi.fn(),
    loginStatus: "idle",
    isLoginIdle: true,
    isLoggingIn: false,
    isLoginSuccess: false,
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

/** A complete HECM input that produces both informational shortfalls. */
function hecmInput(): SellerNetInput {
  return {
    basePrice: userProvided(100_000),
    manualAdjustedPrice: userProvided(100_000),
    conditionTier: "GOOD",
    listingCommissionRateBps: userProvided(250),
    buyerCommissionRateBps: userProvided(250),
    escrowRateBps: defaultAssumption(SELLER_NET_CONFIG.escrowRateBps),
    titleRateBps: defaultAssumption(SELLER_NET_CONFIG.titleRateBps),
    transferTaxRateBps: defaultAssumption(SELLER_NET_CONFIG.transferTaxRateBps),
    recordingFees: defaultAssumption(SELLER_NET_CONFIG.recordingFees),
    homeWarranty: defaultAssumption(SELLER_NET_CONFIG.homeWarranty),
    annualPropertyTax: userProvided(0),
    taxDaysElapsed: userProvided(0),
    mortgageBalance: userProvided(0),
    mortgageRateBps: userProvided(0),
    mortgageMonthsRemaining: userProvided(0),
    mortgagePayoffMode: "VERIFIED_PAYOFF",
    hoaPayoff: userProvided(0),
    liensJudgments: userProvided(0),
    stagingPhotoCost: userProvided(0),
    sellerConcessionsToBuyer: userProvided(0),
    repairsCost: userProvided(0),
    renovationCost: userProvided(0),
    isHecm: true,
    hecmInitialBalance: userProvided(150_000),
    hecmCurrentRateBps: userProvided(0),
    hecmLifetimeCapBps: unknownField(),
    hecmMonthsElapsed: userProvided(0),
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

/** Seeds the shared context with a complete HECM input, then renders the page. */
function HecmHarness({ input }: { input: SellerNetInput }) {
  const { loadInput } = useSellerNet();
  useEffect(() => {
    loadInput(input, "PID 4242");
  }, [input, loadInput]);
  return <WorkSurfacePage />;
}

function renderWithProviders(ui: React.ReactElement) {
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

describe("HECM work surface", () => {
  it("hides the standard mortgage payoff controls while HECM is active", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HecmHarness input={hecmInput()} />);
    // Expand the Condition / Renovation section that holds the mortgage controls.
    await user.click(screen.getByTestId("inputs.condition_renovation.toggle"));

    // The standard payoff-mode and mortgage-rate controls are not rendered.
    expect(
      screen.queryByTestId("inputs.payoff_mode.verified_payoff"),
    ).toBeNull();
    expect(screen.queryByTestId("inputs.payoff_mode.estimate")).toBeNull();
    expect(screen.queryByTestId("inputs.mortgage_rate")).toBeNull();
    // The disabled notice explains why.
    expect(
      screen.getByTestId("inputs.mortgage_disabled_notice"),
    ).toBeInTheDocument();
  });

  it("renders the projected HECM balance and both informational shortfalls as separate rows", () => {
    renderWithProviders(<HecmHarness input={hecmInput()} />);

    const balance = screen.getByTestId("waterfall.row.hecm_balance");
    expect(within(balance).getByText("-$150,000.00")).toBeInTheDocument();

    const hecmShortfall = screen.getByTestId(
      "waterfall.hecm_balance_shortfall",
    );
    expect(
      within(hecmShortfall).getByText(/HECM Balance Shortfall/i),
    ).toBeInTheDocument();
    expect(within(hecmShortfall).getByText("$50,000.00")).toBeInTheDocument();

    const overallShortfall = screen.getByTestId("waterfall.overall_shortfall");
    expect(
      within(overallShortfall).getByText(/Overall Transaction Shortfall/i),
    ).toBeInTheDocument();
    // gross 100,000; encumbrances 150,000; commissions 5,000; closing 1,310.
    expect(
      within(overallShortfall).getByText("$56,310.00"),
    ).toBeInTheDocument();
  });

  it("presents the HECM payoff as an ESTIMATE requiring lender review", () => {
    renderWithProviders(<HecmHarness input={hecmInput()} />);
    const notes = screen.getByTestId("waterfall.hecm_notes");
    expect(notes).toHaveTextContent(/ESTIMATE/i);
    expect(notes).toHaveTextContent(/Verify with lender/i);
    expect(notes).toHaveTextContent(/Lender\/attorney review required/i);
  });

  it("does not render HECM warnings while HECM is inactive", () => {
    renderWithProviders(
      <HecmHarness input={{ ...hecmInput(), isHecm: false }} />,
    );
    expect(screen.queryByTestId("waterfall.hecm_notes")).toBeNull();
    expect(screen.queryByTestId("waterfall.hecm_balance_shortfall")).toBeNull();
    expect(screen.queryByTestId("waterfall.overall_shortfall")).toBeNull();
    // The standard mortgage row is back.
    expect(screen.getByTestId("waterfall.row.mortgage")).toBeInTheDocument();
  });
});

describe("HECM toggle restores the ordinary mortgage workflow", () => {
  it("hides the standard controls when switched on and restores them when switched off", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HecmHarness input={{ ...hecmInput(), isHecm: false }} />,
    );

    // Start in the ordinary workflow: the payoff-mode and rate controls exist.
    await user.click(screen.getByTestId("inputs.condition_renovation.toggle"));
    expect(
      screen.getByTestId("inputs.payoff_mode.verified_payoff"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("inputs.mortgage_rate")).toBeNull();

    // The HECM switch lives in its own collapsed advanced section.
    await user.click(screen.getByTestId("inputs.hecm.toggle"));

    // Switch HECM on: the ordinary controls disappear and the notice appears.
    await user.click(screen.getByTestId("inputs.hecm.switch"));
    expect(
      screen.queryByTestId("inputs.payoff_mode.verified_payoff"),
    ).toBeNull();
    expect(screen.queryByTestId("inputs.payoff_mode.estimate")).toBeNull();
    expect(
      screen.getByTestId("inputs.mortgage_disabled_notice"),
    ).toBeInTheDocument();

    // Switch HECM back off: the ordinary workflow is restored intact.
    await user.click(screen.getByTestId("inputs.hecm.switch"));
    expect(
      screen.getByTestId("inputs.payoff_mode.verified_payoff"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("inputs.payoff_mode.estimate"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("inputs.mortgage_disabled_notice")).toBeNull();
    expect(screen.getByTestId("waterfall.row.mortgage")).toBeInTheDocument();
  });
});

describe("HECM incomplete inputs stay controlled", () => {
  it("blocks the calculation and names the missing HECM fields instead of rendering NaN", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HecmHarness
        input={{
          ...hecmInput(),
          hecmInitialBalance: unknownField(),
          hecmCurrentRateBps: unknownField(),
          hecmMonthsElapsed: unknownField(),
        }}
      />,
    );

    // The blocked state names the missing HECM fields.
    const blocked = screen.getByTestId("waterfall.blocked_state");
    expect(blocked).toHaveTextContent(/hecmInitialBalance/);
    expect(blocked).toHaveTextContent(/hecmCurrentRateBps/);
    expect(blocked).toHaveTextContent(/hecmMonthsElapsed/);
    expect(screen.queryByTestId("waterfall.ready_state")).toBeNull();

    // No NaN or Infinity leaks into the rendered ledger.
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/Infinity/)).toBeNull();

    // The HECM section still renders its inputs so the user can complete them.
    await user.click(screen.getByTestId("inputs.hecm.toggle"));
    expect(
      screen.getByTestId("inputs.hecm_initial_balance"),
    ).toBeInTheDocument();
  });
});

describe("HECM work surface has no runtime console errors", () => {
  it("renders the active HECM projection without console errors or uncaught exceptions", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderWithProviders(<HecmHarness input={hecmInput()} />);

    expect(screen.getByTestId("waterfall.hecm_notes")).toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
