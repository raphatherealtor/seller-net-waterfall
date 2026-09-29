import { WaterfallChart } from "@/components/charts/waterfall-chart";
import { SectionIcon } from "@/components/ui/section-icon";
import { formatDeduction, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSellerNet } from "@/state/seller-net-context";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * The Seller Net Waterfall: a clean financial-statement ledger on the dark
 * results panel. Gross sale price, then the deduction rows, then a horizontal
 * rule, then the bold Estimated Net Proceeds total, followed by the Seller
 * Shortfall row when the deductions exceed the gross price.
 *
 * Every amount is read from the canonical calculator output — this component
 * performs no arithmetic. The optional capital-gains tax line keeps its
 * placement after the total-deductions row, and the HECM informational notes
 * and blocked/ready states are unchanged.
 */

interface WaterfallRow {
  id: string;
  label: string;
  detail?: string;
  amount: number;
}

export function Waterfall() {
  const { result, calculable, validation, isHecm } = useSellerNet();
  const { output } = result;

  const hecmAccruedPayoff = output.hecmAccruedPayoff;
  const hecmBalanceShortfall = output.hecmBalanceShortfall;
  const overallShortfall = output.hudNonRecourseDeficit;

  const rows: WaterfallRow[] = [
    {
      id: "commissions",
      label: "Commissions",
      detail: "Listing + buyer side",
      amount: output.totalCommissions,
    },
    {
      id: "closing_costs",
      label: "Closing costs",
      detail: "Escrow, title, transfer tax, prorated tax, recording, warranty",
      amount: output.totalClosingCosts,
    },
    isHecm
      ? {
          id: "hecm_balance",
          label: "Projected HECM balance",
          detail: "Accrued reverse-mortgage payoff — ESTIMATE",
          amount: hecmAccruedPayoff ?? 0,
        }
      : {
          id: "mortgage",
          label: "Mortgage payoff",
          detail:
            output.interestAccrual > 0
              ? `Principal + ${formatMoney(output.interestAccrual)} interest`
              : "Principal balance",
          amount: output.mortgagePayoff,
        },
    {
      id: "hoa_liens",
      label: "HOA / liens",
      detail: "HOA payoff + liens and judgments",
      amount:
        output.totalEncumbrances -
        (isHecm ? (hecmAccruedPayoff ?? 0) : output.mortgagePayoff),
    },
    {
      id: "staging_repairs",
      label: "Staging / repairs / concessions / renovation",
      detail: "Seller-funded transaction costs",
      amount:
        output.totalDeductions -
        output.totalEncumbrances -
        output.totalCommissions -
        output.totalClosingCosts,
    },
  ];

  const shortfall = output.estimatedSellerShortfall;
  const taxActive = output.taxActive;

  return (
    <section
      data-ocid="waterfall.section"
      className="panel-surface rounded-md shadow-subtle"
    >
      <header className="flex items-center justify-between gap-3 border-b panel-rule px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <SectionIcon section="waterfall" size="lg" />
          <h2 className="eyebrow truncate text-[oklch(var(--panel-foreground))]">
            Seller Net Waterfall
          </h2>
        </div>
        <span className="shrink-0 font-money text-[10px] uppercase tracking-wider panel-muted">
          {result.calculatorVersion}
        </span>
      </header>

      <div className="px-4 py-3">
        <div className="mb-3 border-b panel-rule pb-3">
          <WaterfallChart />
        </div>

        <div className="flex items-baseline justify-between gap-4 border-b panel-rule pb-2">
          <span className="text-xs font-medium text-[oklch(var(--panel-foreground))]">
            Gross sale price
          </span>
          <span className="font-money text-sm font-semibold tabular-nums text-[oklch(var(--panel-foreground))]">
            {formatMoney(output.grossPrice)}
          </span>
        </div>

        <ul
          data-ocid="waterfall.list"
          className="divide-y divide-[oklch(var(--panel-rule))]"
        >
          {rows.map((row) => (
            <li
              key={row.id}
              data-ocid={`waterfall.row.${row.id}`}
              className="waterfall-row flex items-baseline justify-between gap-4 py-2"
            >
              <span className="min-w-0">
                <span className="block text-xs text-[oklch(var(--panel-foreground))]">
                  {row.label}
                </span>
                {row.detail ? (
                  <span className="block truncate text-[11px] panel-muted">
                    {row.detail}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-money text-sm tabular-nums text-[oklch(var(--panel-negative))]">
                {formatDeduction(row.amount)}
              </span>
            </li>
          ))}
        </ul>

        {taxActive ? (
          <div
            data-ocid="waterfall.row.capital_gains_tax"
            className="mt-2 flex items-baseline justify-between gap-4 border-t panel-rule pt-2"
          >
            <span className="min-w-0">
              <span className="block text-xs text-[oklch(var(--panel-foreground))]">
                Estimated capital-gains tax
              </span>
              <span className="block text-[11px] panel-muted">
                Applied after ordinary deductions — not part of total deductions
              </span>
            </span>
            <span className="shrink-0 font-money text-sm tabular-nums text-[oklch(var(--panel-negative))]">
              {formatDeduction(output.estimatedTaxOwed)}
            </span>
          </div>
        ) : null}

        <div className="mt-2 flex items-baseline justify-between gap-4 border-t-2 border-[oklch(var(--panel-foreground))]/70 pt-2.5">
          <span className="eyebrow text-[oklch(var(--panel-foreground))]">
            Estimated net proceeds
          </span>
          <span
            data-ocid="waterfall.net_proceeds"
            className={cn(
              "font-money text-base font-semibold tabular-nums",
              output.estimatedNetProceeds > 0
                ? "text-[oklch(var(--panel-positive))]"
                : "text-[oklch(var(--panel-foreground))]",
            )}
          >
            {formatMoney(output.estimatedNetProceeds)}
          </span>
        </div>

        {shortfall > 0 ? (
          <div
            data-ocid="waterfall.shortfall"
            className="mt-2 flex items-baseline justify-between gap-4 rounded-sm border border-[oklch(var(--panel-negative))]/40 bg-[oklch(var(--panel-negative))]/10 px-2.5 py-2"
          >
            <span className="flex items-center gap-1.5 eyebrow text-[oklch(var(--panel-negative))]">
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              Seller shortfall
            </span>
            <span className="font-money text-base font-semibold tabular-nums text-[oklch(var(--panel-negative))]">
              {formatMoney(shortfall)}
            </span>
          </div>
        ) : null}

        {isHecm ? (
          <div
            data-ocid="waterfall.hecm_notes"
            className="mt-3 space-y-2 rounded-sm border panel-rule bg-[oklch(var(--panel-foreground))]/5 px-3 py-2.5"
          >
            {hecmBalanceShortfall !== null && hecmBalanceShortfall > 0 ? (
              <div
                data-ocid="waterfall.hecm_balance_shortfall"
                className="flex items-baseline justify-between gap-4"
              >
                <span className="min-w-0">
                  <span className="block eyebrow text-[oklch(var(--panel-foreground))]">
                    HECM Balance Shortfall — Informational
                  </span>
                  <span className="block text-[11px] panel-muted">
                    Projected HECM balance exceeds gross price. Not
                    automatically owed personally by the seller.
                  </span>
                </span>
                <span className="shrink-0 font-money text-sm font-semibold tabular-nums text-[oklch(var(--panel-foreground))]">
                  {formatMoney(hecmBalanceShortfall)}
                </span>
              </div>
            ) : null}

            {overallShortfall !== null && overallShortfall > 0 ? (
              <div
                data-ocid="waterfall.overall_shortfall"
                className="flex items-baseline justify-between gap-4"
              >
                <span className="min-w-0">
                  <span className="block eyebrow text-[oklch(var(--panel-foreground))]">
                    Overall Transaction Shortfall — Informational
                  </span>
                  <span className="block text-[11px] panel-muted">
                    Total deductions exceed gross price. Not automatically owed
                    personally by the seller.
                  </span>
                </span>
                <span className="shrink-0 font-money text-sm font-semibold tabular-nums text-[oklch(var(--panel-foreground))]">
                  {formatMoney(overallShortfall)}
                </span>
              </div>
            ) : null}

            <p className="border-t panel-rule pt-2 text-[11px] leading-relaxed panel-muted">
              Projected HECM balance — ESTIMATE. Verify with lender. This is not
              a legal conclusion. Lender/attorney review required.
            </p>
          </div>
        ) : null}

        {!calculable ? (
          <div
            data-ocid="waterfall.blocked_state"
            className="mt-3 rounded-sm border border-[oklch(var(--panel-negative))]/40 bg-[oklch(var(--panel-negative))]/10 px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[oklch(var(--panel-foreground))]">
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              Calculation blocked — {validation.missingFields.length} required
              field
              {validation.missingFields.length === 1 ? "" : "s"} missing
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {validation.missingFields.map((field) => (
                <li
                  key={field}
                  className="rounded-sm border panel-rule bg-[oklch(var(--panel-foreground))]/5 px-1.5 py-0.5 font-money text-[10px] panel-muted"
                >
                  {field}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p
            data-ocid="waterfall.ready_state"
            className="mt-3 flex items-center gap-1.5 text-[11px] panel-muted"
          >
            <CheckCircle2
              aria-hidden="true"
              className="size-3.5 text-[oklch(var(--panel-positive))]"
            />
            All required inputs present — figures are final for this scenario.
          </p>
        )}
      </div>
    </section>
  );
}
