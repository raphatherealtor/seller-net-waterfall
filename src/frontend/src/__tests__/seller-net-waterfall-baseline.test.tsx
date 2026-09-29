import { Waterfall } from "@/components/work-surface/waterfall";
import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { SellerNetProvider, useSellerNet } from "@/state/seller-net-context";
import { cleanup, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Non-HECM waterfall rendering baseline.
 *
 * The HECM module will change which lines the waterfall shows and how the
 * encumbrance rows are composed when HECM is active. With HECM off — the only
 * state that exists today — the ledger must render exactly as it does now:
 * a mortgage-payoff row equal to the payoff, and an HOA/liens row equal to
 * `hoaPayoff + liensJudgments` (the component derives it as
 * `totalEncumbrances - mortgagePayoff`, so this also pins that derivation).
 *
 * These are component/integration tests over the real provider and calculator;
 * no backend actor is involved.
 */

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
    // Tax module untouched: every tax field UNKNOWN keeps it inactive.
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

/** Seeds the shared context with a complete input, then renders the waterfall. */
function WaterfallHarness({ input }: { input: SellerNetInput }) {
  const { loadInput } = useSellerNet();
  useEffect(() => {
    loadInput(input, "PID 4242");
  }, [input, loadInput]);
  return <Waterfall />;
}

function renderWaterfall(input: SellerNetInput) {
  return render(
    <SellerNetProvider>
      <WaterfallHarness input={input} />
    </SellerNetProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("non-HECM waterfall ledger", () => {
  it("renders the mortgage payoff row from the canonical payoff", () => {
    renderWaterfall(baseInput());
    const row = screen.getByTestId("waterfall.row.mortgage");
    expect(within(row).getByText("-$300,000.00")).toBeInTheDocument();
    expect(within(row).getByText("Principal balance")).toBeInTheDocument();
  });

  it("renders the HOA/liens row as hoaPayoff + liensJudgments", () => {
    renderWaterfall(
      baseInput({
        hoaPayoff: userProvided(1_200),
        liensJudgments: userProvided(4_500),
      }),
    );
    const row = screen.getByTestId("waterfall.row.hoa_liens");
    expect(within(row).getByText("-$5,700.00")).toBeInTheDocument();
  });

  it("shows the interest detail when ESTIMATE accrues interest", () => {
    renderWaterfall(
      baseInput({
        mortgagePayoffMode: "ESTIMATE",
        mortgageRateBps: userProvided(600),
        mortgageMonthsRemaining: userProvided(6),
      }),
    );
    const row = screen.getByTestId("waterfall.row.mortgage");
    expect(within(row).getByText("-$309,000.00")).toBeInTheDocument();
    expect(
      within(row).getByText(/Principal \+ \$9,000\.00 interest/),
    ).toBeInTheDocument();
  });

  it("renders the staging/repairs/concessions/renovation row from the residual", () => {
    renderWaterfall(
      baseInput({
        stagingPhotoCost: userProvided(1_500),
        sellerConcessionsToBuyer: userProvided(5_000),
        repairsCost: userProvided(2_500),
        renovationCost: userProvided(10_000),
      }),
    );
    const row = screen.getByTestId("waterfall.row.staging_repairs");
    expect(within(row).getByText("-$19,000.00")).toBeInTheDocument();
  });

  it("does not render a shortfall row when gross covers deductions", () => {
    renderWaterfall(baseInput());
    expect(screen.queryByTestId("waterfall.shortfall")).toBeNull();
    expect(screen.getByTestId("waterfall.ready_state")).toBeInTheDocument();
  });
});
