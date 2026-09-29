import { MoneyInput } from "@/components/ui/money-input";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSellerNet } from "@/state/seller-net-context";

/**
 * The Market / Time Friction advanced group's field set and its supplemental
 * result rows.
 *
 * The three inputs are ordinary provenanced fields bound to the shared context,
 * exactly like every other advanced group. The result rows are read straight
 * from the canonical calculator output and are shown only while the friction
 * module is active — they are SUPPLEMENTAL and never replace or relabel the
 * primary Estimated Net Proceeds.
 *
 * Presentation-only: field rows pair into two-column rows on wider panels and
 * the supplemental rows use the same dense ledger rhythm as the rest of the
 * panel.
 */

export function FrictionFields() {
  const { drafts, fields, setField, validation } = useSellerNet();

  const issueFor = (key: string): string | undefined =>
    validation.issues.find((issue) => issue.field === key)?.message;

  const missing = new Set(validation.missingFields);

  return (
    <>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Optional. Entering any value below activates the estimate; once active,
        every field here is required. Leave all fields untouched to keep market
        / time friction out of the results.
      </p>

      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
        <MoneyInput
          label="Monthly carrying cost"
          data-ocid="inputs.monthly_carrying_cost"
          value={drafts.monthlyCarryingCost}
          onChange={(value) => setField("monthlyCarryingCost", value)}
          provenance={fields.monthlyCarryingCost.provenance}
          error={issueFor("monthlyCarryingCost")}
          hint={
            missing.has("monthlyCarryingCost")
              ? "Required — enter the monthly carrying cost."
              : "Taxes, insurance, utilities, and upkeep per month."
          }
        />
        <MoneyInput
          label="Expected days on market"
          data-ocid="inputs.expected_dom"
          value={drafts.pctExpectedDom}
          onChange={(value) => setField("pctExpectedDom", value)}
          provenance={fields.pctExpectedDom.provenance}
          prefix=""
          suffix="days"
          inputMode="numeric"
          error={issueFor("pctExpectedDom")}
          hint={
            missing.has("pctExpectedDom")
              ? "Required — enter the expected days on market."
              : "Whole days the property is expected to sit."
          }
        />
      </div>

      <MoneyInput
        label="Expected price discount"
        data-ocid="inputs.expected_discount"
        value={drafts.pctExpectedDiscountPct}
        onChange={(value) => setField("pctExpectedDiscountPct", value)}
        provenance={fields.pctExpectedDiscountPct.provenance}
        prefix=""
        suffix="fraction"
        inputMode="decimal"
        error={issueFor("pctExpectedDiscountPct")}
        hint={
          missing.has("pctExpectedDiscountPct")
            ? "Required — enter the expected discount as a decimal (0.05 = 5%)."
            : "Decimal fraction — 0.05 = 5%, 0.10 = 10%."
        }
      />
    </>
  );
}

/**
 * The three supplemental friction result rows. Rendered only while the friction
 * module is active; the caller owns that gate so the rows never appear in the
 * primary waterfall.
 */
export function FrictionResultRows() {
  const { result } = useSellerNet();
  const { output } = result;

  return (
    <div
      data-ocid="friction.results"
      className="space-y-1.5 rounded-sm border border-border bg-muted/30 px-3 py-2.5"
    >
      <p className="eyebrow text-muted-foreground">
        Market / time friction — supplemental
      </p>
      <dl className="space-y-1">
        <FrictionRow
          label="Carrying loss"
          value={formatMoney(output.carryingLoss)}
        />
        <FrictionRow
          label="Stale discount loss"
          value={formatMoney(output.staleDiscountLoss)}
        />
        <FrictionRow
          label="Net after market / time friction"
          value={formatMoney(output.probabilisticTrueNet)}
          emphasis
        />
      </dl>
      <p className="border-t border-border pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        Supplemental projection applied after estimated net proceeds. It does
        not replace the primary Estimated Net Proceeds figure.
      </p>
    </div>
  );
}

function FrictionRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={cn(
          "text-[11px]",
          emphasis ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "font-money text-[11px] tabular-nums",
          emphasis ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
