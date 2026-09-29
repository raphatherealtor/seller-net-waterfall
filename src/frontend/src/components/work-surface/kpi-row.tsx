import { KpiCard } from "@/components/ui/kpi-card";
import { SectionIcon } from "@/components/ui/section-icon";
import { formatMoneyWhole } from "@/lib/format";
import { useSellerNet } from "@/state/seller-net-context";

/**
 * The right-panel results hierarchy: Estimated Net Proceeds is the visual
 * anchor at the top as a large currency value, followed by smaller medium KPI
 * readouts for gross sale price, total deductions (or the projected HECM
 * balance), the seller shortfall when applicable, and the net-after-friction
 * figure when the friction module is active.
 *
 * Every figure comes from the canonical calculator result; nothing is derived
 * here. Conditional rendering is unchanged: the shortfall card appears only
 * when it is greater than zero, and the friction card only when
 * `output.frictionActive` is true.
 */
export function KpiRow() {
  const { result, calculable, isHecm } = useSellerNet();
  const { output } = result;

  const shortfall = output.estimatedSellerShortfall;
  const hecmAccruedPayoff = output.hecmAccruedPayoff;
  const hecmBalanceShortfall = output.hecmBalanceShortfall;
  const overallShortfall = output.hudNonRecourseDeficit;
  const frictionActive = output.frictionActive;

  return (
    <section
      data-ocid="kpi.row"
      className="panel-surface rounded-md px-3.5 py-3.5 shadow-subtle"
    >
      <div data-ocid="kpi.net_proceeds">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <SectionIcon section="kpi" size="lg" />
            <p className="eyebrow truncate panel-muted">
              Estimated net proceeds
            </p>
          </div>
          <span className="shrink-0 font-money text-[10px] uppercase tracking-wider panel-muted">
            {calculable ? "Final for scenario" : "Incomplete inputs"}
          </span>
        </div>
        <p
          className={
            output.estimatedNetProceeds > 0
              ? "mt-1.5 font-money text-3xl font-semibold tabular-nums text-[oklch(var(--panel-positive))]"
              : "mt-1.5 font-money text-3xl font-semibold tabular-nums text-[oklch(var(--panel-foreground))]"
          }
        >
          {formatMoneyWhole(output.estimatedNetProceeds)}
        </p>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5 border-t panel-rule pt-3.5">
        <KpiCard
          data-ocid="kpi.gross_price"
          label="Gross sale price"
          value={formatMoneyWhole(output.grossPrice)}
          hint="Adjusted price + renovation lift"
          tone="accent"
        />
        {isHecm ? (
          <KpiCard
            data-ocid="kpi.hecm_balance"
            label="Projected HECM balance"
            value={formatMoneyWhole(hecmAccruedPayoff ?? 0)}
            hint="ESTIMATE — verify with lender"
            tone="neutral"
          />
        ) : (
          <KpiCard
            data-ocid="kpi.total_deductions"
            label="Total deductions"
            value={formatMoneyWhole(output.totalDeductions)}
            hint="Commissions, closing, encumbrances, costs"
            tone="neutral"
          />
        )}
        {isHecm ? (
          <>
            {hecmBalanceShortfall !== null && hecmBalanceShortfall > 0 ? (
              <KpiCard
                data-ocid="kpi.hecm_balance_shortfall"
                label="HECM balance shortfall"
                value={formatMoneyWhole(hecmBalanceShortfall)}
                hint="Informational — not automatically owed"
                tone="negative"
              />
            ) : null}
            {overallShortfall !== null && overallShortfall > 0 ? (
              <KpiCard
                data-ocid="kpi.overall_shortfall"
                label="Overall transaction shortfall"
                value={formatMoneyWhole(overallShortfall)}
                hint="Informational — not automatically owed"
                tone="negative"
              />
            ) : null}
          </>
        ) : shortfall > 0 ? (
          <KpiCard
            data-ocid="kpi.shortfall"
            label="Estimated seller shortfall"
            value={formatMoneyWhole(shortfall)}
            hint="Deductions exceed gross price"
            tone="negative"
          />
        ) : null}
        {frictionActive ? (
          <KpiCard
            data-ocid="kpi.friction_net"
            label="Net after market / time friction"
            value={formatMoneyWhole(output.probabilisticTrueNet)}
            hint="Probabilistic true net — supplemental"
            tone="neutral"
          />
        ) : null}
      </div>
    </section>
  );
}
