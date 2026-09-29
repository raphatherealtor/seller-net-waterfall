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
import { type ReactElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Seller Net Waterfall presentation-refinement cover.
 *
 * The accepted change is PRESENTATION ONLY: a two-panel desktop layout with a
 * sticky results column, compact header/property row, dense two-column primary
 * inputs, softened outlined provenance chips, compact segmented controls, six
 * collapsed-by-default advanced accordions, a results panel anchored on
 * Estimated Net Proceeds, a financial-statement waterfall with right-aligned
 * values, and three compact scenario cards. Print and client views keep their
 * existing calculations and content.
 *
 * These tests assert the OBSERVABLE acceptance criteria the characterization
 * baseline did not already pin:
 *
 *  - all six advanced sections start collapsed and expand independently;
 *  - the UNKNOWN provenance chip is a non-interactive status indicator, not an
 *    action button;
 *  - Estimated Net Proceeds is the hero anchor of the results panel, with
 *    gross price / total deductions as supporting readouts;
 *  - the waterfall reads gross price, deduction rows, then net proceeds, with
 *    right-aligned tabular values;
 *  - the print and client views still render the canonical figures.
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

/** The six advanced input groups, in the order the panel renders them. */
const ADVANCED_SECTIONS = [
  "inputs.closing_costs",
  "inputs.hoa_liens",
  "inputs.condition_renovation",
  "inputs.hecm",
  "inputs.capital_gains",
  "inputs.market_friction",
] as const;

/** A field revealed only while its owning advanced section is expanded. */
const SECTION_FIELD: Record<(typeof ADVANCED_SECTIONS)[number], string> = {
  "inputs.closing_costs": "inputs.escrow_rate",
  "inputs.hoa_liens": "inputs.hoa_payoff",
  "inputs.condition_renovation": "inputs.manual_adjusted_price",
  "inputs.hecm": "inputs.hecm.switch",
  "inputs.capital_gains": "inputs.original_purchase_price",
  "inputs.market_friction": "inputs.monthly_carrying_cost",
};

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

describe("advanced sections collapsed by default", () => {
  it("starts all six advanced sections collapsed with their fields hidden", () => {
    renderWithProviders(<WorkSurfacePage />);

    for (const section of ADVANCED_SECTIONS) {
      expect(screen.getByTestId(`${section}.toggle`)).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.queryByTestId(SECTION_FIELD[section])).toBeNull();
    }
  });

  it("expands each section independently on toggle", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);

    for (const section of ADVANCED_SECTIONS) {
      await user.click(screen.getByTestId(`${section}.toggle`));
      expect(screen.getByTestId(`${section}.toggle`)).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByTestId(SECTION_FIELD[section])).toBeInTheDocument();
      // Opening one section never expands another.
      for (const other of ADVANCED_SECTIONS) {
        if (other === section) continue;
        expect(screen.getByTestId(`${other}.toggle`)).toHaveAttribute(
          "aria-expanded",
          "false",
        );
      }
      await user.click(screen.getByTestId(`${section}.toggle`));
      expect(screen.getByTestId(`${section}.toggle`)).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  });
});

describe("provenance chip is a status indicator, not an action", () => {
  it("renders the UNKNOWN chip as a non-interactive span", () => {
    renderWithProviders(<WorkSurfacePage />);

    // Every untouched field carries an UNKNOWN chip; each is a status
    // indicator, never a button or link.
    const badges = screen.getAllByTestId("provenance.badge.unknown");
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.tagName).toBe("SPAN");
      expect(badge).not.toHaveAttribute("role", "button");
      expect(badge).not.toHaveAttribute("tabindex");
      expect(badge.closest("button")).toBeNull();
      expect(badge.closest("a")).toBeNull();
    }
  });

  it("keeps the chip non-interactive across every provenance state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);

    await user.type(screen.getByTestId("inputs.mortgage_balance"), "300000");
    const userProvided = screen.getByTestId("provenance.badge.user_provided");
    expect(userProvided.tagName).toBe("SPAN");
    expect(userProvided.closest("button")).toBeNull();

    await user.click(screen.getByTestId("inputs.mark_estimate_button"));
    const estimate = screen.getByTestId("provenance.badge.estimate");
    expect(estimate.tagName).toBe("SPAN");
    expect(estimate.closest("button")).toBeNull();

    await user.click(screen.getByTestId("inputs.mark_verified_button"));
    const verified = screen.getByTestId("provenance.badge.verified_payoff");
    expect(verified.tagName).toBe("SPAN");
    expect(verified.closest("button")).toBeNull();
  });
});

describe("results panel hierarchy", () => {
  it("anchors the results panel on Estimated Net Proceeds above the supporting readouts", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const netAnchor = screen.getByTestId("kpi.net_proceeds");
    const gross = screen.getByTestId("kpi.gross_price");
    const deductions = screen.getByTestId("kpi.total_deductions");

    // The hero figure leads the results panel in document order.
    expect(
      netAnchor.compareDocumentPosition(gross) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      netAnchor.compareDocumentPosition(deductions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Gross price and total deductions are supporting readouts nested in the
    // KPI grid, while the net-proceeds anchor is the hero block above it.
    const kpiGrid = gross.parentElement;
    expect(kpiGrid).toBe(deductions.parentElement);
    expect(kpiGrid?.contains(netAnchor)).toBe(false);
    expect(netAnchor).toHaveTextContent(/Estimated net proceeds/i);
  });

  it("renders the net-proceeds anchor figure larger than the supporting readouts", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const anchorFigure = within(
      screen.getByTestId("kpi.net_proceeds"),
    ).getByText("$169,650");
    const grossFigure = within(screen.getByTestId("kpi.gross_price")).getByText(
      "$500,000",
    );

    const anchorSize = Number.parseFloat(
      getComputedStyle(anchorFigure).fontSize || "0",
    );
    const grossSize = Number.parseFloat(
      getComputedStyle(grossFigure).fontSize || "0",
    );
    // jsdom does not apply Tailwind, so fall back to the class contract when
    // computed sizes are unavailable.
    if (anchorSize > 0 && grossSize > 0) {
      expect(anchorSize).toBeGreaterThan(grossSize);
    } else {
      expect(anchorFigure.className).toContain("text-3xl");
      expect(grossFigure.className).toContain("text-lg");
    }
  });
});

describe("waterfall statement order and alignment", () => {
  it("reads gross price, deduction rows, then net proceeds", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const waterfall = screen.getByTestId("waterfall.section");
    const gross = within(waterfall).getByText("Gross sale price");
    const list = screen.getByTestId("waterfall.list");
    const net = screen.getByTestId("waterfall.net_proceeds");

    // Gross price precedes the deduction list, which precedes net proceeds.
    expect(
      gross.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      list.compareDocumentPosition(net) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The canonical deduction rows are present in the ledger.
    for (const row of [
      "waterfall.row.commissions",
      "waterfall.row.closing_costs",
      "waterfall.row.mortgage",
      "waterfall.row.hoa_liens",
      "waterfall.row.staging_repairs",
    ]) {
      expect(screen.getByTestId(row)).toBeInTheDocument();
    }
  });

  it("right-aligns the waterfall values with tabular numerals", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const net = screen.getByTestId("waterfall.net_proceeds");
    expect(net.className).toContain("tabular-nums");

    // Each deduction row's amount is the trailing, right-aligned value cell.
    const row = screen.getByTestId("waterfall.row.mortgage");
    const amount = within(row).getByText("-$300,000.00");
    expect(amount.className).toContain("tabular-nums");
    expect(amount.className).toContain("shrink-0");
    expect(amount).toBe(row.lastElementChild);
  });
});

describe("print and client views keep their calculations", () => {
  it("renders the canonical figures on the print net sheet", () => {
    renderWithProviders(<PrintViewPage />, completeInput());

    expect(screen.getByTestId("print.sheet")).toBeInTheDocument();
    expect(screen.getByTestId("print.waterfall")).toBeInTheDocument();
    expect(screen.getByTestId("print.net_proceeds")).toHaveTextContent(
      "$169,650",
    );
    expect(screen.getByTestId("print.assumptions")).toBeInTheDocument();
    expect(screen.getByTestId("disclaimer")).toHaveTextContent(
      /planning purposes/i,
    );
  });

  it("renders the canonical figures on the client view", () => {
    renderWithProviders(<ClientViewPage />, completeInput());

    expect(screen.queryByTestId("client_view.empty_state")).toBeNull();
    expect(
      screen.getByTestId("client_view.gross_price.card"),
    ).toHaveTextContent("$500,000");
    expect(
      screen.getByTestId("client_view.net_proceeds.card"),
    ).toHaveTextContent("$169,650");
    expect(
      screen.getByTestId("client_view.waterfall.section"),
    ).toBeInTheDocument();
    // No calculator internals leak into the seller-facing view.
    expect(screen.queryByText(/basis point/i)).toBeNull();
    expect(screen.queryByText(/provenance/i)).toBeNull();
  });
});
