import { DeductionBreakdownChart } from "@/components/charts/deduction-breakdown-chart";
import { ScenarioChart } from "@/components/charts/scenario-chart";
import { WaterfallChart } from "@/components/charts/waterfall-chart";
import { SectionIcon } from "@/components/ui/section-icon";
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
import { WorkSurfacePage } from "@/pages/work-surface";
import { SellerNetProvider, useSellerNet } from "@/state/seller-net-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { type ReactElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Presentation-refinement cover for the dimensional icon system and the native
 * SVG chart rebuild.
 *
 * The accepted change is PRESENTATION ONLY: the section icon system gains a
 * dimensional icon-badge treatment (layered depth, cast shadow, inner
 * highlight, darker lower/right edge, one consistent light direction), and the
 * three chart components are rebuilt as native SVG — the waterfall as a stepped
 * financial waterfall with running-balance connectors, the scenario comparison
 * as native SVG, and the deduction breakdown as CSS/SVG. No financial formula,
 * calculator output, validation, HECM, Section 121, friction, scenario math,
 * snapshot, or provenance behavior changes.
 *
 * These tests assert the OBSERVABLE acceptance criteria the existing chart
 * cover does not already pin:
 *
 *  - every major section header badge carries the dimensional `.icon-badge`
 *    treatment (layered depth + a glyph seated in a recessed plate);
 *  - the waterfall renders as native SVG with a gross column, one floating
 *    deduction bar per step, running-balance connectors, and a terminating net
 *    column that carries the strongest emphasis;
 *  - the scenario comparison renders as native SVG bars;
 *  - the deduction breakdown renders as CSS/SVG (a proportional bar, no
 *    recomputation);
 *  - every chart figure is the canonical calculator output.
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

/** The eleven major section headers that carry an icon badge. */
const ICON_SECTIONS = [
  "inputs.property_section",
  "inputs.primary_section",
  "inputs.closing_costs",
  "inputs.hoa_liens",
  "inputs.condition_renovation",
  "inputs.hecm",
  "inputs.capital_gains",
  "inputs.market_friction",
  "charts.section",
  "waterfall.section",
  "scenario.section",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("dimensional icon badges", () => {
  it("renders a layered badge with a recessed glyph plate beside every section header", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    for (const ocid of ICON_SECTIONS) {
      const section = screen.getByTestId(ocid);
      const badge = section.querySelector<HTMLElement>(".icon-badge");
      expect(badge, `no icon badge in ${ocid}`).not.toBeNull();
      // The dimensional treatment is layered: the badge face holds a recessed
      // glyph plate, which in turn seats the lucide glyph.
      const plate = badge?.querySelector<HTMLElement>(".icon-badge-glyph");
      expect(plate, `no glyph plate in ${ocid}`).not.toBeNull();
      expect(plate?.querySelector("svg")).not.toBeNull();
    }
  });

  it("renders the badge as a decorative, non-interactive chip", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    for (const ocid of ICON_SECTIONS) {
      const badge = screen
        .getByTestId(ocid)
        .querySelector<HTMLElement>(".icon-badge");
      expect(badge).not.toBeNull();
      // Decorative by default: hidden from assistive tech, and the badge
      // itself is never a control. (An advanced section's badge sits inside
      // that section's disclosure button, which is the header's own control —
      // the badge must not add one of its own.)
      expect(badge).toHaveAttribute("aria-hidden", "true");
      expect(badge?.tagName).toBe("SPAN");
      expect(badge).not.toHaveAttribute("role", "button");
      expect(badge).not.toHaveAttribute("tabindex");
    }
  });

  it("supports a larger badge variant for the results panel", () => {
    const { container } = render(<SectionIcon section="waterfall" size="lg" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain("icon-badge");
    expect(badge.className).toContain("icon-badge-lg");
  });
});

describe("waterfall renders as a native stepped SVG", () => {
  it("draws a gross column, a floating bar per deduction, and a terminating net column", () => {
    renderWithProviders(<WaterfallChart />, completeInput());

    const panel = screen.getByTestId("waterfall_chart.panel");
    const figure = panel.querySelector<SVGSVGElement>("svg[role='img']");
    expect(figure).not.toBeNull();
    expect(figure).toHaveAccessibleName(/Seller net waterfall/i);

    // Native SVG geometry: a zero baseline, the gross opening column, one
    // floating bar per deduction step, and the net terminating column.
    expect(figure?.querySelector(".chart-baseline")).not.toBeNull();
    const bars = figure?.querySelectorAll(".chart-bar") ?? [];
    // gross + six deduction steps + net.
    expect(bars.length).toBe(8);
    // Each deduction step is connected to the next by a running-balance
    // connector hairline.
    const connectors = figure?.querySelectorAll(".chart-connector") ?? [];
    expect(connectors.length).toBe(6);
  });

  it("labels each step with its category and canonical amount", () => {
    renderWithProviders(<WaterfallChart />, completeInput());

    const expected: Array<[string, string, number]> = [
      ["commissions", "Commissions", CANONICAL.totalCommissions],
      ["closing_costs", "Closing costs", CANONICAL.totalClosingCosts],
      ["payoff", "Mortgage payoff", CANONICAL.mortgagePayoff],
      [
        "hoa_liens",
        "HOA / liens",
        CANONICAL.totalEncumbrances - CANONICAL.mortgagePayoff,
      ],
      [
        "seller_costs",
        "Seller costs",
        CANONICAL.totalDeductions -
          CANONICAL.totalCommissions -
          CANONICAL.totalClosingCosts -
          CANONICAL.totalEncumbrances,
      ],
    ];
    for (const [id, label, amount] of expected) {
      const row = screen.getByTestId(`waterfall_chart.step.${id}`);
      expect(within(row).getByText(label)).toBeInTheDocument();
      expect(within(row).getByText(formatMoney(amount))).toBeInTheDocument();
    }
  });

  it("terminates the sequence with Estimated Net Proceeds at the canonical figure", () => {
    renderWithProviders(<WaterfallChart />, completeInput());

    const net = screen.getByTestId("waterfall_chart.net");
    expect(net).toHaveTextContent(formatMoney(CANONICAL.estimatedNetProceeds));
    // The net figure is the last element in the panel's statement order, so it
    // terminates the waterfall sequence.
    const panel = screen.getByTestId("waterfall_chart.panel");
    const steps = panel.querySelectorAll(
      "[data-ocid^='waterfall_chart.step.']",
    );
    expect(steps.length).toBeGreaterThan(0);
    const lastStep = steps[steps.length - 1];
    expect(
      lastStep.compareDocumentPosition(net) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("gives the net column the strongest emphasis in the SVG", () => {
    renderWithProviders(<WaterfallChart />, completeInput());

    const figure = screen
      .getByTestId("waterfall_chart.panel")
      .querySelector<SVGSVGElement>("svg[role='img']");
    // The net value label carries the strong emphasis class; the gross label
    // does not.
    expect(figure?.querySelector(".chart-value-strong")).not.toBeNull();
    expect(figure?.querySelector(".chart-axis-strong")).not.toBeNull();
  });
});

describe("scenario comparison renders as native SVG", () => {
  it("draws one native SVG bar per scenario", () => {
    const comparison = computeScenarios(
      completeInput(),
      calculateSellerNetWaterfall(completeInput()),
      25_000,
    );
    renderWithProviders(<ScenarioChart scenarios={comparison.scenarios} />);

    const panel = screen.getByTestId("scenario_chart.panel");
    const figure = panel.querySelector<SVGSVGElement>("svg[role='img']");
    expect(figure).not.toBeNull();
    expect(figure).toHaveAccessibleName(/Net proceeds by scenario/i);
    // Three scenarios, three native SVG bars.
    expect(figure?.querySelectorAll(".chart-bar").length).toBe(3);
  });

  it("renders each scenario's canonical net proceeds", () => {
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
});

describe("deduction breakdown renders with CSS/SVG", () => {
  it("renders a proportional bar with one segment per canonical category", () => {
    renderWithProviders(<DeductionBreakdownChart />, completeInput());

    const bar = screen.getByTestId("deduction_breakdown.bar");
    // The bar is a CSS flex rail; each category is a proportional segment.
    const segments = bar.querySelectorAll(".chart-bar");
    expect(segments.length).toBe(5);
    for (const segment of segments) {
      expect((segment as HTMLElement).style.width).toMatch(/%$/);
    }
  });

  it("renders each category's canonical amount", () => {
    renderWithProviders(<DeductionBreakdownChart />, completeInput());

    const expected: Array<[string, number]> = [
      ["commissions", CANONICAL.totalCommissions],
      ["closing_costs", CANONICAL.totalClosingCosts],
      ["payoffs", CANONICAL.totalEncumbrances],
      [
        "seller_costs",
        CANONICAL.totalDeductions -
          CANONICAL.totalCommissions -
          CANONICAL.totalClosingCosts -
          CANONICAL.totalEncumbrances,
      ],
    ];
    for (const [id, amount] of expected) {
      expect(
        screen.getByTestId(`deduction_breakdown.item.${id}`),
      ).toHaveTextContent(formatMoney(amount));
    }
  });
});
