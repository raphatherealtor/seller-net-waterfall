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
import { type ReactElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Friction on the client and print surfaces.
 *
 * The accepted contract is that the supplemental Market / Time Friction block
 * appears on the client view and the print sheet ONLY while the friction module
 * is active, and that it never replaces the primary Estimated Net Proceeds.
 * These are component/integration tests over the real provider and canonical
 * calculator with the backend actor mocked locally; they do not exercise a
 * deployed browser or a real backend.
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

/** A complete, calculable input; friction fields default to UNKNOWN (inactive). */
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

function renderWithProviders(ui: ReactElement, input: SellerNetInput) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerNetProvider>
        <SeedInput input={input} />
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

describe("client view friction surface", () => {
  it("omits the friction block while the module is inactive", () => {
    renderWithProviders(<ClientViewPage />, completeInput());
    expect(
      screen.queryByTestId("client_view.friction.section"),
    ).not.toBeInTheDocument();
  });

  it("shows the supplemental friction block with the accepted figures when active", () => {
    renderWithProviders(
      <ClientViewPage />,
      completeInput({
        monthlyCarryingCost: userProvided(3_000),
        pctExpectedDom: userProvided(60),
        pctExpectedDiscountPct: userProvided(0.05),
      }),
    );

    const section = screen.getByTestId("client_view.friction.section");
    expect(
      within(section).getByTestId("client_view.friction.carrying_loss.line"),
    ).toHaveTextContent("$6,000.00");
    expect(
      within(section).getByTestId("client_view.friction.stale_discount.line"),
    ).toHaveTextContent("$25,000.00");
    expect(
      within(section).getByTestId("client_view.friction.net_after.line"),
    ).toHaveTextContent("$138,650.00");
    // The primary net proceeds card is unchanged by the supplemental block.
    expect(
      screen.getByTestId("client_view.net_proceeds.card"),
    ).toHaveTextContent("$169,650");
  });
});

describe("print view friction surface", () => {
  it("omits the friction section while the module is inactive", () => {
    renderWithProviders(<PrintViewPage />, completeInput());
    expect(screen.queryByTestId("print.friction_section")).toBeNull();
  });

  it("includes the supplemental friction section when active", () => {
    renderWithProviders(
      <PrintViewPage />,
      completeInput({
        monthlyCarryingCost: userProvided(3_000),
        pctExpectedDom: userProvided(60),
        pctExpectedDiscountPct: userProvided(0.05),
      }),
    );

    const section = screen.getByTestId("print.friction_section");
    expect(section).toHaveTextContent(/Market & time friction/i);
    expect(section).toHaveTextContent("$6,000.00");
    expect(section).toHaveTextContent("$25,000.00");
    expect(section).toHaveTextContent("$138,650.00");
    // The primary net proceeds line still carries the un-supplemented figure.
    expect(screen.getByTestId("print.net_proceeds")).toHaveTextContent(
      "$169,650",
    );
  });
});
