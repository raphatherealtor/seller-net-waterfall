import { ClientSummary } from "@/components/client-view/client-summary";
import { KpiRow } from "@/components/work-surface/kpi-row";
import { ScenarioComparison } from "@/components/work-surface/scenario-comparison";
import { Waterfall } from "@/components/work-surface/waterfall";
import { formatDeduction, formatMoney, formatMoneyWhole } from "@/lib/format";
import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
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
import { type ReactElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Chart-surface characterization baseline.
 *
 * The upcoming change is PRESENTATION ONLY: it adds a live waterfall chart, a
 * deduction-breakdown chart, a scenario-comparison chart, section-header icon
 * badges, and a consistent depth/shadow system. It must not change a single
 * figure, label, or conditional surface the user already sees.
 *
 * These tests freeze the OBSERVABLE figures and structure of the surfaces the
 * charts will be built from and sit beside — the waterfall ledger, the KPI
 * readouts, the scenario cards, the client summary, and the section headers —
 * deliberately avoiding CSS class names and DOM shape that the presentation
 * change is expected to alter. Every expected figure is derived from the
 * canonical calculator output, so a chart that re-derives or rounds differently
 * fails here.
 *
 * These are component/integration tests over the real provider and calculator
 * with the backend actor mocked locally. They do NOT exercise a deployed
 * browser or a real backend.
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

/** The canonical output for the standard input, the source of every figure. */
const CANONICAL = calculateSellerNetWaterfall(completeInput()).output;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("waterfall ledger figures the chart must mirror", () => {
  it("renders the gross price and every deduction row from the canonical output", () => {
    renderWithProviders(<Waterfall />, completeInput());

    const waterfall = screen.getByTestId("waterfall.section");
    // Gross sale price leads the ledger.
    expect(within(waterfall).getByText("Gross sale price")).toBeInTheDocument();
    expect(within(waterfall).getByText("$500,000.00")).toBeInTheDocument();

    // Each deduction row carries the canonical total, signed.
    const expectedRows: Array<[string, number]> = [
      ["waterfall.row.commissions", CANONICAL.totalCommissions],
      ["waterfall.row.closing_costs", CANONICAL.totalClosingCosts],
      ["waterfall.row.mortgage", CANONICAL.mortgagePayoff],
      [
        "waterfall.row.hoa_liens",
        CANONICAL.totalEncumbrances - CANONICAL.mortgagePayoff,
      ],
      [
        "waterfall.row.staging_repairs",
        CANONICAL.totalDeductions -
          CANONICAL.totalEncumbrances -
          CANONICAL.totalCommissions -
          CANONICAL.totalClosingCosts,
      ],
    ];
    for (const [testId, amount] of expectedRows) {
      const row = screen.getByTestId(testId);
      expect(
        within(row).getByText(formatDeduction(amount)),
      ).toBeInTheDocument();
    }
  });

  it("renders the canonical net proceeds as the ledger total", () => {
    renderWithProviders(<Waterfall />, completeInput());

    expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
      formatMoney(CANONICAL.estimatedNetProceeds),
    );
  });

  it("keeps the capital-gains tax line after the deduction list and before net proceeds", () => {
    renderWithProviders(
      <Waterfall />,
      completeInput({
        originalPurchasePrice: userProvided(300_000),
        capitalImprovements: userProvided(50_000),
        section121Status: "NONE",
        estimatedCapitalGainsTaxRateBps: userProvided(1_500),
      }),
    );

    const taxRow = screen.getByTestId("waterfall.row.capital_gains_tax");
    const list = screen.getByTestId("waterfall.list");
    const net = screen.getByTestId("waterfall.net_proceeds");

    // The tax line follows the ordinary deduction list and precedes the total.
    expect(
      list.compareDocumentPosition(taxRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      taxRow.compareDocumentPosition(net) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(taxRow).toHaveTextContent(/Estimated capital-gains tax/i);
  });
});

describe("deduction-breakdown source totals the chart must consume", () => {
  it("exposes the canonical commission, closing, encumbrance, seller-cost, and tax totals", () => {
    const input = completeInput({
      hoaPayoff: userProvided(1_200),
      liensJudgments: userProvided(4_500),
      stagingPhotoCost: userProvided(1_500),
      sellerConcessionsToBuyer: userProvided(5_000),
      repairsCost: userProvided(2_500),
      renovationCost: userProvided(10_000),
      originalPurchasePrice: userProvided(300_000),
      capitalImprovements: userProvided(50_000),
      section121Status: "NONE",
      estimatedCapitalGainsTaxRateBps: userProvided(1_500),
    });
    const output = calculateSellerNetWaterfall(input).output;

    // The five breakdown categories are all present and non-negative, and the
    // seller-cost residual is exactly what the waterfall's staging row shows.
    const sellerCosts =
      output.totalDeductions -
      output.totalEncumbrances -
      output.totalCommissions -
      output.totalClosingCosts;
    expect(output.totalCommissions).toBeGreaterThan(0);
    expect(output.totalClosingCosts).toBeGreaterThan(0);
    expect(output.totalEncumbrances).toBeGreaterThan(0);
    expect(sellerCosts).toBeGreaterThan(0);
    expect(output.estimatedTaxOwed).toBeGreaterThan(0);

    // The work surface renders those same canonical figures, so a breakdown
    // chart reading the rendered surface cannot diverge from the calculator.
    renderWithProviders(<WorkSurfacePage />, input);
    expect(
      within(screen.getByTestId("waterfall.row.commissions")).getByText(
        formatDeduction(output.totalCommissions),
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("waterfall.row.closing_costs")).getByText(
        formatDeduction(output.totalClosingCosts),
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("waterfall.row.staging_repairs")).getByText(
        formatDeduction(sellerCosts),
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("waterfall.row.capital_gains_tax")).getByText(
        formatDeduction(output.estimatedTaxOwed),
      ),
    ).toBeInTheDocument();
  });
});

describe("KPI readouts the charts sit beside", () => {
  it("renders the canonical gross price, total deductions, and net proceeds", () => {
    renderWithProviders(<KpiRow />, completeInput());

    expect(screen.getByTestId("kpi.gross_price")).toHaveTextContent(
      formatMoneyWhole(CANONICAL.grossPrice),
    );
    expect(screen.getByTestId("kpi.total_deductions")).toHaveTextContent(
      formatMoneyWhole(CANONICAL.totalDeductions),
    );
    expect(screen.getByTestId("kpi.net_proceeds")).toHaveTextContent(
      formatMoneyWhole(CANONICAL.estimatedNetProceeds),
    );
  });

  it("shows the shortfall card only when deductions exceed gross", () => {
    renderWithProviders(<KpiRow />, completeInput());
    expect(screen.queryByTestId("kpi.shortfall")).toBeNull();

    cleanup();
    renderWithProviders(
      <KpiRow />,
      completeInput({ mortgageBalance: userProvided(900_000) }),
    );
    expect(screen.getByTestId("kpi.shortfall")).toBeInTheDocument();
  });

  it("shows the friction card only while the friction module is active", () => {
    renderWithProviders(<KpiRow />, completeInput());
    expect(screen.queryByTestId("kpi.friction_net")).toBeNull();

    cleanup();
    renderWithProviders(
      <KpiRow />,
      completeInput({
        monthlyCarryingCost: userProvided(3_000),
        pctExpectedDom: userProvided(60),
        pctExpectedDiscountPct: userProvided(0.05),
      }),
    );
    expect(screen.getByTestId("kpi.friction_net")).toBeInTheDocument();
  });
});

describe("scenario comparison figures the chart must mirror", () => {
  it("renders each scenario's canonical gross price and net proceeds", () => {
    renderWithProviders(<ScenarioComparison />, completeInput());

    const current = screen.getByTestId("scenario.column.current");
    expect(
      within(current).getByTestId("scenario.net_proceeds"),
    ).toHaveTextContent(formatMoney(CANONICAL.estimatedNetProceeds));
    expect(
      within(current).getByText(formatMoney(CANONICAL.grossPrice)),
    ).toBeInTheDocument();

    // Downside and Upside carry the default ±25,000 spread.
    expect(
      within(screen.getByTestId("scenario.column.downside")).getByText(
        "$475,000.00",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("scenario.column.upside")).getByText(
        "$525,000.00",
      ),
    ).toBeInTheDocument();
  });

  it("renders the per-scenario deduction figures, not just their labels", () => {
    renderWithProviders(<ScenarioComparison />, completeInput());

    const current = screen.getByTestId("scenario.column.current");
    // The Current column's figures are the canonical output's.
    expect(
      within(current).getByText(formatMoney(CANONICAL.totalCommissions)),
    ).toBeInTheDocument();
    expect(
      within(current).getByText(formatMoney(CANONICAL.totalClosingCosts)),
    ).toBeInTheDocument();
    expect(
      within(current).getByText(formatMoney(CANONICAL.mortgagePayoff)),
    ).toBeInTheDocument();
  });

  it("marks the Current column as the baseline and keeps Downside/Upside distinct", () => {
    renderWithProviders(<ScenarioComparison />, completeInput());

    expect(
      within(screen.getByTestId("scenario.column.current")).getByText(
        "Baseline",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("scenario.column.downside")).queryByText(
        "Baseline",
      ),
    ).toBeNull();
    expect(
      within(screen.getByTestId("scenario.column.upside")).queryByText(
        "Baseline",
      ),
    ).toBeNull();
  });
});

describe("section headers keep their labels", () => {
  it("renders every major section header label on the work surface", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    // The icon badge is added alongside these labels; the labels themselves
    // must survive the presentation change.
    for (const label of [
      "Property / Case",
      "Primary Inputs",
      "Seller Net Waterfall",
      "Price Scenario Comparison",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // The advanced section headers are collapsed but still labeled.
    for (const label of [
      "Closing Cost Assumptions",
      "HOA / Liens",
      "Condition / Renovation",
      "HECM / Reverse Mortgage",
      "Capital Gains / Section 121",
      "Market / Time Friction",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("client summary figures the presentation change must not disturb", () => {
  it("renders the canonical deduction lines and net proceeds", () => {
    renderWithProviders(<ClientSummary output={CANONICAL} />);

    expect(
      screen.getByTestId("client_view.gross_price.card"),
    ).toHaveTextContent(formatMoneyWhole(CANONICAL.grossPrice));
    expect(
      screen.getByTestId("client_view.net_proceeds.card"),
    ).toHaveTextContent(formatMoneyWhole(CANONICAL.estimatedNetProceeds));

    const waterfall = screen.getByTestId("client_view.waterfall.section");
    expect(
      within(waterfall).getByText(formatDeduction(CANONICAL.totalCommissions)),
    ).toBeInTheDocument();
    expect(
      within(waterfall).getByText(formatDeduction(CANONICAL.totalClosingCosts)),
    ).toBeInTheDocument();
    expect(
      within(waterfall).getByText(formatDeduction(CANONICAL.totalEncumbrances)),
    ).toBeInTheDocument();
  });
});

describe("work surface stays live as inputs change", () => {
  it("updates the waterfall and scenario figures when the base price changes", async () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    // The seeded surface resolves to the canonical figures.
    await waitFor(() => {
      expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
        formatMoney(CANONICAL.estimatedNetProceeds),
      );
    });

    // A different base price produces a different canonical net proceeds, and
    // the rendered surface follows it.
    const raised = calculateSellerNetWaterfall(
      completeInput({ basePrice: userProvided(600_000) }),
    ).output;
    expect(raised.estimatedNetProceeds).not.toBe(
      CANONICAL.estimatedNetProceeds,
    );

    cleanup();
    renderWithProviders(
      <WorkSurfacePage />,
      completeInput({ basePrice: userProvided(600_000) }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
        formatMoney(raised.estimatedNetProceeds),
      );
    });
  });
});
