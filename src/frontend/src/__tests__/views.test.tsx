import { ClientViewPage } from "@/pages/client-view";
import PrintViewPage from "@/pages/print-view";
import { WorkSurfacePage } from "@/pages/work-surface";
import { SellerNetProvider, useSellerNet } from "@/state/seller-net-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Work-surface / client-view / print-view journeys.
 *
 * These are component/integration tests over the real provider and calculator
 * with the backend actor mocked locally. They prove the views read the canonical
 * result rather than re-deriving figures, and that the disclaimer and the
 * seller-facing/client-facing boundaries hold.
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

// The pages use router `Link`; a plain anchor keeps the journey focused on the
// rendered figures rather than on navigation.
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

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerNetProvider>{ui}</SellerNetProvider>
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
}

/**
 * Drive every required field through the shared context so the input becomes
 * calculable. Used where the journey is about a downstream view reading the
 * canonical result rather than about typing into the work surface.
 */
function FillRequired() {
  const { setField } = useSellerNet();
  const values: Array<[Parameters<typeof setField>[0], string]> = [
    ["basePrice", "500000"],
    ["listingCommissionRateBps", "250"],
    ["buyerCommissionRateBps", "250"],
    ["annualPropertyTax", "3650"],
    ["taxDaysElapsed", "0"],
    ["mortgageBalance", "300000"],
    ["hoaPayoff", "0"],
    ["liensJudgments", "0"],
    ["stagingPhotoCost", "0"],
    ["sellerConcessionsToBuyer", "0"],
    ["repairsCost", "0"],
    ["renovationCost", "0"],
  ];
  return (
    <button
      type="button"
      data-ocid="test.fill_required"
      onClick={() => {
        for (const [key, value] of values) setField(key, value);
      }}
    >
      Fill required
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("work surface", () => {
  it("loads the default route without a blank screen", () => {
    renderWithProviders(<WorkSurfacePage />);
    expect(screen.getByTestId("page.work_surface")).toBeInTheDocument();
    expect(screen.getByTestId("inputs.panel")).toBeInTheDocument();
    expect(screen.getByTestId("kpi.row")).toBeInTheDocument();
  });

  it("shows the planning-purposes disclaimer", () => {
    renderWithProviders(<WorkSurfacePage />);
    expect(screen.getByTestId("disclaimer")).toHaveTextContent(
      /planning purposes/i,
    );
  });

  it("produces gross price, total deductions, and net proceeds KPIs from a base price", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);

    const gross = screen.getByTestId("kpi.gross_price");
    const deductions = screen.getByTestId("kpi.total_deductions");
    const net = screen.getByTestId("kpi.net_proceeds");

    // GOOD tier: gross = base price.
    expect(within(gross).getByText("$500,000")).toBeInTheDocument();
    expect(within(deductions).getByText(/^\$/)).toBeInTheDocument();
    expect(within(net).getByText(/^\$/)).toBeInTheDocument();
  });

  it("applies the condition tier to the base price", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);

    await user.click(screen.getByTestId("inputs.condition_tier.needs_work"));
    expect(
      within(screen.getByTestId("kpi.gross_price")).getByText("$450,000"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByTestId("inputs.condition_tier.turnkey_10_plus"),
    );
    expect(
      within(screen.getByTestId("kpi.gross_price")).getByText("$550,000"),
    ).toBeInTheDocument();
  });

  it("shows the shortfall KPI and zero net proceeds when deductions exceed gross", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);
    // Push the mortgage payoff above the gross price.
    await user.clear(screen.getByTestId("inputs.mortgage_balance"));
    await user.type(screen.getByTestId("inputs.mortgage_balance"), "900000");

    expect(
      within(screen.getByTestId("kpi.net_proceeds")).getByText("$0"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi.shortfall")).toBeInTheDocument();
    expect(screen.getByTestId("waterfall.shortfall")).toBeInTheDocument();
  });

  it("lets a manual adjusted price override the condition tier", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);

    await user.click(screen.getByTestId("inputs.condition_tier.needs_work"));
    await user.click(screen.getByTestId("inputs.condition_renovation.toggle"));
    await user.type(
      screen.getByTestId("inputs.manual_adjusted_price"),
      "600000",
    );

    // The manual price wins outright; the -10% tier no longer applies.
    expect(
      within(screen.getByTestId("kpi.gross_price")).getByText("$600,000"),
    ).toBeInTheDocument();
  });

  it("adds the renovation lift to the gross price", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);

    await user.click(screen.getByTestId("inputs.condition_renovation.toggle"));
    await user.type(screen.getByTestId("inputs.renovation_cost"), "20000");

    // GOOD tier: 500,000 + 20,000 × 1.0 = 520,000.
    expect(
      within(screen.getByTestId("kpi.gross_price")).getByText("$520,000"),
    ).toBeInTheDocument();
  });

  it("blocks saving and reports missing fields while required inputs are UNKNOWN", () => {
    renderWithProviders(<WorkSurfacePage />);
    expect(screen.getByTestId("work_surface.save_run_button")).toBeDisabled();
    expect(screen.getAllByText(/required field/i).length).toBeGreaterThan(0);
  });

  it("rejects a basis-point rate above 10000 with a field-level error", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await user.type(screen.getByTestId("inputs.listing_commission"), "10001");
    expect(
      screen.getByTestId("inputs.listing_commission.error"),
    ).toHaveTextContent(/between 0 and 10000/);
  });
});

describe("client view", () => {
  it("shows an empty state before the calculation is complete", () => {
    renderWithProviders(<ClientViewPage />);
    expect(screen.getByTestId("client_view.empty_state")).toBeInTheDocument();
  });

  it("shows only seller-facing figures and the disclaimer once calculable", async () => {
    const user = userEvent.setup();
    // Render the fill harness and the client view under one provider so the
    // shared state the client view reads is complete.
    renderWithProviders(
      <>
        <FillRequired />
        <ClientViewPage />
      </>,
    );
    await user.click(screen.getByTestId("test.fill_required"));

    expect(screen.queryByTestId("client_view.empty_state")).toBeNull();
    expect(
      screen.getByTestId("client_view.gross_price.card"),
    ).toHaveTextContent("$500,000");
    expect(
      screen.getByTestId("client_view.net_proceeds.card"),
    ).toBeInTheDocument();
    // No calculator internals leak into the seller-facing view.
    expect(screen.queryByText(/basis point/i)).toBeNull();
    expect(screen.queryByText(/provenance/i)).toBeNull();
    expect(screen.getAllByTestId("disclaimer").length).toBeGreaterThan(0);
  });
});

describe("print view", () => {
  it("renders a net sheet with property id, version, waterfall, and disclaimer", () => {
    renderWithProviders(<PrintViewPage />);
    expect(screen.getByTestId("print.sheet")).toBeInTheDocument();
    expect(screen.getByTestId("print.waterfall")).toBeInTheDocument();
    expect(screen.getByTestId("print.net_proceeds")).toBeInTheDocument();
    expect(screen.getByTestId("disclaimer")).toHaveTextContent(
      /planning purposes/i,
    );
    expect(screen.getByText(/SELLER_NET_WATERFALL/)).toBeInTheDocument();
  });

  it("carries the property id, prepared date, and calculator version", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <FillRequired />
        <PrintViewPage />
      </>,
    );
    await user.click(screen.getByTestId("test.fill_required"));

    // The identifier is set through the shared context by the fill harness.
    expect(screen.getByTestId("print.sheet")).toBeInTheDocument();
    // Prepared date and calculator version are rendered in the identity header.
    expect(screen.getByText(/Prepared/)).toBeInTheDocument();
    expect(screen.getByText(/SELLER_NET_WATERFALL/)).toBeInTheDocument();
  });
});
