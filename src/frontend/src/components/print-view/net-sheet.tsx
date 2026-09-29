import { Disclaimer } from "@/components/ui/disclaimer";
import { SectionIcon } from "@/components/ui/section-icon";
import {
  formatBps,
  formatDate,
  formatDeduction,
  formatMoney,
  formatMoneyWhole,
  formatPropertyId,
} from "@/lib/format";
import {
  CONDITION_TIER_LABELS,
  PROVENANCE_LABELS,
  type ProvenancedNumber,
  SECTION_121_EXEMPTIONS,
  SELLER_NET_CONFIG,
  type Section121Status,
  type SellerNetInput,
  type SellerNetOutput,
  type SellerNetResult,
} from "@/lib/seller-net";
import { cn } from "@/lib/utils";

/**
 * The printable net sheet.
 *
 * Every figure is read from the canonical `result` — this component performs no
 * arithmetic of its own. It renders a single letter-portrait page: identity
 * header, assumptions ledger, the full waterfall, the net / shortfall outcome,
 * and the planning-purposes disclaimer.
 */

interface NetSheetProps {
  propertyId: string;
  input: SellerNetInput;
  result: SellerNetResult;
  /** True when every required field carries a valid value. */
  calculable: boolean;
  /** ISO timestamp captured when the sheet was opened. */
  generatedAt: Date;
}

/** One line of the assumptions ledger. */
interface AssumptionRow {
  key: string;
  label: string;
  value: string;
  provenance: string;
}

/** Human labels for the Section 121 statuses on the printed sheet. */
const SECTION_121_LABELS: Record<Section121Status, string> = {
  UNKNOWN: "Not provided",
  NONE: "None",
  SINGLE: "Single",
  MARRIED: "Married",
};

/** One line of the waterfall. */
interface WaterfallRow {
  key: string;
  label: string;
  /** Signed deduction, or the gross / net figure. */
  amount: string;
  /** `total` rows carry a heavier rule and weight. */
  emphasis?: "total" | "subtotal";
  /** Indented detail line under a group total. */
  detail?: boolean;
}

function assumption(
  key: string,
  label: string,
  field: ProvenancedNumber,
  render: (value: number) => string,
): AssumptionRow {
  const known = field.value !== null && field.provenance !== "UNKNOWN";
  return {
    key,
    label,
    value: known ? render(field.value as number) : "Not provided",
    provenance: PROVENANCE_LABELS[field.provenance],
  };
}

function buildAssumptions(input: SellerNetInput): AssumptionRow[] {
  const rows: AssumptionRow[] = [
    assumption("basePrice", "Base list price", input.basePrice, formatMoney),
    assumption(
      "manualAdjustedPrice",
      "Manual adjusted price",
      input.manualAdjustedPrice,
      formatMoney,
    ),
    {
      key: "conditionTier",
      label: "Condition tier",
      value: CONDITION_TIER_LABELS[input.conditionTier],
      provenance: "User provided",
    },
    assumption(
      "listingCommissionRateBps",
      "Listing commission",
      input.listingCommissionRateBps,
      formatBps,
    ),
    assumption(
      "buyerCommissionRateBps",
      "Buyer commission",
      input.buyerCommissionRateBps,
      formatBps,
    ),
    assumption(
      "escrowRateBps",
      "Escrow fee rate",
      input.escrowRateBps,
      formatBps,
    ),
    assumption("titleRateBps", "Title fee rate", input.titleRateBps, formatBps),
    assumption(
      "transferTaxRateBps",
      "Transfer tax rate",
      input.transferTaxRateBps,
      formatBps,
    ),
    assumption(
      "recordingFees",
      "Recording fees",
      input.recordingFees,
      formatMoney,
    ),
    assumption(
      "homeWarranty",
      "Home warranty",
      input.homeWarranty,
      formatMoney,
    ),
    assumption(
      "annualPropertyTax",
      "Annual property tax",
      input.annualPropertyTax,
      formatMoney,
    ),
    assumption(
      "taxDaysElapsed",
      "Tax days elapsed",
      input.taxDaysElapsed,
      (value) => `${value} days`,
    ),
  ];

  if (input.isHecm === true) {
    rows.push(
      {
        key: "payoffBasis",
        label: "Payoff basis",
        value: "HECM projection",
        provenance: "User provided",
      },
      assumption(
        "hecmInitialBalance",
        "HECM initial balance",
        input.hecmInitialBalance,
        formatMoney,
      ),
      assumption(
        "hecmCurrentRateBps",
        "HECM current rate",
        input.hecmCurrentRateBps,
        formatBps,
      ),
      assumption(
        "hecmLifetimeCapBps",
        "HECM lifetime cap",
        input.hecmLifetimeCapBps,
        formatBps,
      ),
      assumption(
        "hecmMonthsElapsed",
        "HECM months elapsed",
        input.hecmMonthsElapsed,
        (value) => `${value} mo`,
      ),
    );
  } else {
    rows.push(
      assumption(
        "mortgageBalance",
        "Mortgage balance",
        input.mortgageBalance,
        formatMoney,
      ),
      assumption(
        "mortgageRateBps",
        "Mortgage rate",
        input.mortgageRateBps,
        formatBps,
      ),
      assumption(
        "mortgageMonthsRemaining",
        "Months of interest",
        input.mortgageMonthsRemaining,
        (value) => `${value} mo`,
      ),
      {
        key: "mortgagePayoffMode",
        label: "Payoff basis",
        value:
          input.mortgagePayoffMode === "VERIFIED_PAYOFF"
            ? "Verified payoff"
            : "Estimated payoff",
        provenance: "User provided",
      },
    );
  }

  rows.push(
    assumption("hoaPayoff", "HOA payoff", input.hoaPayoff, formatMoney),
    assumption(
      "liensJudgments",
      "Liens & judgments",
      input.liensJudgments,
      formatMoney,
    ),
    assumption(
      "stagingPhotoCost",
      "Staging & photography",
      input.stagingPhotoCost,
      formatMoney,
    ),
    assumption(
      "sellerConcessionsToBuyer",
      "Seller concessions",
      input.sellerConcessionsToBuyer,
      formatMoney,
    ),
    assumption("repairsCost", "Repairs", input.repairsCost, formatMoney),
    assumption(
      "renovationCost",
      "Renovation",
      input.renovationCost,
      formatMoney,
    ),
  );

  if (input.section121Status !== "UNKNOWN") {
    rows.push(
      assumption(
        "originalPurchasePrice",
        "Original purchase price",
        input.originalPurchasePrice,
        formatMoney,
      ),
      assumption(
        "capitalImprovements",
        "Capital improvements",
        input.capitalImprovements,
        formatMoney,
      ),
      {
        key: "section121Status",
        label: "Section 121 status",
        value: SECTION_121_LABELS[input.section121Status],
        provenance: "User provided",
      },
      {
        key: "section121Exemption",
        label: "Section 121 exclusion",
        value: formatMoney(SECTION_121_EXEMPTIONS[input.section121Status]),
        provenance: "Config",
      },
      assumption(
        "estimatedCapitalGainsTaxRateBps",
        "Estimated tax rate",
        input.estimatedCapitalGainsTaxRateBps,
        formatBps,
      ),
    );
  }

  return rows;
}

function buildWaterfall(output: SellerNetOutput): WaterfallRow[] {
  const isHecm = output.hecmAccruedPayoff !== null;
  const hecmAccruedPayoff = output.hecmAccruedPayoff ?? 0;

  const rows: WaterfallRow[] = [
    {
      key: "grossPrice",
      label: "Gross price",
      amount: formatMoney(output.grossPrice),
      emphasis: "total",
    },
    {
      key: "baseAdjustedPrice",
      label: "Adjusted price",
      amount: formatMoney(output.baseAdjustedPrice),
      detail: true,
    },
    {
      key: "renovationLift",
      label: "Renovation lift",
      amount: formatMoney(output.renovationLift),
      detail: true,
    },
    {
      key: "commissions",
      label: "Commissions",
      amount: formatDeduction(output.totalCommissions),
      emphasis: "subtotal",
    },
    {
      key: "listingCommission",
      label: "Listing commission",
      amount: formatDeduction(output.listingCommission),
      detail: true,
    },
    {
      key: "buyerCommission",
      label: "Buyer commission",
      amount: formatDeduction(output.buyerCommission),
      detail: true,
    },
    {
      key: "closingCosts",
      label: "Closing costs",
      amount: formatDeduction(output.totalClosingCosts),
      emphasis: "subtotal",
    },
    {
      key: "escrowFee",
      label: "Escrow fee",
      amount: formatDeduction(output.escrowFee),
      detail: true,
    },
    {
      key: "titleFee",
      label: "Title fee",
      amount: formatDeduction(output.titleFee),
      detail: true,
    },
    {
      key: "transferTax",
      label: "Transfer tax",
      amount: formatDeduction(output.transferTax),
      detail: true,
    },
    {
      key: "proratedPropertyTax",
      label: "Prorated property tax",
      amount: formatDeduction(output.proratedPropertyTax),
      detail: true,
    },
    isHecm
      ? {
          key: "hecmBalance",
          label: "Projected HECM balance",
          amount: formatDeduction(hecmAccruedPayoff),
          emphasis: "subtotal",
        }
      : {
          key: "mortgagePayoff",
          label: "Mortgage payoff",
          amount: formatDeduction(output.mortgagePayoff),
          emphasis: "subtotal",
        },
    {
      key: "interestAccrual",
      label: "Interest accrual",
      amount: formatDeduction(output.interestAccrual),
      detail: true,
    },
    {
      key: "hoaLiens",
      label: "HOA / liens",
      amount: formatDeduction(
        output.totalEncumbrances -
          (isHecm ? hecmAccruedPayoff : output.mortgagePayoff),
      ),
      emphasis: "subtotal",
    },
    {
      key: "stagingRepairs",
      label: "Staging / repairs / concessions / renovation",
      amount: formatDeduction(
        output.totalDeductions -
          output.totalEncumbrances -
          output.totalCommissions -
          output.totalClosingCosts,
      ),
      emphasis: "subtotal",
    },
    {
      key: "totalDeductions",
      label: "Total deductions",
      amount: formatDeduction(output.totalDeductions),
      emphasis: "total",
    },
  ];

  if (output.taxActive) {
    rows.push({
      key: "capitalGainsTax",
      label: "Estimated capital-gains tax",
      amount: formatDeduction(output.estimatedTaxOwed),
      emphasis: "subtotal",
    });
  }

  if (output.frictionActive) {
    rows.push(
      {
        key: "frictionCarryingLoss",
        label: "Carrying loss (supplemental)",
        amount: formatDeduction(output.carryingLoss),
        detail: true,
      },
      {
        key: "frictionStaleDiscount",
        label: "Stale discount loss (supplemental)",
        amount: formatDeduction(output.staleDiscountLoss),
        detail: true,
      },
      {
        key: "frictionNetAfter",
        label: "Net after market / time friction (supplemental)",
        amount: formatMoney(output.probabilisticTrueNet),
        emphasis: "subtotal",
      },
    );
  }

  return rows;
}

function WaterfallLine({ row }: { row: WaterfallRow }) {
  return (
    <div
      className={cn(
        "waterfall-row flex items-baseline justify-between gap-4 py-0.5",
        row.emphasis === "total" && "border-t border-ledger-rule-strong pt-1",
        row.emphasis === "subtotal" && "border-t border-ledger-rule pt-1",
      )}
    >
      <span
        className={cn(
          "min-w-0 text-[11px] leading-snug",
          row.detail ? "pl-4 text-muted-foreground" : "text-foreground",
          row.emphasis === "total" && "font-semibold",
          row.emphasis === "subtotal" && "font-medium",
        )}
      >
        {row.label}
      </span>
      <span
        className={cn(
          "font-money shrink-0 text-right text-[11px] tabular-nums",
          row.detail ? "text-muted-foreground" : "text-foreground",
          row.emphasis === "total" && "font-semibold",
          row.emphasis === "subtotal" && "font-medium",
        )}
      >
        {row.amount}
      </span>
    </div>
  );
}

export function NetSheet({
  propertyId,
  input,
  result,
  calculable,
  generatedAt,
}: NetSheetProps) {
  const output = result.output;
  const assumptions = buildAssumptions(input);
  const waterfall = buildWaterfall(output);
  const hasShortfall = output.estimatedSellerShortfall > 0;
  const isHecm = output.hecmAccruedPayoff !== null;
  const hecmBalanceShortfall = output.hecmBalanceShortfall;
  const overallShortfall = output.hudNonRecourseDeficit;
  const taxActive = output.taxActive;

  return (
    <article
      data-ocid="print.sheet"
      className="print-sheet mx-auto w-full max-w-[8.5in] rounded-sm border border-border bg-card p-5 shadow-subtle md:p-7"
    >
      {/* ── Identity header ─────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ledger-rule-strong pb-2.5">
        <div className="min-w-0">
          <p className="eyebrow text-muted-foreground">
            Estimated Seller Net Sheet
          </p>
          <h1 className="mt-1 truncate font-display text-xl font-semibold tracking-tight text-foreground">
            {formatPropertyId(propertyId)}
          </h1>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-right">
          <dt className="eyebrow text-muted-foreground">Prepared</dt>
          <dd className="font-money text-[11px] tabular-nums text-foreground">
            {formatDate(generatedAt)}
          </dd>
          <dt className="eyebrow text-muted-foreground">Calculator</dt>
          <dd className="font-money text-[11px] tabular-nums text-foreground">
            {result.calculatorVersion}
          </dd>
          <dt className="eyebrow text-muted-foreground">Input hash</dt>
          <dd className="font-money text-[11px] tabular-nums text-foreground">
            {result.inputHash}
          </dd>
        </dl>
      </header>

      {!calculable ? (
        <p
          data-ocid="print.incomplete_notice"
          className="mt-2.5 rounded-sm border border-warning/40 bg-warning/10 px-3 py-1.5 text-[11px] leading-relaxed text-foreground"
        >
          Some required inputs are still unknown. Figures below treat missing
          values as zero and are provisional until every field is provided.
        </p>
      ) : null}

      {/* ── Assumptions + waterfall ─────────────────────────────────── */}
      <div className="mt-3.5 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section data-ocid="print.assumptions" className="print-break-avoid">
          <div className="flex items-center gap-2">
            <SectionIcon section="primary_inputs" />
            <h2 className="eyebrow text-foreground">Assumptions</h2>
          </div>
          <div className="mt-1.5 border-t border-ledger-rule">
            {assumptions.map((row) => (
              <div
                key={row.key}
                className="flex items-baseline justify-between gap-3 border-b border-ledger-rule py-0.5"
              >
                <span className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                  {row.label}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-money text-[11px] tabular-nums text-foreground">
                    {row.value}
                  </span>
                  <span className="w-[86px] text-right text-[9px] uppercase tracking-wider text-muted-foreground">
                    {row.provenance}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section data-ocid="print.waterfall" className="print-break-avoid">
          <div className="flex items-center gap-2">
            <SectionIcon section="waterfall" />
            <h2 className="eyebrow text-foreground">Seller Net Waterfall</h2>
          </div>
          <div className="mt-1.5 border-t border-ledger-rule">
            {waterfall.map((row) => (
              <WaterfallLine key={row.key} row={row} />
            ))}
          </div>
        </section>
      </div>

      {/* ── Outcome ─────────────────────────────────────────────────── */}
      <section
        data-ocid="print.outcome"
        className="print-break-avoid mt-4 grid grid-cols-1 gap-2.5 border-t-2 border-ledger-rule-strong pt-2.5 sm:grid-cols-2"
      >
        {isHecm ? (
          <div className="rounded-sm border border-border bg-muted/30 px-3 py-2">
            <p className="eyebrow text-muted-foreground">
              Projected HECM balance
            </p>
            <p
              data-ocid="print.hecm_balance"
              className="font-money mt-0.5 text-2xl font-semibold tabular-nums text-foreground"
            >
              {formatMoneyWhole(output.hecmAccruedPayoff ?? 0)}
            </p>
            <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
              ESTIMATE — verify with lender
            </p>
          </div>
        ) : null}
        <div className="rounded-sm border border-success/30 bg-success/5 px-3 py-2">
          <p className="eyebrow text-muted-foreground">
            Estimated net proceeds
          </p>
          <p
            data-ocid="print.net_proceeds"
            className="font-money mt-0.5 text-2xl font-semibold tabular-nums text-success"
          >
            {formatMoneyWhole(output.estimatedNetProceeds)}
          </p>
        </div>
        {isHecm ? (
          <>
            {hecmBalanceShortfall !== null && hecmBalanceShortfall > 0 ? (
              <div className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="eyebrow text-muted-foreground">
                  HECM Balance Shortfall — Informational
                </p>
                <p
                  data-ocid="print.hecm_balance_shortfall"
                  className="font-money mt-0.5 text-2xl font-semibold tabular-nums text-destructive"
                >
                  {formatMoneyWhole(hecmBalanceShortfall)}
                </p>
                <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                  Not automatically owed personally by the seller
                </p>
              </div>
            ) : null}
            {overallShortfall !== null && overallShortfall > 0 ? (
              <div className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="eyebrow text-muted-foreground">
                  Overall Transaction Shortfall — Informational
                </p>
                <p
                  data-ocid="print.overall_shortfall"
                  className="font-money mt-0.5 text-2xl font-semibold tabular-nums text-destructive"
                >
                  {formatMoneyWhole(overallShortfall)}
                </p>
                <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                  Not automatically owed personally by the seller
                </p>
              </div>
            ) : null}
          </>
        ) : hasShortfall ? (
          <div className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="eyebrow text-muted-foreground">
              Estimated seller shortfall
            </p>
            <p
              data-ocid="print.shortfall"
              className="font-money mt-0.5 text-2xl font-semibold tabular-nums text-destructive"
            >
              {formatMoneyWhole(output.estimatedSellerShortfall)}
            </p>
          </div>
        ) : (
          <div className="rounded-sm border border-border bg-muted/30 px-3 py-2">
            <p className="eyebrow text-muted-foreground">
              Estimated seller shortfall
            </p>
            <p className="font-money mt-0.5 text-2xl font-semibold tabular-nums text-muted-foreground">
              None
            </p>
          </div>
        )}
      </section>

      {isHecm ? (
        <p
          data-ocid="print.hecm_review_note"
          className="print-break-avoid mt-2.5 rounded-sm border border-prov-estimate/40 bg-prov-estimate/10 px-3 py-1.5 text-[11px] leading-relaxed text-foreground"
        >
          Projected HECM balance — ESTIMATE. Verify with lender. This is not a
          legal conclusion. Lender/attorney review required.
        </p>
      ) : null}

      {taxActive ? (
        <section
          data-ocid="print.tax_section"
          className="print-break-avoid mt-2.5 rounded-sm border border-border bg-muted/30 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <SectionIcon section="capital_gains" />
            <h2 className="eyebrow text-muted-foreground">
              Estimated capital-gains tax
            </h2>
          </div>
          <dl className="mt-1.5 space-y-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-muted-foreground">
                Adjusted basis
              </dt>
              <dd className="font-money text-[11px] tabular-nums text-foreground">
                {formatMoney(output.adjustedBasis)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-muted-foreground">
                Capital gain
              </dt>
              <dd className="font-money text-[11px] tabular-nums text-foreground">
                {formatMoney(output.capitalGain)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-muted-foreground">
                Section 121 exclusion
              </dt>
              <dd className="font-money text-[11px] tabular-nums text-foreground">
                {formatMoney(output.section121Exemption)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-muted-foreground">
                Taxable gain
              </dt>
              <dd className="font-money text-[11px] tabular-nums text-foreground">
                {formatMoney(output.taxableGain)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-ledger-rule pt-1">
              <dt className="text-[11px] font-medium text-foreground">
                Estimated capital-gains tax
              </dt>
              <dd className="font-money text-[11px] font-semibold tabular-nums text-foreground">
                {formatMoney(output.estimatedTaxOwed)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 border-t border-ledger-rule pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Estimated capital-gains tax is for planning only and is not tax
            advice. Eligibility for any exclusion is not determined here.
            Confirm all tax treatment with a CPA or tax professional.
          </p>
        </section>
      ) : null}

      {output.frictionActive ? (
        <section
          data-ocid="print.friction_section"
          className="print-break-avoid mt-2.5 rounded-sm border border-border bg-muted/30 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <SectionIcon section="market_friction" />
            <h2 className="eyebrow text-muted-foreground">
              Market &amp; time friction — supplemental
            </h2>
          </div>
          <dl className="mt-1.5 space-y-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-muted-foreground">
                Carrying loss
              </dt>
              <dd className="font-money text-[11px] tabular-nums text-foreground">
                {formatDeduction(output.carryingLoss)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-muted-foreground">
                Stale discount loss
              </dt>
              <dd className="font-money text-[11px] tabular-nums text-foreground">
                {formatDeduction(output.staleDiscountLoss)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-ledger-rule pt-1">
              <dt className="text-[11px] font-medium text-foreground">
                Net after market / time friction
              </dt>
              <dd className="font-money text-[11px] font-semibold tabular-nums text-foreground">
                {formatMoney(output.probabilisticTrueNet)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 border-t border-ledger-rule pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Supplemental planning estimate only. These figures do not change the
            estimated net proceeds above.
          </p>
        </section>
      ) : null}

      {/* ── Disclaimer ──────────────────────────────────────────────── */}
      <footer className="print-break-avoid mt-4 border-t border-ledger-rule pt-2.5">
        <Disclaimer variant="block" className="text-foreground" />
        <p className="mt-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
          Default assumptions — escrow{" "}
          {formatBps(SELLER_NET_CONFIG.escrowRateBps)}, title{" "}
          {formatBps(SELLER_NET_CONFIG.titleRateBps)}, transfer tax{" "}
          {formatBps(SELLER_NET_CONFIG.transferTaxRateBps)}, recording{" "}
          {formatMoney(SELLER_NET_CONFIG.recordingFees)}.
        </p>
      </footer>
    </article>
  );
}
