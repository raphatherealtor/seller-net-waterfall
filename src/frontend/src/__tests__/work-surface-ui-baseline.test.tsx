import { InputsPanel } from "@/components/work-surface/inputs-panel";
import {
  CONDITION_TIER_LABELS,
  PROVENANCE_LABELS,
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
 * Work-surface UI refinement characterization.
 *
 * The upcoming change is PRESENTATION ONLY: two-panel desktop layout, compact
 * header and property row, denser inputs, softened provenance chips, compact
 * segmented controls, compact advanced accordions, a results panel anchored on
 * Estimated Net Proceeds, and compact scenario cards. No calculator output,
 * validation result, provenance state, scenario figure, or snapshot value may
 * change.
 *
 * These tests freeze the OBSERVABLE behavior the refinement must not disturb,
 * deliberately avoiding incidental DOM structure and CSS class names that the
 * refinement is expected to change. They pin:
 *
 *  - the provenance chip's visible label and title per state, and that it
 *    tracks typing, marking, and clearing;
 *  - the segmented controls' `aria-pressed` selection contract for condition
 *    tier, mortgage payoff mode, and Section 121 status;
 *  - the advanced accordion disclosure contract (aria-expanded + content);
 *  - the two-panel composition order and the results panel anchored on
 *    Estimated Net Proceeds;
 *  - the compact scenario cards still carrying their per-scenario figures.
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

/** Fill the primary required fields so the input becomes calculable. */
async function fillPrimaryInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("inputs.base_price"), "500000");
  await user.type(screen.getByTestId("inputs.listing_commission"), "250");
  await user.type(screen.getByTestId("inputs.buyer_commission"), "250");
  await user.type(screen.getByTestId("inputs.mortgage_balance"), "300000");
  await user.type(screen.getByTestId("inputs.annual_property_tax"), "3650");
  await user.type(screen.getByTestId("inputs.seller_concessions"), "0");
  await user.type(screen.getByTestId("inputs.repairs"), "0");
  // Tax days elapsed lives in the advanced closing-costs group and is required.
  await user.click(screen.getByTestId("inputs.closing_costs.toggle"));
  await user.type(screen.getByTestId("inputs.tax_days"), "0");
}

/**
 * The provenance chip rendered for a specific field. The chip is a sibling of
 * the field's input inside the same field group; walk up from the input to the
 * nearest ancestor that contains a provenance badge, without depending on the
 * refinement's class names.
 */
function badgeForField(fieldTestId: string): HTMLElement {
  let node: HTMLElement | null = screen.getByTestId(fieldTestId);
  while (node) {
    const badge = node.querySelector<HTMLElement>(
      '[data-ocid^="provenance.badge."]',
    );
    if (badge) return badge;
    node = node.parentElement;
  }
  throw new Error(`No provenance badge found for ${fieldTestId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("provenance chip observable state", () => {
  it("renders the UNKNOWN chip label and title on an untouched field", () => {
    renderWithProviders(<InputsPanel />);
    const badge = badgeForField("inputs.base_price");
    expect(badge).toHaveTextContent(PROVENANCE_LABELS.UNKNOWN);
    expect(badge).toHaveAttribute("title", PROVENANCE_LABELS.UNKNOWN);
  });

  it("moves the chip to USER_PROVIDED when the field is typed into", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InputsPanel />);

    await user.type(screen.getByTestId("inputs.base_price"), "500000");

    const badge = badgeForField("inputs.base_price");
    expect(badge).toHaveTextContent(PROVENANCE_LABELS.USER_PROVIDED);
    expect(badge).toHaveAttribute("title", PROVENANCE_LABELS.USER_PROVIDED);
  });

  it("moves the chip to ESTIMATE then VERIFIED_PAYOFF via the field actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InputsPanel />);

    await user.type(screen.getByTestId("inputs.mortgage_balance"), "300000");
    await user.click(screen.getByTestId("inputs.mark_estimate_button"));
    expect(badgeForField("inputs.mortgage_balance")).toHaveTextContent(
      PROVENANCE_LABELS.ESTIMATE,
    );

    await user.click(screen.getByTestId("inputs.mark_verified_button"));
    expect(badgeForField("inputs.mortgage_balance")).toHaveTextContent(
      PROVENANCE_LABELS.VERIFIED_PAYOFF,
    );
  });

  it("returns the chip to UNKNOWN when the field is cleared", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InputsPanel />);

    await user.type(screen.getByTestId("inputs.mortgage_balance"), "300000");
    expect(badgeForField("inputs.mortgage_balance")).toHaveTextContent(
      PROVENANCE_LABELS.USER_PROVIDED,
    );

    await user.click(screen.getByTestId("inputs.clear_mortgage_button"));
    expect(badgeForField("inputs.mortgage_balance")).toHaveTextContent(
      PROVENANCE_LABELS.UNKNOWN,
    );
  });
});

describe("segmented control selection contract", () => {
  it("reflects the selected condition tier with aria-pressed and retargets the price", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());

    // GOOD is the seeded tier.
    expect(screen.getByTestId("inputs.condition_tier.good")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByTestId("inputs.condition_tier.needs_work"),
    ).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByTestId("inputs.condition_tier.needs_work"));
    expect(
      screen.getByTestId("inputs.condition_tier.needs_work"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("inputs.condition_tier.good")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // -10% tier: 500,000 → 450,000.
    expect(
      within(screen.getByTestId("kpi.gross_price")).getByText("$450,000"),
    ).toBeInTheDocument();
  });

  it("reflects the selected mortgage payoff mode with aria-pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());
    await user.click(screen.getByTestId("inputs.condition_renovation.toggle"));

    expect(
      screen.getByTestId("inputs.payoff_mode.verified_payoff"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("inputs.payoff_mode.estimate")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByTestId("inputs.payoff_mode.estimate"));
    expect(screen.getByTestId("inputs.payoff_mode.estimate")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByTestId("inputs.payoff_mode.verified_payoff"),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects the selected Section 121 status with aria-pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />, completeInput());
    await user.click(screen.getByTestId("inputs.capital_gains.toggle"));

    expect(screen.getByTestId("inputs.section_121.unknown")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByTestId("inputs.section_121.married"));
    expect(screen.getByTestId("inputs.section_121.married")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("inputs.section_121.unknown")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("advanced accordion disclosure contract", () => {
  it("opens and closes a section, revealing and hiding its fields", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);

    const toggle = screen.getByTestId("inputs.closing_costs.toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("inputs.escrow_rate")).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("inputs.escrow_rate")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("inputs.escrow_rate")).toBeNull();
  });

  it("keeps each advanced section's disclosure independent", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);

    await user.click(screen.getByTestId("inputs.hoa_liens.toggle"));
    expect(screen.getByTestId("inputs.hoa_liens.toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Opening one section does not expand the others.
    expect(screen.getByTestId("inputs.closing_costs.toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByTestId("inputs.hecm.toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

describe("two-panel composition and results anchor", () => {
  it("renders the inputs panel before the results panel in document order", () => {
    renderWithProviders(<WorkSurfacePage />);

    const inputs = screen.getByTestId("inputs.panel");
    const kpi = screen.getByTestId("kpi.row");
    expect(
      inputs.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("anchors the results panel on Estimated Net Proceeds", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);

    // The KPI row leads with the net-proceeds card and the waterfall resolves
    // to the same canonical figure.
    const netCard = screen.getByTestId("kpi.net_proceeds");
    expect(netCard).toHaveTextContent(/Estimated net proceeds/i);
    expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
      "$169,650.00",
    );
    expect(within(netCard).getByText("$169,650")).toBeInTheDocument();
  });

  it("keeps the waterfall, scenario panel, and disclaimer in the results column", async () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const waterfall = await screen.findByTestId("waterfall.section");
    const scenario = screen.getByTestId("scenario.section");
    const disclaimer = screen.getByTestId("disclaimer");

    // Results column order: waterfall, then scenario comparison, then disclaimer.
    expect(
      waterfall.compareDocumentPosition(scenario) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      scenario.compareDocumentPosition(disclaimer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("compact scenario cards retain their figures", () => {
  it("renders each scenario card's figure list and net proceeds", async () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const current = await screen.findByTestId("scenario.column.current");
    // The per-scenario figure rows survive the compact-card refinement.
    expect(within(current).getByText("Commissions")).toBeInTheDocument();
    expect(within(current).getByText("Closing costs")).toBeInTheDocument();
    expect(
      within(current).getByText("Mortgage / HECM payoff"),
    ).toBeInTheDocument();
    expect(within(current).getByText("HOA / liens")).toBeInTheDocument();
    expect(within(current).getByText("Seller costs")).toBeInTheDocument();
    expect(
      within(current).getByTestId("scenario.net_proceeds"),
    ).toHaveTextContent("$169,650.00");
  });

  it("keeps the Downside and Upside cards populated with figures", async () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    const downside = await screen.findByTestId("scenario.column.downside");
    const upside = screen.getByTestId("scenario.column.upside");
    expect(
      within(downside).getByTestId("scenario.net_proceeds"),
    ).toBeInTheDocument();
    expect(
      within(upside).getByTestId("scenario.net_proceeds"),
    ).toBeInTheDocument();
    // The default spread is ±25,000 around the 500,000 base.
    expect(within(downside).getByText("$475,000.00")).toBeInTheDocument();
    expect(within(upside).getByText("$525,000.00")).toBeInTheDocument();
  });
});

describe("compact header and property row", () => {
  it("keeps the property identifier, calculator version, and save control", () => {
    renderWithProviders(<WorkSurfacePage />, completeInput());

    // The calculator version is rendered in the header (and again in the
    // waterfall header), so assert at least one occurrence.
    expect(screen.getAllByText(/SELLER_NET_WATERFALL/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByTestId("work_surface.save_run_button")).toBeEnabled();
    // The property identifier input remains the labeling control.
    expect(screen.getByTestId("inputs.property_id")).toBeInTheDocument();
  });

  it("reports the missing-field count in the header while inputs are UNKNOWN", () => {
    renderWithProviders(<WorkSurfacePage />);
    // The header and the waterfall blocked state both report the count.
    expect(screen.getAllByText(/required field/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("work_surface.save_run_button")).toBeDisabled();
  });
});

describe("condition tier labels remain the canonical config labels", () => {
  it("renders every tier with its shared label", () => {
    renderWithProviders(<WorkSurfacePage />);
    for (const tier of ["NEEDS_WORK", "GOOD", "TURNKEY_10_PLUS"] as const) {
      expect(
        screen.getByTestId(`inputs.condition_tier.${tier.toLowerCase()}`),
      ).toHaveTextContent(CONDITION_TIER_LABELS[tier]);
    }
  });
});

describe("no console errors during the refined work surface", () => {
  it("renders the calculable surface without console errors or warnings", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderWithProviders(<WorkSurfacePage />, completeInput());

    await waitFor(() => {
      expect(screen.getByTestId("waterfall.ready_state")).toBeInTheDocument();
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
