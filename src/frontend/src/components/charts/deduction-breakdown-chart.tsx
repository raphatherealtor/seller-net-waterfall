import { formatMoney } from "@/lib/format";
import { useSellerNet } from "@/state/seller-net-context";
import { useMemo } from "react";
import {
  type BreakdownSlice,
  ChartCaption,
  chartColor,
  formatShare,
  safeValue,
  withShares,
} from "./chart-primitives";

/**
 * Proportional deduction breakdown as a horizontal stacked bar.
 *
 * Each category's share is a display proportion of the already-computed
 * deduction figures read from the canonical `SellerNetOutput`; nothing is
 * re-derived. The bar and its legend update live with the calculated numbers.
 */

export function DeductionBreakdownChart() {
  const { result } = useSellerNet();
  const { output } = result;

  const slices = useMemo<BreakdownSlice[]>(() => {
    return [
      {
        id: "commissions",
        label: "Commissions",
        value: output.totalCommissions,
        color: "chart-1",
      },
      {
        id: "closing_costs",
        label: "Closing costs",
        value: output.totalClosingCosts,
        color: "chart-2",
      },
      {
        id: "payoffs",
        label: "Encumbrances / payoffs",
        value: output.totalEncumbrances,
        color: "chart-3",
      },
      {
        id: "seller_costs",
        label: "Seller costs",
        value:
          output.totalDeductions -
          output.totalCommissions -
          output.totalClosingCosts -
          output.totalEncumbrances,
        color: "chart-4",
      },
      {
        id: "estimated_tax",
        label: "Estimated tax",
        value: output.taxActive ? output.estimatedTaxOwed : 0,
        color: "chart-5",
      },
    ];
  }, [output]);

  const shares = useMemo(() => withShares(slices), [slices]);
  const total = shares.reduce((sum, slice) => sum + safeValue(slice.value), 0);

  return (
    <div data-ocid="deduction_breakdown.panel" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <ChartCaption>Deduction mix</ChartCaption>
        <span className="font-money text-[10px] tabular-nums text-[oklch(var(--panel-muted))]">
          {formatMoney(total)} total
        </span>
      </div>

      <div
        data-ocid="deduction_breakdown.bar"
        className="flex h-3 w-full overflow-hidden rounded-sm bg-[oklch(var(--chart-track))]"
      >
        {shares.map((slice) => (
          <span
            key={slice.id}
            className="chart-bar block h-full"
            style={{
              width: `${slice.share * 100}%`,
              backgroundColor: chartColor(slice.color),
            }}
          />
        ))}
      </div>

      <ul className="space-y-1">
        {shares.map((slice) => (
          <li
            key={slice.id}
            data-ocid={`deduction_breakdown.item.${slice.id}`}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: chartColor(slice.color) }}
            />
            <span className="min-w-0 flex-1 truncate text-[11px] text-[oklch(var(--panel-foreground))]">
              {slice.label}
            </span>
            <span className="shrink-0 font-money text-[11px] tabular-nums text-[oklch(var(--panel-muted))]">
              {formatShare(slice.share)}
            </span>
            <span className="w-20 shrink-0 text-right font-money text-[11px] tabular-nums text-[oklch(var(--panel-foreground))]">
              {formatMoney(slice.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
