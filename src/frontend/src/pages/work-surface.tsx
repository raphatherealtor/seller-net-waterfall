import { DeductionBreakdownChart } from "@/components/charts/deduction-breakdown-chart";
import { WaterfallChart } from "@/components/charts/waterfall-chart";
import { Disclaimer } from "@/components/ui/disclaimer";
import { SectionIcon } from "@/components/ui/section-icon";
import { InputsPanel } from "@/components/work-surface/inputs-panel";
import { KpiRow } from "@/components/work-surface/kpi-row";
import { SaveRunDialog } from "@/components/work-surface/save-run-dialog";
import { ScenarioComparison } from "@/components/work-surface/scenario-comparison";
import { Waterfall } from "@/components/work-surface/waterfall";
import { formatPropertyId } from "@/lib/format";
import { useSellerNet } from "@/state/seller-net-context";
import { Save } from "lucide-react";
import { useState } from "react";

/**
 * The Seller Net work surface: a dense two-panel worksheet with the input
 * ledger on the left (~55%) and the results column on the right (~45%). The
 * results column is sticky on desktop so net proceeds stay visible while the
 * user edits inputs.
 *
 * The two-column split begins at `md` so it survives tablet widths and only
 * collapses to a single column when horizontal room genuinely runs out. On
 * mobile the results column is ordered first so net proceeds are reachable
 * without scrolling past the entire input ledger.
 *
 * The right column reads top to bottom as a financial statement: the net
 * proceeds headline and KPI summary, the live waterfall chart, the deduction
 * breakdown chart, the textual waterfall ledger, the scenario comparison
 * (chart + cards), and the planning disclaimer. Every figure comes from the
 * canonical calculator result via `useSellerNet()`; this page only composes.
 */
export function WorkSurfacePage() {
  const { propertyId, calculable, validation, calculatorVersion } =
    useSellerNet();
  const [saveOpen, setSaveOpen] = useState(false);

  return (
    <div
      data-ocid="page.work_surface"
      className="mx-auto max-w-[1600px] px-4 py-3 md:px-6 md:py-4"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="truncate font-display text-base font-semibold tracking-tight text-foreground">
              {formatPropertyId(propertyId)}
            </h1>
            <span
              title="Internal calculator identifier"
              className="hidden shrink-0 font-money text-[10px] tracking-wide text-muted-foreground/70 sm:inline"
            >
              {calculatorVersion}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {calculable
              ? "All required inputs present."
              : `${validation.missingFields.length} required field${
                  validation.missingFields.length === 1 ? "" : "s"
                } still unknown.`}
          </p>
        </div>
        <button
          type="button"
          data-ocid="work_surface.save_run_button"
          onClick={() => setSaveOpen(true)}
          disabled={!calculable}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground transition-smooth hover:bg-primary/90 focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <Save aria-hidden="true" className="size-3.5" />
          Save run
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] md:items-start">
        <div className="order-2 min-w-0 md:order-1">
          <InputsPanel />
        </div>
        <div className="order-1 min-w-0 space-y-4 md:order-2 md:sticky md:top-14">
          <KpiRow />

          <section
            data-ocid="charts.section"
            className="panel-surface overflow-hidden rounded-md shadow-subtle"
          >
            <header className="flex items-center gap-2 border-b panel-rule px-4 py-2.5">
              <SectionIcon section="waterfall" size="lg" />
              <h2 className="eyebrow text-[oklch(var(--panel-foreground))]">
                Live charts
              </h2>
            </header>
            <div className="space-y-4 px-4 py-3.5">
              <WaterfallChart />
              <div className="border-t panel-rule pt-3.5">
                <DeductionBreakdownChart />
              </div>
            </div>
          </section>

          <Waterfall />
          <ScenarioComparison />
          <Disclaimer variant="block" />
        </div>
      </div>

      <SaveRunDialog open={saveOpen} onOpenChange={setSaveOpen} />
    </div>
  );
}
