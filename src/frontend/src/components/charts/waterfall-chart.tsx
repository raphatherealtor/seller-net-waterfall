import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSellerNet } from "@/state/seller-net-context";
import { useMemo } from "react";
import {
  ChartCaption,
  ChartFigure,
  chartColor,
  formatCompactMoney,
  formatCompactMoneyWhole,
  fractionOf,
  safeValue,
} from "./chart-primitives";

/**
 * Live Seller Net waterfall — the signature visualization.
 *
 * A true financial waterfall: the Gross Sale Price column steps down through
 * each successive deduction, and every step is connected to the next by a
 * floating bar whose top edge is the running balance after that deduction. The
 * final Estimated Net Proceeds column terminates the sequence with the
 * strongest emphasis.
 *
 * Every figure is read from the canonical `SellerNetOutput` — this component
 * performs no arithmetic beyond mapping values onto geometry (running balances
 * are cumulative sums of the already-computed deduction amounts, never a
 * re-derived financial value). Bars are native SVG rects with CSS height
 * transitions, so they animate smoothly whenever an input changes the numbers.
 *
 * On mobile the chart collapses to a compact proportional rail so the labels
 * stay readable; the full stepped chart renders from `sm` upward.
 */

interface WaterfallStep {
  id: string;
  label: string;
  amount: number;
  /** A `chart-*` token name. */
  color: string;
}

/** Pixel-space geometry for the stepped SVG (labels stay legible). */
const VB_W = 340;
const VB_H = 168;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 16;
const PAD_B = 26;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;
const BASELINE = PAD_T + PLOT_H;

export function WaterfallChart() {
  const { result, isHecm } = useSellerNet();
  const { output } = result;

  const steps = useMemo<WaterfallStep[]>(() => {
    const primaryEncumbrance = isHecm
      ? (output.hecmAccruedPayoff ?? 0)
      : output.mortgagePayoff;
    return [
      {
        id: "commissions",
        label: "Commissions",
        amount: output.totalCommissions,
        color: "chart-1",
      },
      {
        id: "closing_costs",
        label: "Closing costs",
        amount: output.totalClosingCosts,
        color: "chart-2",
      },
      {
        id: "payoff",
        label: isHecm ? "HECM payoff" : "Mortgage payoff",
        amount: primaryEncumbrance,
        color: "chart-3",
      },
      {
        id: "hoa_liens",
        label: "HOA / liens",
        amount: output.totalEncumbrances - primaryEncumbrance,
        color: "chart-4",
      },
      {
        id: "seller_costs",
        label: "Seller costs",
        amount:
          output.totalDeductions -
          output.totalCommissions -
          output.totalClosingCosts -
          output.totalEncumbrances,
        color: "chart-4",
      },
      {
        id: "estimated_tax",
        label: "Estimated tax",
        amount: output.taxActive ? output.estimatedTaxOwed : 0,
        color: "chart-5",
      },
    ];
  }, [output, isHecm]);

  const gross = safeValue(output.grossPrice);
  const net = safeValue(output.estimatedNetProceeds);
  const max = Math.max(gross, net, 1);

  /**
   * The stepped geometry: a gross column, one floating deduction bar per step
   * (top edge = running balance after that deduction), and a net column. The
   * running balance is a cumulative sum of canonical deduction amounts.
   */
  const geometry = useMemo(() => {
    const slot = PLOT_W / (steps.length + 2);
    const barW = slot * 0.6;
    const xOf = (index: number) => PAD_L + slot * index + (slot - barW) / 2;
    const yOf = (value: number) => BASELINE - fractionOf(value, max) * PLOT_H;

    let balance = gross;
    const bars = steps.map((step, index) => {
      const start = balance;
      const end = balance - safeValue(step.amount);
      balance = end;
      return {
        step,
        index,
        x: xOf(index + 1),
        width: barW,
        top: yOf(Math.max(start, end)),
        height: Math.max(1, Math.abs(yOf(start) - yOf(end))),
        connectorY: yOf(end),
        balance: end,
      };
    });

    return {
      slot,
      barW,
      grossX: xOf(0),
      netX: xOf(steps.length + 1),
      grossY: yOf(gross),
      grossH: Math.max(1, BASELINE - yOf(gross)),
      netY: yOf(net),
      netH: Math.max(1, BASELINE - yOf(net)),
      bars,
    };
  }, [steps, gross, net, max]);

  const description = `Gross sale price ${formatMoney(output.grossPrice)} stepping down through ${steps
    .map((step) => `${step.label} ${formatMoney(step.amount)}`)
    .join(
      ", ",
    )} to estimated net proceeds ${formatMoney(output.estimatedNetProceeds)}.`;

  return (
    <div data-ocid="waterfall_chart.panel" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <ChartCaption>Gross to net</ChartCaption>
        <span className="font-money text-[10px] tabular-nums text-[oklch(var(--panel-muted))]">
          {formatCompactMoney(gross)} → {formatCompactMoney(net)}
        </span>
      </div>

      {/* Full stepped waterfall — sm and up */}
      <ChartFigure
        title="Seller net waterfall"
        description={description}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="hidden h-44 sm:block"
      >
        {/* Zero baseline */}
        <line
          x1={PAD_L}
          y1={BASELINE}
          x2={VB_W - PAD_R}
          y2={BASELINE}
          className="chart-baseline"
          vectorEffect="non-scaling-stroke"
        />

        {/* Gross Sale Price — the opening column */}
        <rect
          x={geometry.grossX}
          y={geometry.grossY}
          width={geometry.barW}
          height={geometry.grossH}
          fill={chartColor("chart-gross")}
          className="chart-bar"
        />
        <text
          x={geometry.grossX + geometry.barW / 2}
          y={geometry.grossY - 4}
          textAnchor="middle"
          className="chart-value"
        >
          {formatCompactMoneyWhole(gross)}
        </text>

        {/* Each deduction: a floating bar from the running balance, connected
            to the next step by a hairline at the post-deduction balance. */}
        {geometry.bars.map((bar) => (
          <g key={bar.step.id}>
            <line
              x1={bar.x + bar.width}
              y1={bar.connectorY}
              x2={bar.x + geometry.slot}
              y2={bar.connectorY}
              className="chart-connector"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={bar.x}
              y={bar.top}
              width={bar.width}
              height={bar.height}
              fill={chartColor(bar.step.color)}
              className="chart-bar"
            />
          </g>
        ))}

        {/* Estimated Net Proceeds — terminates the sequence, strongest weight */}
        <rect
          x={geometry.netX}
          y={geometry.netY}
          width={geometry.barW}
          height={geometry.netH}
          fill={chartColor("chart-net")}
          className="chart-bar"
        />
        <text
          x={geometry.netX + geometry.barW / 2}
          y={geometry.netY - 4}
          textAnchor="middle"
          className="chart-value chart-value-strong"
        >
          {formatCompactMoneyWhole(net)}
        </text>

        {/* Category labels under each column */}
        <text
          x={geometry.grossX + geometry.barW / 2}
          y={BASELINE + 11}
          textAnchor="middle"
          className="chart-axis"
        >
          Gross
        </text>
        {geometry.bars.map((bar) => (
          <text
            key={bar.step.id}
            x={bar.x + bar.width / 2}
            y={BASELINE + 11}
            textAnchor="middle"
            className="chart-axis"
          >
            {bar.step.label}
          </text>
        ))}
        <text
          x={geometry.netX + geometry.barW / 2}
          y={BASELINE + 11}
          textAnchor="middle"
          className="chart-axis chart-axis-strong"
        >
          Net
        </text>
      </ChartFigure>

      {/* Compact proportional rail — mobile only */}
      <div
        data-ocid="waterfall_chart.mobile_rail"
        className="flex h-2.5 w-full overflow-hidden rounded-sm bg-[oklch(var(--chart-track))] sm:hidden"
      >
        {steps.map((step) => (
          <span
            key={step.id}
            className="chart-bar block h-full"
            style={{
              width: `${fractionOf(step.amount, max) * 100}%`,
              backgroundColor: chartColor(step.color),
            }}
          />
        ))}
      </div>

      <ul className="space-y-1">
        {steps.map((step) => (
          <li
            key={step.id}
            data-ocid={`waterfall_chart.step.${step.id}`}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: chartColor(step.color) }}
            />
            <span className="min-w-0 flex-1 truncate text-[11px] text-[oklch(var(--panel-foreground))]">
              {step.label}
            </span>
            <span className="shrink-0 font-money text-[11px] tabular-nums text-[oklch(var(--panel-negative))]">
              {formatMoney(step.amount)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between gap-3 border-t panel-rule pt-2">
        <span className="eyebrow text-[oklch(var(--panel-foreground))]">
          Estimated net proceeds
        </span>
        <span
          data-ocid="waterfall_chart.net"
          className={cn(
            "font-money text-sm font-semibold tabular-nums",
            output.estimatedNetProceeds > 0
              ? "text-[oklch(var(--panel-positive))]"
              : "text-[oklch(var(--panel-foreground))]",
          )}
        >
          {formatMoney(output.estimatedNetProceeds)}
        </span>
      </div>
    </div>
  );
}
