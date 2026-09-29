import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { ClientViewPage } from "@/pages/client-view";
import PrintViewPage from "@/pages/print-view";
import { WorkSurfacePage } from "@/pages/work-surface";
import { SellerNetProvider, useSellerNet } from "@/state/seller-net-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Capital Gains / Section 121 presentation journeys.
 *
 * These are component/integration tests over the real provider and calculator
 * with the backend actor mocked locally. They prove the accepted presentation
 * contract: the section is collapsed by default and out of the primary
 * workflow, the tax rows appear in the waterfall / client view / print view
 * only while the module is active, the CPA/tax disclaimer is shown, and no
 * internal variable names leak into the seller-facing surfaces.
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

/** A complete, calculable input with the tax module untouched (inactive). */
function baseInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
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
    // Friction module untouched: every friction field UNKNOWN keeps it inactive.
    monthlyCarryingCost: unknownField(),
    pctExpectedDom: unknownField(),
    pctExpectedDiscountPct: unknownField(),
    ...overrides,
  };
}

/** A complete, calculable input with the tax module active. */
function taxInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
  return baseInput({
    originalPurchasePrice: userProvided(300_000),
    capitalImprovements: userProvided(50_000),
    section121Status: "NONE",
    estimatedCapitalGainsTaxRateBps: userProvided(1_500),
    ...overrides,
  });
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("Capital Gains / Section 121 work-surface section", () => {
  it("is collapsed by default and does not render its fields", () => {
    renderWithProviders(<WorkSurfacePage />);
    const toggle = screen.getByTestId("inputs.capital_gains.toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("inputs.original_purchase_price")).toBeNull();
    expect(screen.queryByTestId("inputs.capital_improvements")).toBeNull();
    expect(screen.queryByTestId("inputs.capital_gains_tax_rate")).toBeNull();
  });

  it("expands to reveal the four tax fields", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await user.click(screen.getByTestId("inputs.capital_gains.toggle"));

    expect(
      screen.getByTestId("inputs.original_purchase_price"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("inputs.capital_improvements"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("inputs.capital_gains_tax_rate"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("inputs.section_121.unknown"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("inputs.section_121.none")).toBeInTheDocument();
    expect(screen.getByTestId("inputs.section_121.single")).toBeInTheDocument();
    expect(
      screen.getByTestId("inputs.section_121.married"),
    ).toBeInTheDocument();
  });

  it("shows the five tax results once the module is active", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness input={taxInput()}>
        <WorkSurfacePage />
      </Harness>,
    );
    await user.click(screen.getByTestId("inputs.capital_gains.toggle"));

    const results = screen.getByTestId("inputs.tax_results");
    expect(within(results).getByText("Adjusted basis")).toBeInTheDocument();
    expect(within(results).getByText("Capital gain")).toBeInTheDocument();
    expect(
      within(results).getByText("Section 121 exclusion"),
    ).toBeInTheDocument();
    expect(within(results).getByText("Taxable gain")).toBeInTheDocument();
    expect(
      within(results).getByText("Estimated capital-gains tax"),
    ).toBeInTheDocument();
  });

  it("does not render tax results while the module is inactive", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness input={baseInput()}>
        <WorkSurfacePage />
      </Harness>,
    );
    await user.click(screen.getByTestId("inputs.capital_gains.toggle"));
    expect(screen.queryByTestId("inputs.tax_results")).toBeNull();
  });
});

describe("tax waterfall rows", () => {
  it("omits the capital-gains tax row while the module is inactive", () => {
    renderWithProviders(
      <Harness input={baseInput()}>
        <WorkSurfacePage />
      </Harness>,
    );
    expect(screen.queryByTestId("waterfall.row.capital_gains_tax")).toBeNull();
  });

  it("adds a separate capital-gains tax row after ordinary deductions when active", () => {
    renderWithProviders(
      <Harness input={taxInput()}>
        <WorkSurfacePage />
      </Harness>,
    );
    const row = screen.getByTestId("waterfall.row.capital_gains_tax");
    expect(
      within(row).getByText("Estimated capital-gains tax"),
    ).toBeInTheDocument();
    // The row is explicitly not part of total deductions.
    expect(row).toHaveTextContent(/not part of total deductions/i);
    // The ordinary total-deductions label is not relabeled.
    expect(screen.getByTestId("kpi.total_deductions")).toBeInTheDocument();
  });

  it("deducts the estimated tax from the rendered net proceeds", () => {
    renderWithProviders(
      <Harness input={taxInput()}>
        <WorkSurfacePage />
      </Harness>,
    );
    // gross 500,000; deductions 300,000 + 25,000 + 5,350 = 330,350;
    // nominal net 169,650; taxable gain 150,000; tax 22,500; net 147,150.
    expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
      "$147,150.00",
    );
  });
});

describe("tax client view", () => {
  it("shows the estimated tax line and the CPA/tax disclaimer when active", () => {
    renderWithProviders(
      <Harness input={taxInput()}>
        <ClientViewPage />
      </Harness>,
    );
    expect(
      screen.getByTestId("client_view.capital_gains_tax.line"),
    ).toHaveTextContent("Estimated capital-gains tax");
    expect(screen.getByTestId("client_view.tax_disclaimer")).toHaveTextContent(
      /CPA or tax professional/i,
    );
  });

  it("omits tax rows and the disclaimer when inactive", () => {
    renderWithProviders(
      <Harness input={baseInput()}>
        <ClientViewPage />
      </Harness>,
    );
    expect(
      screen.queryByTestId("client_view.capital_gains_tax.line"),
    ).toBeNull();
    expect(screen.queryByTestId("client_view.tax_disclaimer")).toBeNull();
  });

  it("does not expose internal variable names in the seller-facing view", () => {
    renderWithProviders(
      <Harness input={taxInput()}>
        <ClientViewPage />
      </Harness>,
    );
    expect(screen.queryByText(/adjustedBasis/)).toBeNull();
    expect(screen.queryByText(/estimatedTaxOwed/)).toBeNull();
    expect(screen.queryByText(/section121Exemption/)).toBeNull();
    expect(screen.queryByText(/taxActive/)).toBeNull();
    expect(screen.queryByText(/basis point/i)).toBeNull();
    expect(screen.queryByText(/provenance/i)).toBeNull();
  });
});

describe("tax print view", () => {
  it("shows the estimated tax section and the CPA/tax disclaimer when active", () => {
    renderWithProviders(
      <Harness input={taxInput()}>
        <PrintViewPage />
      </Harness>,
    );
    const section = screen.getByTestId("print.tax_section");
    expect(section).toHaveTextContent("Adjusted basis");
    expect(section).toHaveTextContent("Capital gain");
    expect(section).toHaveTextContent("Section 121 exclusion");
    expect(section).toHaveTextContent("Taxable gain");
    expect(section).toHaveTextContent(/CPA or tax professional/i);
  });

  it("omits the tax section when inactive", () => {
    renderWithProviders(
      <Harness input={baseInput()}>
        <PrintViewPage />
      </Harness>,
    );
    expect(screen.queryByTestId("print.tax_section")).toBeNull();
  });

  it("does not expose internal variable names on the printed sheet", () => {
    renderWithProviders(
      <Harness input={taxInput()}>
        <PrintViewPage />
      </Harness>,
    );
    expect(screen.queryByText(/adjustedBasis/)).toBeNull();
    expect(screen.queryByText(/estimatedTaxOwed/)).toBeNull();
    expect(screen.queryByText(/section121Exemption/)).toBeNull();
  });
});
