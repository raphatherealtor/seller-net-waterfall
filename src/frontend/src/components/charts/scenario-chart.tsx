import { formatMoney, formatMoneyWhole } from "@/lib/format";
import type { ScenarioResult } from "@/lib/seller-net";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import {
  ChartCaption,
  ChartFigure,
  chartColor,
  formatCompactMoneyWhole,
  fractionOf,
  safeValue,
} from "./chart-primitives";

/**
 * Net-proceeds comparison for Downside / Current / Upside, drawn as a native
 * SVG bar chart.
 *
 * Every figure comes from the `computeScenarios()` output passed in as props —
 * this component re-derives nothing. Current is visually highlighted, and when
 * the friction module is active each scenario shows a friction-adjusted net
 * marker positioned against the same scale.
 */

const VB_W = 340;
const VB_H = 150;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 14;
const PAD_B = 22;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;
const BASELINE = PAD_T + PLOT_H;

export function ScenarioChart({
  scenarios,
}: {
  scenarios: ScenarioResult[];
}) {
  const max = useMemo(() => {
    let highest = 1;
    for (const scenario of scenarios) {
      if (!scenario.figures) continue;
      highest = Math.max(
        highest,
        safeValue(scenario.figures.estimatedNetProceeds),
        safeValue(scenario.figures.frictionNet),
      );
    }
    return highest;
  }, [scenarios]);

  const frictionActive = scenarios.some(
    (scenario) => scenario.figures?.frictionNet !== null,
  );

  const geometry = useMemo(() => {
    const slot = PLOT_W / Math.max(scenarios.length, 1);
    const barW = slot * 0.52;
    const yOf = (value: number) => BASELINE - fractionOf(value, max) * PLOT_H;
    return {
      slot,
      barW,
      yOf,
      bars: scenarios.map((scenario, index) => {
        const figures = scenario.figures;
        const net = figures ? safeValue(figures.estimatedNetProceeds) : 0;
        const frictionNet = figures?.frictionNet ?? null;
        const x = PAD_L + slot * index + (slot - barW) / 2;
        return {
          scenario,
          x,
          centerX: x + barW / 2,
          top: yOf(net),
          height: Math.max(1, BASELINE - yOf(net)),
          frictionX:
            frictionNet !== null
              ? x + fractionOf(safeValue(frictionNet), max) * barW
              : null,
        };
      }),
    };
  }, [scenarios, max]);

  const description = `Estimated net proceeds by scenario: ${scenarios
    .map((scenario) =>
      scenario.figures
        ? `${scenario.label} ${formatMoney(scenario.figures.estimatedNetProceeds)}`
        : `${scenario.label} unavailable`,
    )
    .join(", ")}.`;

  return (
    <div data-ocid="scenario_chart.panel" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <ChartCaption>Net proceeds by scenario</ChartCaption>
        {frictionActive ? (
          <span className="font-money text-[10px] tabular-nums text-[oklch(var(--panel-muted))]">
            ◆ friction-adjusted
          </span>
        ) : null}
      </div>

      <ChartFigure
        title="Net proceeds by scenario"
        description={description}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-32"
      >
        <line
          x1={PAD_L}
          y1={BASELINE}
          x2={VB_W - PAD_R}
          y2={BASELINE}
          className="chart-baseline"
          vectorEffect="non-scaling-stroke"
        />

        {geometry.bars.map((bar) => {
          const isCurrent = bar.scenario.key === "current";
          return (
            <g key={bar.scenario.key}>
              {bar.scenario.figures ? (
                <rect
                  x={bar.x}
                  y={bar.top}
                  width={geometry.barW}
                  height={bar.height}
                  fill={chartColor(isCurrent ? "chart-net" : "chart-1")}
                  opacity={isCurrent ? 1 : 0.72}
                  className="chart-bar"
                />
              ) : null}
              {bar.frictionX !== null ? (
                <line
                  x1={bar.frictionX}
                  y1={PAD_T}
                  x2={bar.frictionX}
                  y2={BASELINE}
                  className="chart-friction"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <text
                x={bar.centerX}
                y={BASELINE + 11}
                textAnchor="middle"
                className={cn("chart-axis", isCurrent && "chart-axis-strong")}
              >
                {bar.scenario.label}
              </text>
            </g>
          );
        })}
      </ChartFigure>

      <ul className="space-y-1.5">
        {scenarios.map((scenario) => (
          <ScenarioRow
            key={scenario.key}
            scenario={scenario}
            max={max}
            frictionActive={frictionActive}
          />
        ))}
      </ul>
    </div>
  );
}

function ScenarioRow({
  scenario,
  max,
  frictionActive,
}: {
  scenario: ScenarioResult;
  max: number;
  frictionActive: boolean;
}) {
  const isCurrent = scenario.key === "current";
  const figures = scenario.figures;
  const net = figures ? safeValue(figures.estimatedNetProceeds) : 0;
  const frictionNet = figures?.frictionNet ?? null;

  return (
    <li
      data-ocid={`scenario_chart.bar.${scenario.key}`}
      className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2"
    >
      <span
        className={cn(
          "truncate text-[11px]",
          isCurrent
            ? "font-semibold text-[oklch(var(--panel-foreground))]"
            : "text-[oklch(var(--panel-muted))]",
        )}
      >
        {scenario.label}
      </span>

      <span className="relative block h-3 w-full overflow-hidden rounded-sm bg-[oklch(var(--chart-track))]">
        {figures ? (
          <span
            className="chart-bar block h-full"
            style={{
              width: `${fractionOf(net, max) * 100}%`,
              backgroundColor: chartColor(isCurrent ? "chart-net" : "chart-1"),
              opacity: isCurrent ? 1 : 0.72,
            }}
          />
        ) : null}
        {frictionNet !== null ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-[oklch(var(--panel-foreground))]"
            style={{
              left: `${fractionOf(safeValue(frictionNet), max) * 100}%`,
            }}
          />
        ) : null}
      </span>

      <span
        className={cn(
          "w-20 text-right font-money text-[11px] tabular-nums",
          isCurrent
            ? "font-semibold text-[oklch(var(--panel-foreground))]"
            : "text-[oklch(var(--panel-muted))]",
        )}
      >
        {figures ? formatMoney(net) : "—"}
      </span>

      {frictionActive ? (
        <span className="col-start-2 col-end-4 -mt-1 font-money text-[10px] tabular-nums text-[oklch(var(--panel-muted))]">
          {frictionNet !== null
            ? `◆ ${formatMoneyWhole(frictionNet)} after friction`
            : "◆ friction not active"}
        </span>
      ) : null}
    </li>
  );
}
