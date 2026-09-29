import { DeductionBreakdownChart } from "@/components/charts/deduction-breakdown-chart";
import { ScenarioChart } from "@/components/charts/scenario-chart";
import { WaterfallChart } from "@/components/charts/waterfall-chart";
import { formatMoney } from "@/lib/format";
import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  computeScenarios,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { ClientViewPage } from "@/pages/client-view";
import PrintViewPage from "@/pages/print-view";
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
 * Chart-surface cover for the accepted presentation change.
 *
 * The accepted change adds: a small dimensional icon badge beside every major
 * section header, a live waterfall chart (gross → stepped deductions → net),
 * a proportional deduction-breakdown chart, and a compact scenario bar chart
 * with Current highlighted — all native HTML/CSS/SVG, deterministic, and live
 * with the calculated numbers. The right panel keeps its statement order, and
 * the client and print views stay clean.
 *
 * These tests assert the OBSERVABLE acceptance criteria:
 *
 *  - each of the eleven listed section headers renders an icon badge;
 *  - the waterfall chart renders valid results and updates after an input change;
 *  - the deduction breakdown renders its five categories and updates live;
 *  - the scenario chart renders three bars, highlights Current, and updates when
 *    the spread changes;
 *  - the right panel keeps its statement order;
 *  - the client and print views do not leak the decorative chart panels.
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

/**
 * The eleven major section headers that must carry an icon badge, keyed by the
 * section container's `data-ocid`. The badge is the `.icon-badge` chip inside
 * the header; the header label is asserted separately so a badge cannot be
 * mistaken for the title.
 */
const ICON_SECTIONS: ReadonlyArray<{ ocid: string; label: string }> = [
  { ocid: "inputs.property_section", label: "Property / Case" },
  { ocid: "inputs.primary_section", label: "Primary Inputs" },
  { ocid: "inputs.closing_costs", label: "Closing Cost Assumptions" },
  { ocid: "inputs.hoa_liens", label: "HOA / Liens" },
  { ocid: "inputs.condition_renovation", label: "Condition / Renovation" },
  { ocid: "inputs.hecm", label: "HECM / Reverse Mortgage" },
  { ocid: "inputs.capital_gains", label: "Capital Gains / Section 121" },
  { ocid: "inputs.market_friction", label: "Market / Time Friction" },
  { ocid: "charts.section", label: "Live charts" },
  { ocid: "waterfall.section", label: "Seller Net Waterfall" },
  { ocid: "scenario.section", label: "Price Scenario Comparison" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("section header icon badges", () => {
  it("renders a dimensional icon badge beside each of the eleven section titles", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    for (const { ocid, label } of ICON_SECTIONS) {
      const section = screen.getByTestId(ocid);
      // The header label survives alongside the badge.
      expect(within(section).getByText(label)).toBeInTheDocument();
      // The badge is the icon chip holding an SVG glyph.
      const badge = section.querySelector<HTMLElement>(".icon-badge");
      expect(badge, `no icon badge in ${ocid}`).not.toBeNull();
      expect(badge?.querySelector("svg")).not.toBeNull();
    }
  });

  it("renders the badge as a decorative, non-interactive chip", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const badge = screen
      .getByTestId("inputs.property_section")
      .querySelector<HTMLElement>(".icon-badge");
    expect(badge).not.toBeNull();
    // Decorative by default: hidden from assistive tech, never a control.
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge?.closest("button")).toBeNull();
    expect(badge?.closest("a")).toBeNull();
  });
});

describe("waterfall chart", () => {
  it("renders the gross-to-net chart with the canonical net proceeds", () => {
    renderWithProviders(<WaterfallChart />, completeInput());

    const panel = screen.getByTestId("waterfall_chart.panel");
    // The chart is an accessible figure describing the gross-to-net step-down.
    const figure = panel.querySelector("svg[role='img']");
    expect(figure).not.toBeNull();
    expect(figure).toHaveAccessibleName(/Seller net waterfall/i);
    // The net figure is the canonical one.
    expect(screen.getByTestId("waterfall_chart.net")).toHaveTextContent(
      /169,650/,
    );
  });

  it("lists every deduction step from the canonical output", () => {
    renderWithProviders(<WaterfallChart />, completeInput());

    for (const step of [
      "commissions",
      "closing_costs",
      "payoff",
      "hoa_liens",
      "seller_costs",
      "estimated_tax",
    ]) {
      expect(
        screen.getByTestId(`waterfall_chart.step.${step}`),
      ).toBeInTheDocument();
    }
    // The commission step carries the canonical total (500,000 × 5%).
    expect(
      screen.getByTestId("waterfall_chart.step.commissions"),
    ).toHaveTextContent(/25,000/);
  });

  it("updates the chart after an input change", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    // The work surface renders the chart twice (the live-charts section and the
    // textual waterfall header); both read the same canonical result.
    await waitFor(() => {
      for (const net of screen.getAllByTestId("waterfall_chart.net")) {
        expect(net).toHaveTextContent(/169,650/);
      }
    });

    // Raise the price via the manual override; the chart follows the calculator.
    const raised = calculateSellerNetWaterfall(
      completeInput({ manualAdjustedPrice: userProvided(600_000) }),
    ).output;
    expect(raised.estimatedNetProceeds).not.toBe(
      CANONICAL.estimatedNetProceeds,
    );
    const raisedNet = formatMoney(raised.estimatedNetProceeds);

    await user.click(screen.getByTestId("inputs.condition_renovation.toggle"));
    await user.type(
      screen.getByTestId("inputs.manual_adjusted_price"),
      "600000",
    );

    await waitFor(() => {
      for (const net of screen.getAllByTestId("waterfall_chart.net")) {
        expect(net).toHaveTextContent(raisedNet);
      }
    });
  });
});

describe("deduction breakdown chart", () => {
  it("renders the five proportional categories with shares and amounts", () => {
    renderWithProviders(<DeductionBreakdownChart />, completeInput());

    const panel = screen.getByTestId("deduction_breakdown.panel");
    for (const category of [
      "commissions",
      "closing_costs",
      "payoffs",
      "seller_costs",
      "estimated_tax",
    ]) {
      expect(
        within(panel).getByTestId(`deduction_breakdown.item.${category}`),
      ).toBeInTheDocument();
    }
    // The bar is present and the commission row shows a percentage share.
    expect(screen.getByTestId("deduction_breakdown.bar")).toBeInTheDocument();
    expect(
      screen.getByTestId("deduction_breakdown.item.commissions"),
    ).toHaveTextContent(/%/);
  });

  it("updates live with the calculated numbers when a deduction changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const before = screen.getByTestId(
      "deduction_breakdown.item.commissions",
    ).textContent;

    // Change the listing commission rate; the breakdown follows the calculator.
    await user.clear(screen.getByTestId("inputs.listing_commission"));
    await user.type(screen.getByTestId("inputs.listing_commission"), "500");

    await waitFor(() => {
      expect(
        screen.getByTestId("deduction_breakdown.item.commissions").textContent,
      ).not.toBe(before);
    });
  });
});

describe("scenario comparison chart", () => {
  it("renders a bar for each of the three scenarios", () => {
    const comparison = computeScenarios(
      completeInput(),
      calculateSellerNetWaterfall(completeInput()),
      25_000,
    );
    renderWithProviders(<ScenarioChart scenarios={comparison.scenarios} />);

    for (const key of ["downside", "current", "upside"]) {
      expect(
        screen.getByTestId(`scenario_chart.bar.${key}`),
      ).toBeInTheDocument();
    }
  });

  it("visually highlights the Current scenario", () => {
    const comparison = computeScenarios(
      completeInput(),
      calculateSellerNetWaterfall(completeInput()),
      25_000,
    );
    renderWithProviders(<ScenarioChart scenarios={comparison.scenarios} />);

    const current = screen.getByTestId("scenario_chart.bar.current");
    const downside = screen.getByTestId("scenario_chart.bar.downside");

    // Current is the only bar whose label carries the emphasis weight.
    const currentLabel = within(current).getByText("Current");
    const downsideLabel = within(downside).getByText("Downside");
    expect(currentLabel.className).toContain("font-semibold");
    expect(downsideLabel.className).not.toContain("font-semibold");
  });

  it("updates when the spread changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const downsideBefore = screen.getByTestId(
      "scenario_chart.bar.downside",
    ).textContent;

    // Widen the spread; the Downside bar's figure follows the calculator.
    await user.clear(screen.getByTestId("scenario.spread_input"));
    await user.type(screen.getByTestId("scenario.spread_input"), "50000");

    await waitFor(() => {
      expect(
        screen.getByTestId("scenario_chart.bar.downside").textContent,
      ).not.toBe(downsideBefore);
    });
  });
});

describe("right-panel statement order", () => {
  it("orders the results column net headline, KPI, charts, ledger, scenarios", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    // The net-proceeds headline is the hero block inside the KPI row, so the
    // KPI row is the container that follows it in the statement order.
    const netHeadline = screen.getByTestId("kpi.net_proceeds");
    const kpiRow = screen.getByTestId("kpi.row");
    // The chart panel renders twice (live-charts section and textual waterfall
    // header); the first occurrence is the one in the statement order.
    const waterfallChart = screen.getAllByTestId("waterfall_chart.panel")[0];
    const breakdown = screen.getByTestId("deduction_breakdown.panel");
    const ledger = screen.getByTestId("waterfall.section");
    const scenarioChart = screen.getByTestId("scenario_chart.panel");
    const scenarioCards = screen.getByTestId("scenario.column.current");

    // The headline is contained by the KPI row, so assert containment first,
    // then the sibling order of the results-column blocks.
    expect(kpiRow.contains(netHeadline)).toBe(true);

    const ordered = [
      kpiRow,
      waterfallChart,
      breakdown,
      ledger,
      scenarioChart,
      scenarioCards,
    ];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      expect(
        ordered[index].compareDocumentPosition(ordered[index + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `expected element ${index} before element ${index + 1}`,
      ).toBeTruthy();
    }
  });
});

describe("client and print views stay clean", () => {
  it("does not render the decorative chart panels on the client view", () => {
    renderWithProviders(<ClientViewPage />, completeInput());

    expect(screen.queryByTestId("waterfall_chart.panel")).toBeNull();
    expect(screen.queryByTestId("deduction_breakdown.panel")).toBeNull();
    expect(screen.queryByTestId("scenario_chart.panel")).toBeNull();
    // The seller-facing figures still render.
    expect(
      screen.getByTestId("client_view.net_proceeds.card"),
    ).toHaveTextContent(/169,650/);
  });

  it("does not render the decorative chart panels on the print sheet", () => {
    renderWithProviders(<PrintViewPage />, completeInput());

    expect(screen.queryByTestId("waterfall_chart.panel")).toBeNull();
    expect(screen.queryByTestId("deduction_breakdown.panel")).toBeNull();
    expect(screen.queryByTestId("scenario_chart.panel")).toBeNull();
    // The printable sheet still renders its canonical figures.
    expect(screen.getByTestId("print.net_proceeds")).toHaveTextContent(
      /169,650/,
    );
  });
});
