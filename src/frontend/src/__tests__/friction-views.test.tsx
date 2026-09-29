import { WorkSurfacePage } from "@/pages/work-surface";
import { SellerNetProvider } from "@/state/seller-net-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Market / Time Friction view journeys.
 *
 * These are component/integration tests over the real provider and canonical
 * calculator with the backend actor mocked locally. They pin the accepted
 * user-visible contract:
 *
 *  - the friction section is an advanced disclosure, collapsed by default;
 *  - the supplemental result rows appear only while the module is active;
 *  - the primary Estimated Net Proceeds is never replaced by the friction net;
 *  - a partial friction entry blocks calculation and reports the missing field;
 *  - an out-of-range discount surfaces a field-level error.
 *
 * They do NOT exercise a deployed browser or a real backend.
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

/** Fill the primary inputs so the sheet is calculable. */
async function fillPrimaryInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("inputs.base_price"), "500000");
  await user.type(screen.getByTestId("inputs.listing_commission"), "250");
  await user.type(screen.getByTestId("inputs.buyer_commission"), "250");
  await user.type(screen.getByTestId("inputs.mortgage_balance"), "300000");
  await user.type(screen.getByTestId("inputs.annual_property_tax"), "6000");
  await user.type(screen.getByTestId("inputs.seller_concessions"), "0");
  await user.type(screen.getByTestId("inputs.repairs"), "0");
  // Tax days elapsed lives in the advanced closing-costs group and is required.
  await user.click(screen.getByTestId("inputs.closing_costs.toggle"));
  await user.type(screen.getByTestId("inputs.tax_days"), "0");
}

async function openFrictionSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("inputs.market_friction.toggle"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("friction section disclosure", () => {
  it("is collapsed by default and expands on toggle", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);

    const toggle = screen.getByTestId("inputs.market_friction.toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByTestId("inputs.monthly_carrying_cost"),
    ).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByTestId("inputs.monthly_carrying_cost"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("inputs.expected_dom")).toBeInTheDocument();
    expect(screen.getByTestId("inputs.expected_discount")).toBeInTheDocument();
  });

  it("shows no supplemental result rows while the module is inactive", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);
    await openFrictionSection(user);

    expect(screen.queryByTestId("friction.results")).not.toBeInTheDocument();
  });
});

describe("friction activation and supplemental results", () => {
  it("shows the supplemental rows once a friction value is entered", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);
    await openFrictionSection(user);

    await user.type(screen.getByTestId("inputs.monthly_carrying_cost"), "3000");
    await user.type(screen.getByTestId("inputs.expected_dom"), "60");
    await user.type(screen.getByTestId("inputs.expected_discount"), "0.05");

    const results = await screen.findByTestId("friction.results");
    expect(within(results).getByText("Carrying loss")).toBeInTheDocument();
    expect(
      within(results).getByText("Stale discount loss"),
    ).toBeInTheDocument();
    expect(
      within(results).getByText("Net after market / time friction"),
    ).toBeInTheDocument();
    // carryingLoss 6000, staleDiscountLoss 25000.
    expect(within(results).getByText("$6,000.00")).toBeInTheDocument();
    expect(within(results).getByText("$25,000.00")).toBeInTheDocument();
  });

  it("never replaces the primary Estimated Net Proceeds with the friction net", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);
    await openFrictionSection(user);

    await user.type(screen.getByTestId("inputs.monthly_carrying_cost"), "3000");
    await user.type(screen.getByTestId("inputs.expected_dom"), "60");
    await user.type(screen.getByTestId("inputs.expected_discount"), "0.05");

    await screen.findByTestId("friction.results");
    // Primary net proceeds is 169,650; friction net is 138,650. The waterfall
    // still shows the primary figure.
    expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
      "$169,650.00",
    );
    const results = screen.getByTestId("friction.results");
    expect(within(results).getByText("$138,650.00")).toBeInTheDocument();
  });

  it("treats an explicit 0 as activation and shows zero friction losses", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);
    await openFrictionSection(user);

    await user.type(screen.getByTestId("inputs.monthly_carrying_cost"), "0");
    await user.type(screen.getByTestId("inputs.expected_dom"), "0");
    await user.type(screen.getByTestId("inputs.expected_discount"), "0");

    const results = await screen.findByTestId("friction.results");
    // Carrying loss and stale discount loss are both zero; the net is unchanged.
    expect(within(results).getAllByText("$0.00")).toHaveLength(2);
    expect(within(results).getByText("$169,650.00")).toBeInTheDocument();
    // The primary net is unchanged by zero friction.
    expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
      "$169,650.00",
    );
  });
});

describe("friction validation in the view", () => {
  it("blocks calculation and reports the missing fields on a partial entry", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);
    await openFrictionSection(user);

    // Touch only the carrying cost: the other two become required.
    await user.type(screen.getByTestId("inputs.monthly_carrying_cost"), "3000");

    await waitFor(() => {
      expect(screen.getByTestId("waterfall.blocked_state")).toBeInTheDocument();
    });
    // The two untouched friction fields are reported as required.
    expect(screen.getByTestId("inputs.expected_dom")).toHaveAttribute(
      "aria-describedby",
    );
    expect(
      screen.getByText(/Required — enter the expected days/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Required — enter the expected discount/i),
    ).toBeInTheDocument();
  });

  it("surfaces a field-level error for a discount above 1", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);
    await fillPrimaryInputs(user);
    await openFrictionSection(user);

    await user.type(screen.getByTestId("inputs.monthly_carrying_cost"), "3000");
    await user.type(screen.getByTestId("inputs.expected_dom"), "60");
    await user.type(screen.getByTestId("inputs.expected_discount"), "1.5");

    const error = await screen.findByTestId("inputs.expected_discount.error");
    expect(error).toHaveTextContent(/between 0 and 1/);
    expect(screen.getByTestId("inputs.expected_discount")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
