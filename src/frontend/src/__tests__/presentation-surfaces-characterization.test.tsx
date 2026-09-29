import { DeductionBreakdownChart } from "@/components/charts/deduction-breakdown-chart";
import { ScenarioChart } from "@/components/charts/scenario-chart";
import { WaterfallChart } from "@/components/charts/waterfall-chart";
import { SectionIcon } from "@/components/ui/section-icon";
import { formatMoney, formatMoneyWhole } from "@/lib/format";
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
 * Presentation-surface characterization baseline.
 *
 * The upcoming change is PRESENTATION ONLY: the section icon system is upgraded
 * to dimensional icon-badges, and the three chart components are rebuilt as
 * native SVG with a signature financial waterfall. The financial behavior,
 * calculator outputs, and every observable contract must NOT change.
 *
 * This file freezes the BEHAVIOR-COUPLED invariants of the section headers and
 * chart surfaces — the things a presentation refactor must preserve — and
 * deliberately avoids the PRESENTATION-COUPLED details the refactor is allowed
 * to change. The distinction is explicit below so the later cover pass knows
 * what may legitimately move.
 *
 * BEHAVIOR-COUPLED (frozen here; a refactor that breaks these is a regression):
 *   - every major section header still renders its exact label text;
 *   - the section icon badge stays decorative: hidden from assistive tech and
 *     never a button or link, so it never pollutes the accessible name;
 *   - `SectionIcon` with an explicit `label` exposes that label as its
 *     accessible name (the only supported way to make it meaningful);
 *   - each chart reads the canonical `SellerNetOutput` / `computeScenarios()`
 *     figures and renders them as text, so a chart can never re-derive or round
 *     a financial value differently;
 *   - the charts update live when an input changes the calculated numbers;
 *   - the decorative chart panels never leak into the client or print views.
 *
 * PRESENTATION-COUPLED (NOT asserted here; the refactor may change these):
 *   - the `.icon-badge` / `.icon-badge-lg` class names and the badge's inner
 *     `<svg>` glyph identity;
 *   - the chart's SVG element structure, `viewBox`, `preserveAspectRatio`, the
 *     `.chart-bar` / `.chart-baseline` / `.chart-track` classes, and the
 *     `role="img"` figure wrapper;
 *   - the mobile proportional rail vs. the full stepped chart;
 *   - the `font-semibold` emphasis class on the Current scenario bar.
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
 * The eleven major section headers that carry an icon badge, keyed by the
 * section container's `data-ocid`. Only the label text and the badge's
 * decorative contract are frozen — not the badge's class or glyph.
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

describe("section header labels survive the icon upgrade", () => {
  it("renders every major section header label on the work surface", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    for (const { ocid, label } of ICON_SECTIONS) {
      const section = screen.getByTestId(ocid);
      expect(within(section).getByText(label)).toBeInTheDocument();
    }
  });

  it("keeps the section header label as the accessible heading text", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    // The label is a real heading, so the icon badge must not replace it. The
    // advanced sections append a meta suffix ("Rates & fees"), so match the
    // label as a prefix rather than the whole accessible name.
    for (const { ocid, label } of ICON_SECTIONS) {
      const section = screen.getByTestId(ocid);
      const heading = within(section).getByRole("heading", {
        name: new RegExp(`^${label.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}`),
      });
      expect(heading).toBeInTheDocument();
    }
  });
});

describe("section icon badge stays decorative", () => {
  it("hides the unlabeled badge from assistive technology", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    // Every production caller omits `label`, so the badge is decorative: it
    // must be aria-hidden and never a control, regardless of its markup.
    for (const { ocid } of ICON_SECTIONS) {
      const section = screen.getByTestId(ocid);
      const hidden = section.querySelectorAll('[aria-hidden="true"]');
      expect(hidden.length, `no aria-hidden badge in ${ocid}`).toBeGreaterThan(
        0,
      );
    }
  });

  it("never renders the badge as a button or link", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    for (const { ocid } of ICON_SECTIONS) {
      const section = screen.getByTestId(ocid);
      // The badge is a decorative chip, so no interactive control may be
      // introduced inside the header by the icon upgrade.
      const controls = section.querySelectorAll("button, a");
      for (const control of controls) {
        // The only permitted controls are the section's own disclosure toggle
        // and the scenario spread input; a badge must never add one.
        expect(control.getAttribute("data-ocid") ?? "").not.toContain("icon");
      }
    }
  });

  it("exposes an explicit label as the badge's accessible name", () => {
    render(<SectionIcon section="waterfall" label="Seller net waterfall" />);

    // The supported way to make the badge meaningful is the `label` prop; it
    // must surface as an accessible name, not be swallowed by the glyph.
    expect(
      screen.getByRole("img", { name: "Seller net waterfall" }),
    ).toBeInTheDocument();
  });

  it("renders a decorative badge with no accessible name when unlabeled", () => {
    const { container } = render(<SectionIcon section="waterfall" />);

    // Unlabeled: hidden from the accessibility tree entirely.
    const badge = container.firstElementChild as HTMLElement;
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("waterfall chart reads canonical figures", () => {
  it("renders the canonical net proceeds as the chart total", () => {
    renderWithProviders(<WaterfallChart />, completeInput());

    expect(screen.getByTestId("waterfall_chart.net")).toHaveTextContent(
      formatMoney(CANONICAL.estimatedNetProceeds),
    );
  });

  it("lists every deduction step with its canonical amount", () => {
    renderWithProviders(<WaterfallChart />, completeInput());

    const expected: Array<[string, number]> = [
      ["commissions", CANONICAL.totalCommissions],
      ["closing_costs", CANONICAL.totalClosingCosts],
      ["payoff", CANONICAL.mortgagePayoff],
      ["hoa_liens", CANONICAL.totalEncumbrances - CANONICAL.mortgagePayoff],
      [
        "seller_costs",
        CANONICAL.totalDeductions -
          CANONICAL.totalCommissions -
          CANONICAL.totalClosingCosts -
          CANONICAL.totalEncumbrances,
      ],
      ["estimated_tax", 0],
    ];
    for (const [step, amount] of expected) {
      const row = screen.getByTestId(`waterfall_chart.step.${step}`);
      expect(within(row).getByText(formatMoney(amount))).toBeInTheDocument();
    }
  });

  it("shows the estimated tax step only when the tax module is active", () => {
    renderWithProviders(<WaterfallChart />, completeInput());
    // Tax inactive: the step exists but carries a zero amount.
    expect(
      screen.getByTestId("waterfall_chart.step.estimated_tax"),
    ).toHaveTextContent(formatMoney(0));

    cleanup();
    const taxed = completeInput({
      originalPurchasePrice: userProvided(300_000),
      capitalImprovements: userProvided(50_000),
      section121Status: "NONE",
      estimatedCapitalGainsTaxRateBps: userProvided(1_500),
    });
    const taxedOutput = calculateSellerNetWaterfall(taxed).output;
    expect(taxedOutput.taxActive).toBe(true);
    renderWithProviders(<WaterfallChart />, taxed);
    expect(
      screen.getByTestId("waterfall_chart.step.estimated_tax"),
    ).toHaveTextContent(formatMoney(taxedOutput.estimatedTaxOwed));
  });

  it("labels the primary encumbrance as the HECM payoff when HECM is active", () => {
    const hecmInput = completeInput({
      isHecm: true,
      hecmInitialBalance: userProvided(200_000),
      hecmCurrentRateBps: userProvided(600),
      hecmLifetimeCapBps: unknownField(),
      hecmMonthsElapsed: userProvided(24),
    });
    const hecmOutput = calculateSellerNetWaterfall(hecmInput).output;
    renderWithProviders(<WaterfallChart />, hecmInput);

    const payoff = screen.getByTestId("waterfall_chart.step.payoff");
    expect(within(payoff).getByText("HECM payoff")).toBeInTheDocument();
    expect(
      within(payoff).getByText(formatMoney(hecmOutput.hecmAccruedPayoff ?? 0)),
    ).toBeInTheDocument();
  });
});

describe("deduction breakdown chart reads canonical figures", () => {
  it("renders the five categories with their canonical amounts", () => {
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
    renderWithProviders(<DeductionBreakdownChart />, input);

    const expected: Array<[string, number]> = [
      ["commissions", output.totalCommissions],
      ["closing_costs", output.totalClosingCosts],
      ["payoffs", output.totalEncumbrances],
      [
        "seller_costs",
        output.totalDeductions -
          output.totalCommissions -
          output.totalClosingCosts -
          output.totalEncumbrances,
      ],
      ["estimated_tax", output.estimatedTaxOwed],
    ];
    for (const [category, amount] of expected) {
      const row = screen.getByTestId(`deduction_breakdown.item.${category}`);
      expect(within(row).getByText(formatMoney(amount))).toBeInTheDocument();
    }
  });

  it("renders a percentage share for each category", () => {
    renderWithProviders(<DeductionBreakdownChart />, completeInput());

    for (const category of [
      "commissions",
      "closing_costs",
      "payoffs",
      "seller_costs",
      "estimated_tax",
    ]) {
      expect(
        screen.getByTestId(`deduction_breakdown.item.${category}`),
      ).toHaveTextContent(/%/);
    }
  });
});

describe("scenario chart reads canonical scenario figures", () => {
  it("renders a bar per scenario with the canonical net proceeds", () => {
    const comparison = computeScenarios(
      completeInput(),
      calculateSellerNetWaterfall(completeInput()),
      25_000,
    );
    renderWithProviders(<ScenarioChart scenarios={comparison.scenarios} />);

    for (const scenario of comparison.scenarios) {
      const bar = screen.getByTestId(`scenario_chart.bar.${scenario.key}`);
      expect(bar).toHaveTextContent(scenario.label);
      if (scenario.figures) {
        expect(bar).toHaveTextContent(
          formatMoney(scenario.figures.estimatedNetProceeds),
        );
      }
    }
  });

  it("renders the friction-adjusted marker only when friction is active", () => {
    const plain = computeScenarios(
      completeInput(),
      calculateSellerNetWaterfall(completeInput()),
      25_000,
    );
    renderWithProviders(<ScenarioChart scenarios={plain.scenarios} />);
    expect(screen.queryByText(/friction-adjusted/i)).toBeNull();

    cleanup();
    const frictionInput = completeInput({
      monthlyCarryingCost: userProvided(3_000),
      pctExpectedDom: userProvided(60),
      pctExpectedDiscountPct: userProvided(0.05),
    });
    const frictionComparison = computeScenarios(
      frictionInput,
      calculateSellerNetWaterfall(frictionInput),
      25_000,
    );
    renderWithProviders(
      <ScenarioChart scenarios={frictionComparison.scenarios} />,
    );
    expect(screen.getByText(/friction-adjusted/i)).toBeInTheDocument();
  });
});

describe("charts stay live with the calculated numbers", () => {
  it("updates the waterfall chart when the base price changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    await waitFor(() => {
      for (const net of screen.getAllByTestId("waterfall_chart.net")) {
        expect(net).toHaveTextContent(
          formatMoney(CANONICAL.estimatedNetProceeds),
        );
      }
    });

    const raised = calculateSellerNetWaterfall(
      completeInput({ manualAdjustedPrice: userProvided(600_000) }),
    ).output;
    expect(raised.estimatedNetProceeds).not.toBe(
      CANONICAL.estimatedNetProceeds,
    );

    await user.click(screen.getByTestId("inputs.condition_renovation.toggle"));
    await user.type(
      screen.getByTestId("inputs.manual_adjusted_price"),
      "600000",
    );

    await waitFor(() => {
      for (const net of screen.getAllByTestId("waterfall_chart.net")) {
        expect(net).toHaveTextContent(formatMoney(raised.estimatedNetProceeds));
      }
    });
  });

  it("updates the deduction breakdown when a deduction changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const before = screen.getByTestId(
      "deduction_breakdown.item.commissions",
    ).textContent;

    await user.clear(screen.getByTestId("inputs.listing_commission"));
    await user.type(screen.getByTestId("inputs.listing_commission"), "500");

    await waitFor(() => {
      expect(
        screen.getByTestId("deduction_breakdown.item.commissions").textContent,
      ).not.toBe(before);
    });
  });

  it("updates the scenario chart when the spread changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const before = screen.getByTestId(
      "scenario_chart.bar.downside",
    ).textContent;

    await user.clear(screen.getByTestId("scenario.spread_input"));
    await user.type(screen.getByTestId("scenario.spread_input"), "50000");

    await waitFor(() => {
      expect(
        screen.getByTestId("scenario_chart.bar.downside").textContent,
      ).not.toBe(before);
    });
  });
});

describe("decorative chart panels stay out of client and print views", () => {
  it("does not render the chart panels on the client view", () => {
    renderWithProviders(<ClientViewPage />, completeInput());

    expect(screen.queryByTestId("waterfall_chart.panel")).toBeNull();
    expect(screen.queryByTestId("deduction_breakdown.panel")).toBeNull();
    expect(screen.queryByTestId("scenario_chart.panel")).toBeNull();
    // The seller-facing figures still render.
    expect(
      screen.getByTestId("client_view.net_proceeds.card"),
    ).toHaveTextContent(formatMoneyWhole(CANONICAL.estimatedNetProceeds));
  });

  it("does not render the chart panels on the print sheet", () => {
    renderWithProviders(<PrintViewPage />, completeInput());

    expect(screen.queryByTestId("waterfall_chart.panel")).toBeNull();
    expect(screen.queryByTestId("deduction_breakdown.panel")).toBeNull();
    expect(screen.queryByTestId("scenario_chart.panel")).toBeNull();
    expect(screen.getByTestId("print.net_proceeds")).toHaveTextContent(
      formatMoneyWhole(CANONICAL.estimatedNetProceeds),
    );
  });
});
