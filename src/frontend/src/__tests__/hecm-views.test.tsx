import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { ClientViewPage } from "@/pages/client-view";
import PrintViewPage from "@/pages/print-view";
import { SellerNetProvider, useSellerNet } from "@/state/seller-net-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * HECM client-view and print-view journeys.
 *
 * These are component/integration tests over the real provider and calculator
 * with the backend actor mocked locally. They prove the accepted HECM
 * presentation contract for the two seller-facing surfaces: the client view
 * carries the required ESTIMATE / verify-with-lender warnings and both
 * informational shortfall concepts without leaking calculator internals, and
 * the print sheet carries the same estimate language and both shortfall
 * concepts.
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

/**
 * The locked HECM regression input. Its accepted outputs are
 * hecmAccruedPayoff 844939.45, estimatedNetProceeds 0, HECM Balance Shortfall
 * 114939.45, and Overall Transaction Shortfall 166962.45.
 */
function lockedHecmInput(): SellerNetInput {
  return {
    basePrice: userProvided(730_000),
    manualAdjustedPrice: userProvided(730_000),
    conditionTier: "GOOD",
    listingCommissionRateBps: userProvided(300),
    buyerCommissionRateBps: userProvided(250),
    escrowRateBps: userProvided(50),
    titleRateBps: userProvided(40),
    transferTaxRateBps: userProvided(11),
    recordingFees: userProvided(0),
    homeWarranty: userProvided(0),
    annualPropertyTax: userProvided(2_000),
    taxDaysElapsed: userProvided(365),
    mortgageBalance: userProvided(0),
    mortgageRateBps: userProvided(0),
    mortgageMonthsRemaining: userProvided(0),
    mortgagePayoffMode: "VERIFIED_PAYOFF",
    hoaPayoff: userProvided(0),
    liensJudgments: userProvided(0),
    stagingPhotoCost: userProvided(2_500),
    sellerConcessionsToBuyer: userProvided(0),
    repairsCost: userProvided(0),
    renovationCost: userProvided(0),
    isHecm: true,
    hecmInitialBalance: userProvided(645_000),
    hecmCurrentRateBps: userProvided(580),
    hecmLifetimeCapBps: userProvided(714),
    hecmMonthsElapsed: userProvided(56),
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

/** A non-HECM input with the same price so the two paths can be compared. */
function nonHecmInput(): SellerNetInput {
  return {
    ...lockedHecmInput(),
    isHecm: false,
    mortgageBalance: userProvided(300_000),
    hecmInitialBalance: unknownField(),
    hecmCurrentRateBps: unknownField(),
    hecmLifetimeCapBps: unknownField(),
    hecmMonthsElapsed: unknownField(),
  };
}

/** Seeds the shared context with a complete input, then renders the page. */
function Harness({
  input,
  children,
}: {
  input: SellerNetInput;
  children: React.ReactNode;
}) {
  const { loadInput } = useSellerNet();
  useEffect(() => {
    loadInput(input, "PID 4242");
  }, [input, loadInput]);
  return <>{children}</>;
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

afterEach(() => {
  cleanup();
});

describe("HECM client view", () => {
  it("carries the ESTIMATE / verify-with-lender warnings and both informational shortfalls", () => {
    renderWithProviders(
      <Harness input={lockedHecmInput()}>
        <ClientViewPage />
      </Harness>,
    );

    const section = screen.getByTestId("client_view.hecm.section");
    expect(section).toHaveTextContent(/ESTIMATE/i);
    expect(section).toHaveTextContent(/Verify with lender/i);
    expect(section).toHaveTextContent(/Lender\/attorney review required/i);

    // Both informational shortfall concepts are present with the accepted
    // benchmark figures.
    expect(
      within(section).getByText(/HECM Balance Shortfall/i),
    ).toBeInTheDocument();
    expect(within(section).getByText("$114,939.45")).toBeInTheDocument();
    expect(
      within(section).getByText(/Overall Transaction Shortfall/i),
    ).toBeInTheDocument();
    expect(within(section).getByText("$166,962.45")).toBeInTheDocument();

    // The projected HECM balance is the accepted benchmark.
    expect(within(section).getByText("$844,939.45")).toBeInTheDocument();
  });

  it("does not expose calculator internals in the seller-facing HECM view", () => {
    renderWithProviders(
      <Harness input={lockedHecmInput()}>
        <ClientViewPage />
      </Harness>,
    );

    // No provenance, basis-point rates, or raw input diagnostics leak through.
    expect(screen.queryByText(/basis point/i)).toBeNull();
    expect(screen.queryByText(/provenance/i)).toBeNull();
    expect(screen.queryByText(/USER_PROVIDED/)).toBeNull();
    expect(screen.queryByText(/DEFAULT_ASSUMPTION/)).toBeNull();
    expect(screen.queryByText(/hecmInitialBalance/)).toBeNull();
  });

  it("does not render the HECM section while HECM is inactive", () => {
    renderWithProviders(
      <Harness input={nonHecmInput()}>
        <ClientViewPage />
      </Harness>,
    );

    expect(screen.queryByTestId("client_view.hecm.section")).toBeNull();
    expect(screen.queryByText(/HECM Balance Shortfall/i)).toBeNull();
    expect(screen.queryByText(/Overall Transaction Shortfall/i)).toBeNull();
    // The ordinary total-deductions card is back.
    expect(
      screen.getByTestId("client_view.total_deductions.card"),
    ).toBeInTheDocument();
  });
});

describe("HECM print view", () => {
  it("includes the HECM estimate language and both informational shortfall concepts", () => {
    renderWithProviders(
      <Harness input={lockedHecmInput()}>
        <PrintViewPage />
      </Harness>,
    );

    const reviewNote = screen.getByTestId("print.hecm_review_note");
    expect(reviewNote).toHaveTextContent(/ESTIMATE/i);
    expect(reviewNote).toHaveTextContent(/Verify with lender/i);
    expect(reviewNote).toHaveTextContent(/Lender\/attorney review required/i);

    // Both informational shortfall concepts render with the accepted figures.
    // The print outcome cards use whole-dollar formatting.
    expect(
      screen.getByTestId("print.hecm_balance_shortfall"),
    ).toHaveTextContent("$114,939");
    expect(screen.getByTestId("print.overall_shortfall")).toHaveTextContent(
      "$166,962",
    );
    expect(screen.getByTestId("print.hecm_balance")).toHaveTextContent(
      "$844,939",
    );
    expect(screen.getByTestId("print.net_proceeds")).toHaveTextContent("$0");
  });

  it("does not render HECM estimate language while HECM is inactive", () => {
    renderWithProviders(
      <Harness input={nonHecmInput()}>
        <PrintViewPage />
      </Harness>,
    );

    expect(screen.queryByTestId("print.hecm_review_note")).toBeNull();
    expect(screen.queryByTestId("print.hecm_balance")).toBeNull();
    expect(screen.queryByTestId("print.hecm_balance_shortfall")).toBeNull();
    expect(screen.queryByTestId("print.overall_shortfall")).toBeNull();
    // The ordinary mortgage payoff line is back in the waterfall.
    expect(screen.getByText("Mortgage payoff")).toBeInTheDocument();
  });
});
