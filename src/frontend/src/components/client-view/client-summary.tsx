import { KpiCard } from "@/components/ui/kpi-card";
import { SectionIcon } from "@/components/ui/section-icon";
import { formatDeduction, formatMoney, formatMoneyWhole } from "@/lib/format";
import type { SellerNetOutput } from "@/lib/seller-net";
import { cn } from "@/lib/utils";

/**
 * Seller-facing summary of a completed net sheet.
 *
 * This component renders ONLY the figures a seller should see. It never shows
 * provenance, raw inputs, validation diagnostics, basis-point rates, or any
 * internal terminology — every value arrives pre-computed from the canonical
 * calculator via `result.output`.
 */

interface ClientSummaryProps {
  output: SellerNetOutput;
  className?: string;
}

interface WaterfallLine {
  label: string;
  amount: number;
}

/**
 * The major deduction categories, in the order a seller reads them. Each line
 * is a pre-computed output total — nothing is summed or re-derived here.
 */
function deductionLines(output: SellerNetOutput): WaterfallLine[] {
  return [
    { label: "Real estate commissions", amount: output.totalCommissions },
    { label: "Closing costs", amount: output.totalClosingCosts },
    { label: "Mortgage & lien payoffs", amount: output.totalEncumbrances },
    {
      label: "Repairs, staging & concessions",
      amount:
        output.totalDeductions -
        output.totalCommissions -
        output.totalClosingCosts -
        output.totalEncumbrances,
    },
  ];
}

export function ClientSummary({ output, className }: ClientSummaryProps) {
  const hasShortfall = output.estimatedSellerShortfall > 0;
  const isHecm = output.hecmAccruedPayoff !== null;
  const hecmBalanceShortfall = output.hecmBalanceShortfall;
  const overallShortfall = output.hudNonRecourseDeficit;
  const taxActive = output.taxActive;
  const frictionActive = output.frictionActive;
  const lines = deductionLines(output);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          data-ocid="client_view.gross_price.card"
          label="Gross sale price"
          value={formatMoneyWhole(output.grossPrice)}
          tone="accent"
        />
        {isHecm ? (
          <KpiCard
            data-ocid="client_view.hecm_balance.card"
            label="Projected HECM balance"
            value={formatMoneyWhole(output.hecmAccruedPayoff ?? 0)}
            hint="ESTIMATE — verify with lender"
            tone="neutral"
          />
        ) : (
          <KpiCard
            data-ocid="client_view.total_deductions.card"
            label="Total deductions"
            value={formatMoneyWhole(output.totalDeductions)}
            tone="neutral"
          />
        )}
        <KpiCard
          data-ocid="client_view.net_proceeds.card"
          label="Estimated net proceeds"
          value={formatMoneyWhole(output.estimatedNetProceeds)}
          tone={hasShortfall ? "neutral" : "positive"}
        />
        {isHecm ? (
          <>
            {hecmBalanceShortfall !== null && hecmBalanceShortfall > 0 ? (
              <KpiCard
                data-ocid="client_view.hecm_balance_shortfall.card"
                label="HECM balance shortfall"
                value={formatMoneyWhole(hecmBalanceShortfall)}
                hint="Informational — not automatically owed"
                tone="negative"
              />
            ) : null}
            {overallShortfall !== null && overallShortfall > 0 ? (
              <KpiCard
                data-ocid="client_view.overall_shortfall.card"
                label="Overall transaction shortfall"
                value={formatMoneyWhole(overallShortfall)}
                hint="Informational — not automatically owed"
                tone="negative"
              />
            ) : null}
          </>
        ) : hasShortfall ? (
          <KpiCard
            data-ocid="client_view.shortfall.card"
            label="Estimated seller shortfall"
            value={formatMoneyWhole(output.estimatedSellerShortfall)}
            tone="negative"
          />
        ) : (
          <KpiCard
            data-ocid="client_view.net_position.card"
            label="Net position"
            value={formatMoneyWhole(output.nominalNet)}
            tone={output.nominalNet >= 0 ? "positive" : "negative"}
          />
        )}
      </div>

      <section
        data-ocid="client_view.waterfall.section"
        className="surface-2 overflow-hidden rounded-sm"
      >
        <header className="section-head flex items-center justify-between gap-3 px-3.5 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <SectionIcon section="waterfall" />
            <h2 className="eyebrow truncate text-foreground">
              Where the money goes
            </h2>
          </div>
          <span className="shrink-0 font-money text-[10px] uppercase tracking-wider text-muted-foreground">
            Estimated
          </span>
        </header>

        <dl className="divide-y divide-border">
          <div className="flex items-baseline justify-between gap-4 px-3.5 py-2">
            <dt className="text-sm font-medium text-foreground">
              Gross sale price
            </dt>
            <dd className="font-money text-sm font-semibold tabular-nums text-foreground">
              {formatMoney(output.grossPrice)}
            </dd>
          </div>

          {lines.map((line) => (
            <div
              key={line.label}
              className="flex items-baseline justify-between gap-4 px-3.5 py-2"
            >
              <dt className="text-sm text-muted-foreground">{line.label}</dt>
              <dd className="font-money text-sm tabular-nums text-foreground">
                {formatDeduction(line.amount)}
              </dd>
            </div>
          ))}

          {taxActive ? (
            <div
              data-ocid="client_view.capital_gains_tax.line"
              className="flex items-baseline justify-between gap-4 px-3.5 py-2"
            >
              <dt className="text-sm text-muted-foreground">
                Estimated capital-gains tax
              </dt>
              <dd className="font-money text-sm tabular-nums text-foreground">
                {formatDeduction(output.estimatedTaxOwed)}
              </dd>
            </div>
          ) : null}

          <div className="flex items-baseline justify-between gap-4 border-t-2 border-border bg-muted/40 px-3.5 py-2.5">
            <dt className="font-display text-sm font-semibold text-foreground">
              {hasShortfall
                ? "Estimated seller shortfall"
                : "Estimated net proceeds"}
            </dt>
            <dd
              className={cn(
                "font-money text-base font-semibold tabular-nums",
                hasShortfall ? "text-destructive" : "text-success",
              )}
            >
              {formatMoney(
                hasShortfall
                  ? output.estimatedSellerShortfall
                  : output.estimatedNetProceeds,
              )}
            </dd>
          </div>
        </dl>
      </section>

      {taxActive ? (
        <p
          data-ocid="client_view.tax_disclaimer"
          className="rounded-sm border border-border bg-muted/40 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground"
        >
          Capital-gains tax figures are an estimate for planning only and are
          not tax advice. Eligibility for any exclusion is not determined here.
          Confirm all tax treatment with a CPA or tax professional.
        </p>
      ) : null}

      {frictionActive ? (
        <section
          data-ocid="client_view.friction.section"
          className="surface-2 overflow-hidden rounded-sm"
        >
          <header className="section-head flex items-center justify-between gap-3 px-3.5 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <SectionIcon section="market_friction" />
              <h2 className="eyebrow truncate text-foreground">
                Market &amp; time friction
              </h2>
            </div>
            <span className="shrink-0 font-money text-[10px] uppercase tracking-wider text-muted-foreground">
              Supplemental
            </span>
          </header>

          <dl className="divide-y divide-border">
            <div
              data-ocid="client_view.friction.carrying_loss.line"
              className="flex items-baseline justify-between gap-4 px-3.5 py-2"
            >
              <dt className="text-sm text-muted-foreground">Carrying loss</dt>
              <dd className="font-money text-sm tabular-nums text-foreground">
                {formatDeduction(output.carryingLoss)}
              </dd>
            </div>

            <div
              data-ocid="client_view.friction.stale_discount.line"
              className="flex items-baseline justify-between gap-4 px-3.5 py-2"
            >
              <dt className="text-sm text-muted-foreground">
                Stale discount loss
              </dt>
              <dd className="font-money text-sm tabular-nums text-foreground">
                {formatDeduction(output.staleDiscountLoss)}
              </dd>
            </div>

            <div
              data-ocid="client_view.friction.net_after.line"
              className="flex items-baseline justify-between gap-4 border-t-2 border-border bg-muted/40 px-3.5 py-2.5"
            >
              <dt className="font-display text-sm font-semibold text-foreground">
                Net after market / time friction
              </dt>
              <dd className="font-money text-base font-semibold tabular-nums text-foreground">
                {formatMoney(output.probabilisticTrueNet)}
              </dd>
            </div>
          </dl>

          <p className="border-t border-border px-3.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Supplemental planning estimate only. These figures do not change the
            estimated net proceeds above.
          </p>
        </section>
      ) : null}

      {isHecm ? (
        <section
          data-ocid="client_view.hecm.section"
          className="surface-2 overflow-hidden rounded-sm"
        >
          <header className="section-head flex items-center justify-between gap-3 px-3.5 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <SectionIcon section="hecm" />
              <h2 className="eyebrow truncate text-foreground">
                Reverse mortgage projection
              </h2>
            </div>
            <span className="shrink-0 font-money text-[10px] uppercase tracking-wider text-muted-foreground">
              ESTIMATE
            </span>
          </header>

          <dl className="divide-y divide-border">
            <div className="flex items-baseline justify-between gap-4 px-3.5 py-2">
              <dt className="text-sm text-muted-foreground">
                Projected HECM balance
              </dt>
              <dd className="font-money text-sm font-semibold tabular-nums text-foreground">
                {formatMoney(output.hecmAccruedPayoff ?? 0)}
              </dd>
            </div>

            {hecmBalanceShortfall !== null && hecmBalanceShortfall > 0 ? (
              <div className="flex items-baseline justify-between gap-4 px-3.5 py-2">
                <dt className="text-sm text-muted-foreground">
                  HECM Balance Shortfall — Informational
                </dt>
                <dd className="font-money text-sm tabular-nums text-foreground">
                  {formatMoney(hecmBalanceShortfall)}
                </dd>
              </div>
            ) : null}

            {overallShortfall !== null && overallShortfall > 0 ? (
              <div className="flex items-baseline justify-between gap-4 px-3.5 py-2">
                <dt className="text-sm text-muted-foreground">
                  Overall Transaction Shortfall — Informational
                </dt>
                <dd className="font-money text-sm tabular-nums text-foreground">
                  {formatMoney(overallShortfall)}
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="border-t border-border px-3.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Projected HECM balance — ESTIMATE. Verify with lender. This is not a
            legal conclusion. Lender/attorney review required. Neither shortfall
            figure is automatically owed personally by the seller.
          </p>
        </section>
      ) : null}
    </div>
  );
}
