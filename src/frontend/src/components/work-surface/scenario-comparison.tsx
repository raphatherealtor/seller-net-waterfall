import { ScenarioChart } from "@/components/charts/scenario-chart";
import { SectionIcon } from "@/components/ui/section-icon";
import { formatMoney, formatMoneyWhole } from "@/lib/format";
import {
  SCENARIO_DEFAULT_SPREAD,
  type ScenarioFigures,
  type ScenarioResult,
  computeScenarios,
} from "@/lib/seller-net";
import { cn } from "@/lib/utils";
import { useSellerNet } from "@/state/seller-net-context";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * Price scenario comparison: Downside / Current / Upside, rendered below the
 * main results as three compact cards — never inside the primary input form
 * and never dominating the main calculation view.
 *
 * Every figure is read from `computeScenarios()`, which itself calls the
 * canonical calculator once per scenario. This component re-derives nothing and
 * always displays the gross price the calculator actually produced; a clamped
 * scenario shows the actual price plus a short note, and an unavailable one
 * shows a reason instead of a faked target.
 */

/** Parse the raw spread draft into a non-negative dollar amount. */
function parseSpread(raw: string): number {
  const trimmed = raw.trim().replace(/[$,%\s]/g, "");
  if (trimmed === "") return SCENARIO_DEFAULT_SPREAD;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : SCENARIO_DEFAULT_SPREAD;
}

export function ScenarioComparison() {
  const { input, result } = useSellerNet();
  const [spreadDraft, setSpreadDraft] = useState(
    String(SCENARIO_DEFAULT_SPREAD),
  );

  const spread = parseSpread(spreadDraft);

  const comparison = useMemo(
    () => computeScenarios(input, result, spread),
    [input, result, spread],
  );

  return (
    <section data-ocid="scenario.section" className="surface-2 rounded-md">
      <header className="section-head flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionIcon section="scenarios" />
          <div className="min-w-0">
            <h2 className="eyebrow truncate text-foreground">
              Price Scenario Comparison
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Downside and upside around the current price — same calculator,
              nothing estimated.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="scenario-spread"
            className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Spread
          </label>
          <div className="flex h-7 items-center gap-1 rounded-sm border border-input bg-card px-2 transition-smooth focus-within:ring-1 focus-within:ring-ring">
            <span
              aria-hidden="true"
              className="font-money text-xs text-muted-foreground"
            >
              $
            </span>
            <input
              id="scenario-spread"
              data-ocid="scenario.spread_input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={spreadDraft}
              onChange={(event) => setSpreadDraft(event.target.value)}
              className="h-full w-16 min-w-0 bg-transparent text-right font-money text-xs tabular-nums text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
      </header>

      <div className="border-b border-border px-3.5 py-2.5">
        <ScenarioChart scenarios={comparison.scenarios} />
      </div>

      <div className="grid grid-cols-1 gap-2 px-3.5 py-2.5 md:grid-cols-3">
        {comparison.scenarios.map((scenario) => (
          <ScenarioColumn key={scenario.key} scenario={scenario} />
        ))}
      </div>
    </section>
  );
}

function ScenarioColumn({ scenario }: { scenario: ScenarioResult }) {
  const isCurrent = scenario.key === "current";

  return (
    <article
      data-ocid={`scenario.column.${scenario.key}`}
      className={cn(
        "surface-3 rounded-sm px-2.5 py-2",
        isCurrent && "border-foreground/40",
      )}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
        <h3 className="eyebrow text-foreground">{scenario.label}</h3>
        {isCurrent ? (
          <span className="font-money text-[10px] uppercase tracking-wider text-muted-foreground">
            Baseline
          </span>
        ) : null}
      </header>

      {scenario.available && scenario.figures ? (
        <ScenarioFiguresList
          figures={scenario.figures}
          deltaVsCurrent={scenario.deltaVsCurrent}
          clamped={scenario.clamped}
          reason={scenario.reason}
        />
      ) : (
        <div
          data-ocid={`scenario.unavailable.${scenario.key}`}
          className="mt-2 flex items-start gap-1.5 rounded-sm border border-warning/40 bg-warning/10 px-2 py-1.5"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-foreground"
          />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-foreground">
              Scenario unavailable
            </span>
            <span className="block text-[11px] leading-relaxed text-muted-foreground">
              {scenario.reason || "This scenario could not be calculated."}
            </span>
          </span>
        </div>
      )}
    </article>
  );
}

function ScenarioFiguresList({
  figures,
  deltaVsCurrent,
  clamped,
  reason,
}: {
  figures: ScenarioFigures;
  deltaVsCurrent: number | null;
  clamped: boolean;
  reason: string;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Gross price
        </span>
        <span className="font-money text-xs font-semibold tabular-nums text-foreground">
          {formatMoney(figures.grossPrice)}
        </span>
      </div>

      {clamped ? (
        <p className="rounded-sm border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] leading-relaxed text-foreground">
          {reason}
        </p>
      ) : null}

      <dl className="space-y-0.5 border-t border-border pt-1.5">
        <ScenarioRow
          label="Commissions"
          value={formatMoney(figures.commissions)}
        />
        <ScenarioRow
          label="Closing costs"
          value={formatMoney(figures.closingCosts)}
        />
        <ScenarioRow
          label="Mortgage / HECM payoff"
          value={formatMoney(figures.mortgagePayoff)}
        />
        <ScenarioRow
          label="HOA / liens"
          value={formatMoney(figures.hoaAndLiens)}
        />
        <ScenarioRow
          label="Seller costs"
          value={formatMoney(figures.sellerCosts)}
        />
        {figures.estimatedTax !== null ? (
          <ScenarioRow
            label="Estimated tax"
            value={formatMoney(figures.estimatedTax)}
          />
        ) : null}
      </dl>

      <div className="flex items-baseline justify-between gap-3 border-t-2 border-foreground/70 pt-1.5">
        <span className="eyebrow text-foreground">Estimated net proceeds</span>
        <span
          data-ocid="scenario.net_proceeds"
          className={cn(
            "font-money text-xs font-semibold tabular-nums",
            figures.estimatedNetProceeds > 0
              ? "text-success"
              : "text-foreground",
          )}
        >
          {formatMoney(figures.estimatedNetProceeds)}
        </span>
      </div>

      {figures.frictionNet !== null ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            Net after market / time friction
          </span>
          <span className="font-money text-[11px] tabular-nums text-foreground">
            {formatMoney(figures.frictionNet)}
          </span>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
        <span className="text-[11px] text-muted-foreground">
          Delta vs Current
        </span>
        <span
          data-ocid="scenario.delta"
          className={cn(
            "font-money text-[11px] font-medium tabular-nums",
            deltaVsCurrent !== null && deltaVsCurrent < 0
              ? "text-destructive"
              : "text-foreground",
          )}
        >
          {deltaVsCurrent === null
            ? "—"
            : `${deltaVsCurrent > 0 ? "+" : ""}${formatMoneyWhole(deltaVsCurrent)}`}
        </span>
      </div>
    </div>
  );
}

function ScenarioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-money text-[11px] tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
