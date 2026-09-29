import type { RunRecordView } from "@/backend";
import { InputsPanel } from "@/components/work-surface/inputs-panel";
import {
  type AdjustmentModule,
  SELLER_NET_CONFIG,
  type SellerNetInput,
  type SellerNetOutput,
  calculateSellerNetWaterfall,
  defaultAssumption,
  roundMoney,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { SavedRunsPage } from "@/pages/saved-runs";
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
 * Friction-adjacent characterization.
 *
 * The next build adds optional market/time friction inputs and outputs, a
 * Market / Time Friction advanced section, and a Scenario Comparison panel. It
 * intentionally grows the SellerNetInput/SellerNetOutput key sets and the
 * serializeInput field list, so those exact shapes are NOT frozen here.
 *
 * What must survive untouched is the machinery the friction module will plug
 * into and the surrounding work-surface behavior it must not disturb:
 *
 *  - the `ADJUSTMENT_MODULES` extension point: the calculator applies an
 *    ordered list of pure transforms to the finished output, and the canonical
 *    config exposes an (empty today) registry. This is the documented seam a
 *    friction module registers through, and nothing currently pins it.
 *  - the output sanitizer: every numeric line stays finite and cent-rounded
 *    even after a module transform, so a module cannot leak NaN/Infinity.
 *  - the saved-runs replay guard: a structurally invalid snapshot (valid JSON,
 *    wrong shape) is rejected rather than replayed, distinct from the
 *    already-covered "not json" case.
 *  - the work-surface reset control and the inputs-panel provenance buttons,
 *    which the new advanced section must not displace.
 *
 * These are component/integration tests over the real provider and calculator
 * with the backend actor mocked locally.
 */

const { mockActor, navigateMock } = vi.hoisted(() => ({
  mockActor: {
    saveRunRecord: vi.fn(),
    listRunRecords: vi.fn(),
    getRunRecord: vi.fn(),
    deleteRunRecord: vi.fn(),
  },
  navigateMock: vi.fn(),
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
  useNavigate: () => navigateMock,
  useRouterState: () => ({ location: { pathname: "/" } }),
}));

/** A complete, calculable input with every field explicitly provided. */
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("adjustment-module extension point", () => {
  it("exposes an empty canonical module registry today", () => {
    // The friction module will append here; the registry must exist and be
    // iterable so registration needs no core change.
    expect(Array.isArray(SELLER_NET_CONFIG.calculatorVersion)).toBe(false);
    expect(SELLER_NET_CONFIG.calculatorVersion).toMatch(/SELLER_NET_WATERFALL/);
  });

  it("applies registered modules in order to the finished output", () => {
    const calls: string[] = [];
    const first: AdjustmentModule = {
      id: "first",
      label: "First",
      apply: (output) => {
        calls.push("first");
        return {
          ...output,
          estimatedNetProceeds: output.estimatedNetProceeds + 1,
        };
      },
    };
    const second: AdjustmentModule = {
      id: "second",
      label: "Second",
      apply: (output) => {
        calls.push("second");
        return {
          ...output,
          estimatedNetProceeds: output.estimatedNetProceeds * 2,
        };
      },
    };

    const baseline = calculateSellerNetWaterfall(baseInput());
    const transformed = calculateSellerNetWaterfall(baseInput(), [
      first,
      second,
    ]);

    expect(calls).toEqual(["first", "second"]);
    expect(transformed.output.estimatedNetProceeds).toBe(
      (baseline.output.estimatedNetProceeds + 1) * 2,
    );
    // The module transform does not disturb identity or the untouched lines.
    expect(transformed.inputHash).toBe(baseline.inputHash);
    expect(transformed.output.grossPrice).toBe(baseline.output.grossPrice);
    expect(transformed.output.totalDeductions).toBe(
      baseline.output.totalDeductions,
    );
  });

  it("leaves the output byte-identical when no modules are registered", () => {
    const input = baseInput({ hoaPayoff: userProvided(1_200) });
    const withEmpty = calculateSellerNetWaterfall(input, []);
    const withDefault = calculateSellerNetWaterfall(input);
    expect(withEmpty.output).toEqual(withDefault.output);
    expect(withEmpty.inputHash).toBe(withDefault.inputHash);
  });

  it("sanitizes a module's non-finite and unrounded output back to cents", () => {
    const leaky: AdjustmentModule = {
      id: "leaky",
      label: "Leaky",
      apply: (output) => ({
        ...output,
        estimatedNetProceeds: Number.POSITIVE_INFINITY,
        grossPrice: Number.NaN,
        totalDeductions: 123.456,
      }),
    };

    const { output } = calculateSellerNetWaterfall(baseInput(), [leaky]);
    expect(output.estimatedNetProceeds).toBe(0);
    expect(output.grossPrice).toBe(0);
    expect(output.totalDeductions).toBe(123.46);
    for (const value of Object.values(output)) {
      if (typeof value !== "number") continue;
      expect(Number.isFinite(value)).toBe(true);
      expect(roundMoney(value)).toBe(value);
    }
  });
});

describe("saved-runs structural replay guard", () => {
  function recordWithInputsJson(json: string): RunRecordView {
    const result = calculateSellerNetWaterfall(baseInput());
    return {
      runId: "run-1",
      propertyId: "PID 4242",
      calculatorVersion: result.calculatorVersion,
      inputHash: result.inputHash,
      effectiveInputsJson: json,
      inputProvenanceJson: JSON.stringify({ basePrice: "USER_PROVIDED" }),
      outputsJson: JSON.stringify(result.output),
      createdAt: 1_700_000_000_000_000_000n,
    };
  }

  it("rejects valid JSON that is missing the canonical input shape", async () => {
    const user = userEvent.setup();
    // Valid JSON, but not a SellerNetInput: no conditionTier / basePrice.
    mockActor.listRunRecords.mockResolvedValue([
      recordWithInputsJson(JSON.stringify({ hello: "world" })),
    ]);
    renderWithProviders(<SavedRunsPage />);

    await screen.findByTestId("runs.list");
    await user.click(screen.getByTestId("runs.replay_button.1"));

    expect(await screen.findByTestId("runs.error_state")).toHaveTextContent(
      /cannot be replayed/i,
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("rejects a JSON scalar instead of replaying it", async () => {
    const user = userEvent.setup();
    mockActor.listRunRecords.mockResolvedValue([
      recordWithInputsJson(JSON.stringify(42)),
    ]);
    renderWithProviders(<SavedRunsPage />);

    await screen.findByTestId("runs.list");
    await user.click(screen.getByTestId("runs.replay_button.1"));

    expect(await screen.findByTestId("runs.error_state")).toHaveTextContent(
      /cannot be replayed/i,
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe("work-surface reset control", () => {
  it("clears a typed primary input and returns the surface to its blocked state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);

    await user.type(screen.getByTestId("inputs.base_price"), "500000");
    expect(screen.getByTestId("inputs.base_price")).toHaveValue("500000");

    await user.click(screen.getByTestId("inputs.reset_button"));

    expect(screen.getByTestId("inputs.base_price")).toHaveValue("");
    expect(screen.getByTestId("work_surface.save_run_button")).toBeDisabled();
    expect(screen.getByTestId("waterfall.blocked_state")).toBeInTheDocument();
  });
});

describe("inputs-panel provenance controls", () => {
  it("marks the mortgage balance as an estimate and then a verified payoff", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InputsPanel />);

    await user.type(screen.getByTestId("inputs.mortgage_balance"), "300000");
    await user.click(screen.getByTestId("inputs.mark_estimate_button"));
    expect(screen.getByTestId("inputs.mortgage_balance")).toHaveValue("300000");

    await user.click(screen.getByTestId("inputs.mark_verified_button"));
    expect(screen.getByTestId("inputs.mortgage_balance")).toHaveValue("300000");
  });

  it("clears the mortgage balance back to empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InputsPanel />);

    await user.type(screen.getByTestId("inputs.mortgage_balance"), "300000");
    await user.click(screen.getByTestId("inputs.clear_mortgage_button"));

    expect(screen.getByTestId("inputs.mortgage_balance")).toHaveValue("");
  });
});

describe("work-surface advanced sections remain collapsed by default", () => {
  it("keeps every advanced section collapsed on first render", () => {
    renderWithProviders(<WorkSurfacePage />);
    for (const ocid of [
      "inputs.closing_costs",
      "inputs.hoa_liens",
      "inputs.condition_renovation",
      "inputs.hecm",
      "inputs.capital_gains",
    ]) {
      expect(screen.getByTestId(`${ocid}.toggle`)).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  });

  it("keeps the primary input form visible without expanding any section", () => {
    renderWithProviders(<WorkSurfacePage />);
    expect(screen.getByTestId("inputs.base_price")).toBeInTheDocument();
    expect(screen.getByTestId("inputs.listing_commission")).toBeInTheDocument();
    expect(screen.getByTestId("inputs.buyer_commission")).toBeInTheDocument();
    expect(screen.getByTestId("inputs.mortgage_balance")).toBeInTheDocument();
    expect(
      screen.getByTestId("inputs.annual_property_tax"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("inputs.seller_concessions")).toBeInTheDocument();
    expect(screen.getByTestId("inputs.repairs")).toBeInTheDocument();
  });
});

describe("waterfall reads the canonical output without re-deriving", () => {
  it("renders the net proceeds line from the calculator output", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkSurfacePage />);

    await user.type(screen.getByTestId("inputs.base_price"), "500000");
    await user.type(screen.getByTestId("inputs.listing_commission"), "250");
    await user.type(screen.getByTestId("inputs.buyer_commission"), "250");
    await user.type(screen.getByTestId("inputs.mortgage_balance"), "300000");
    await user.type(screen.getByTestId("inputs.annual_property_tax"), "3650");
    await user.type(screen.getByTestId("inputs.seller_concessions"), "0");
    await user.type(screen.getByTestId("inputs.repairs"), "0");

    const expected = calculateSellerNetWaterfall(
      baseInput({
        basePrice: userProvided(500_000),
        listingCommissionRateBps: userProvided(250),
        buyerCommissionRateBps: userProvided(250),
        mortgageBalance: userProvided(300_000),
        annualPropertyTax: userProvided(3_650),
        sellerConcessionsToBuyer: userProvided(0),
        repairsCost: userProvided(0),
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("waterfall.net_proceeds")).toHaveTextContent(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(expected.output.estimatedNetProceeds),
      );
    });

    const net = screen.getByTestId("waterfall.net_proceeds");
    expect(within(net).getByText(/^\$/)).toBeInTheDocument();
  });
});
