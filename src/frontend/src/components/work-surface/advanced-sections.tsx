import { MoneyInput } from "@/components/ui/money-input";
import { SectionIcon, type SectionIconKey } from "@/components/ui/section-icon";
import {
  FrictionFields,
  FrictionResultRows,
} from "@/components/work-surface/friction-section";
import { formatMoney } from "@/lib/format";
import {
  SECTION_121_EXEMPTIONS,
  SECTION_121_STATUSES,
  SELLER_NET_CONFIG,
  type Section121Status,
} from "@/lib/seller-net";
import { cn } from "@/lib/utils";
import { useSellerNet } from "@/state/seller-net-context";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

/**
 * The collapsible advanced input groups. Each section is a disclosure with a
 * real toggle button; the fields inside are ordinary provenanced inputs bound
 * to the shared context.
 *
 * Presentation-only: closed groups are a single compact eyebrow row, collapsed
 * by default. Related fields pair into two-column rows on wider panels.
 */

/** Human labels for the Section 121 statuses, in canonical order. */
const SECTION_121_LABELS: Record<Section121Status, string> = {
  UNKNOWN: "Not sure",
  NONE: "None",
  SINGLE: "Single",
  MARRIED: "Married",
};

/** Two related fields side by side; stacks below the sm breakpoint. */
function FieldPair({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
      {children}
    </div>
  );
}

interface AdvancedSectionProps {
  title: string;
  meta: string;
  /** Canonical section key selecting the header's dimensional icon badge. */
  icon: SectionIconKey;
  open: boolean;
  onToggle: () => void;
  ocid: string;
  children: ReactNode;
}

function AdvancedSection({
  title,
  meta,
  icon,
  open,
  onToggle,
  ocid,
  children,
}: AdvancedSectionProps) {
  return (
    <section
      data-ocid={ocid}
      className="overflow-hidden rounded-sm border border-border bg-card shadow-subtle"
    >
      <h2>
        <button
          type="button"
          data-ocid={`${ocid}.toggle`}
          aria-expanded={open}
          onClick={onToggle}
          className="section-head flex w-full items-center justify-between gap-3 px-3.5 py-1.5 text-left outline-none transition-smooth hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SectionIcon section={icon} />
            <span className="eyebrow truncate text-foreground">{title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-money text-[10px] uppercase tracking-wider text-muted-foreground">
              {meta}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-3 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </span>
        </button>
      </h2>
      {open ? (
        <div className="space-y-2.5 border-t border-border px-3.5 py-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function AdvancedSections() {
  const {
    drafts,
    fields,
    setField,
    conditionTier,
    setConditionTier,
    mortgagePayoffMode,
    setMortgagePayoffMode,
    isHecm,
    setIsHecm,
    section121Status,
    setSection121Status,
    result,
    validation,
  } = useSellerNet();

  const [closingOpen, setClosingOpen] = useState(false);
  const [hoaOpen, setHoaOpen] = useState(false);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [hecmOpen, setHecmOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [frictionOpen, setFrictionOpen] = useState(false);

  const taxActive = result.output.taxActive;
  const frictionActive = result.output.frictionActive;

  const issueFor = (key: string): string | undefined =>
    validation.issues.find((issue) => issue.field === key)?.message;

  const missing = new Set(validation.missingFields);

  return (
    <div className="space-y-2.5" data-ocid="inputs.advanced">
      <AdvancedSection
        title="Closing Cost Assumptions"
        meta="Rates & fees"
        icon="closing_costs"
        ocid="inputs.closing_costs"
        open={closingOpen}
        onToggle={() => setClosingOpen((current) => !current)}
      >
        <FieldPair>
          <MoneyInput
            label="Escrow fee rate"
            data-ocid="inputs.escrow_rate"
            value={drafts.escrowRateBps}
            onChange={(value) => setField("escrowRateBps", value)}
            provenance={fields.escrowRateBps.provenance}
            prefix=""
            suffix="bps"
            inputMode="numeric"
            error={issueFor("escrowRateBps")}
            hint={
              missing.has("escrowRateBps")
                ? "Required — enter the escrow rate in basis points."
                : `Default assumption: ${SELLER_NET_CONFIG.escrowRateBps} bps.`
            }
          />
          <MoneyInput
            label="Title fee rate"
            data-ocid="inputs.title_rate"
            value={drafts.titleRateBps}
            onChange={(value) => setField("titleRateBps", value)}
            provenance={fields.titleRateBps.provenance}
            prefix=""
            suffix="bps"
            inputMode="numeric"
            error={issueFor("titleRateBps")}
            hint={
              missing.has("titleRateBps")
                ? "Required — enter the title rate in basis points."
                : `Default assumption: ${SELLER_NET_CONFIG.titleRateBps} bps.`
            }
          />
        </FieldPair>

        <FieldPair>
          <MoneyInput
            label="Transfer tax rate"
            data-ocid="inputs.transfer_tax_rate"
            value={drafts.transferTaxRateBps}
            onChange={(value) => setField("transferTaxRateBps", value)}
            provenance={fields.transferTaxRateBps.provenance}
            prefix=""
            suffix="bps"
            inputMode="numeric"
            error={issueFor("transferTaxRateBps")}
            hint={
              missing.has("transferTaxRateBps")
                ? "Required — enter the transfer tax rate in basis points."
                : `Default assumption: ${SELLER_NET_CONFIG.transferTaxRateBps} bps.`
            }
          />
          <MoneyInput
            label="Recording fees"
            data-ocid="inputs.recording_fees"
            value={drafts.recordingFees}
            onChange={(value) => setField("recordingFees", value)}
            provenance={fields.recordingFees.provenance}
            error={issueFor("recordingFees")}
            hint={
              missing.has("recordingFees")
                ? "Required — enter the flat recording fees."
                : `Default assumption: $${SELLER_NET_CONFIG.recordingFees}.`
            }
          />
        </FieldPair>

        <FieldPair>
          <MoneyInput
            label="Home warranty"
            data-ocid="inputs.home_warranty"
            value={drafts.homeWarranty}
            onChange={(value) => setField("homeWarranty", value)}
            provenance={fields.homeWarranty.provenance}
            error={issueFor("homeWarranty")}
            hint={
              missing.has("homeWarranty")
                ? "Required — enter 0 if none."
                : `Default assumption: $${SELLER_NET_CONFIG.homeWarranty}.`
            }
          />
          <MoneyInput
            label="Tax days elapsed at closing"
            data-ocid="inputs.tax_days"
            value={drafts.taxDaysElapsed}
            onChange={(value) => setField("taxDaysElapsed", value)}
            provenance={fields.taxDaysElapsed.provenance}
            prefix=""
            suffix="days"
            inputMode="numeric"
            error={issueFor("taxDaysElapsed")}
            hint={
              missing.has("taxDaysElapsed")
                ? "Required — enter the days of the tax year elapsed."
                : `Prorated over ${SELLER_NET_CONFIG.taxYearDays} days.`
            }
          />
        </FieldPair>
      </AdvancedSection>

      <AdvancedSection
        title="HOA / Liens"
        meta="Encumbrances"
        icon="hoa_liens"
        ocid="inputs.hoa_liens"
        open={hoaOpen}
        onToggle={() => setHoaOpen((current) => !current)}
      >
        <FieldPair>
          <MoneyInput
            label="HOA payoff"
            data-ocid="inputs.hoa_payoff"
            value={drafts.hoaPayoff}
            onChange={(value) => setField("hoaPayoff", value)}
            provenance={fields.hoaPayoff.provenance}
            error={issueFor("hoaPayoff")}
            hint={
              missing.has("hoaPayoff")
                ? "Required — enter 0 if none."
                : undefined
            }
          />
          <MoneyInput
            label="Liens / judgments"
            data-ocid="inputs.liens_judgments"
            value={drafts.liensJudgments}
            onChange={(value) => setField("liensJudgments", value)}
            provenance={fields.liensJudgments.provenance}
            error={issueFor("liensJudgments")}
            hint={
              missing.has("liensJudgments")
                ? "Required — enter 0 if none."
                : undefined
            }
          />
        </FieldPair>
      </AdvancedSection>

      <AdvancedSection
        title="Condition / Renovation"
        meta="Price & spend"
        icon="condition_renovation"
        ocid="inputs.condition_renovation"
        open={conditionOpen}
        onToggle={() => setConditionOpen((current) => !current)}
      >
        <MoneyInput
          label="Manual adjusted price"
          data-ocid="inputs.manual_adjusted_price"
          value={drafts.manualAdjustedPrice}
          onChange={(value) => setField("manualAdjustedPrice", value)}
          provenance={fields.manualAdjustedPrice.provenance}
          error={issueFor("manualAdjustedPrice")}
          hint="When greater than 0, overrides the base price and disables the condition adjustment."
        />

        <FieldPair>
          <MoneyInput
            label="Renovation spend"
            data-ocid="inputs.renovation_cost"
            value={drafts.renovationCost}
            onChange={(value) => setField("renovationCost", value)}
            provenance={fields.renovationCost.provenance}
            error={issueFor("renovationCost")}
            hint={
              missing.has("renovationCost")
                ? "Required — enter 0 if none."
                : `Lifted by ×${SELLER_NET_CONFIG.renovationMultiplier} into the gross price.`
            }
          />
          <MoneyInput
            label="Staging / photography"
            data-ocid="inputs.staging_photo"
            value={drafts.stagingPhotoCost}
            onChange={(value) => setField("stagingPhotoCost", value)}
            provenance={fields.stagingPhotoCost.provenance}
            error={issueFor("stagingPhotoCost")}
            hint={
              missing.has("stagingPhotoCost")
                ? "Required — enter 0 if none."
                : undefined
            }
          />
        </FieldPair>

        <fieldset className="space-y-1">
          <legend className="text-[11px] font-medium text-muted-foreground">
            Condition tier
          </legend>
          <div className="inline-grid grid-cols-3 gap-0.5 rounded-sm border border-input bg-muted/40 p-0.5">
            {(["NEEDS_WORK", "GOOD", "TURNKEY_10_PLUS"] as const).map(
              (tier) => {
                const active = conditionTier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    data-ocid={`inputs.condition_tier.${tier.toLowerCase()}`}
                    aria-pressed={active}
                    onClick={() => setConditionTier(tier)}
                    className={cn(
                      "h-6 rounded-sm px-2 text-[11px] font-medium transition-smooth outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      active
                        ? "bg-card text-foreground shadow-subtle"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tier === "NEEDS_WORK"
                      ? "Needs work"
                      : tier === "GOOD"
                        ? "Good"
                        : "Turnkey 10+"}
                  </button>
                );
              },
            )}
          </div>
        </fieldset>

        {isHecm ? (
          <p
            data-ocid="inputs.mortgage_disabled_notice"
            className="rounded-sm border border-border bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
          >
            Standard mortgage payoff is disabled while the HECM projection is
            active. Turn off “Use HECM Projection” to restore the standard
            mortgage workflow.
          </p>
        ) : (
          <>
            <fieldset className="space-y-1">
              <legend className="text-[11px] font-medium text-muted-foreground">
                Mortgage payoff mode
              </legend>
              <div className="inline-grid grid-cols-2 gap-0.5 rounded-sm border border-input bg-muted/40 p-0.5">
                {(["VERIFIED_PAYOFF", "ESTIMATE"] as const).map((mode) => {
                  const active = mortgagePayoffMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      data-ocid={`inputs.payoff_mode.${mode.toLowerCase()}`}
                      aria-pressed={active}
                      onClick={() => setMortgagePayoffMode(mode)}
                      className={cn(
                        "h-6 rounded-sm px-2 text-[11px] font-medium transition-smooth outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        active
                          ? "bg-card text-foreground shadow-subtle"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {mode === "VERIFIED_PAYOFF"
                        ? "Verified payoff"
                        : "Estimate"}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {mortgagePayoffMode === "ESTIMATE" ? (
              <FieldPair>
                <MoneyInput
                  label="Mortgage rate"
                  data-ocid="inputs.mortgage_rate"
                  value={drafts.mortgageRateBps}
                  onChange={(value) => setField("mortgageRateBps", value)}
                  provenance={fields.mortgageRateBps.provenance}
                  prefix=""
                  suffix="bps"
                  inputMode="numeric"
                  error={issueFor("mortgageRateBps")}
                  hint="Used only in estimate mode."
                />
                <MoneyInput
                  label="Months of interest remaining"
                  data-ocid="inputs.mortgage_months"
                  value={drafts.mortgageMonthsRemaining}
                  onChange={(value) =>
                    setField("mortgageMonthsRemaining", value)
                  }
                  provenance={fields.mortgageMonthsRemaining.provenance}
                  prefix=""
                  suffix="mo"
                  inputMode="numeric"
                  error={issueFor("mortgageMonthsRemaining")}
                  hint="Whole months of simple interest accrued."
                />
              </FieldPair>
            ) : null}
          </>
        )}
      </AdvancedSection>

      <AdvancedSection
        title="HECM / Reverse Mortgage"
        meta="Reverse mortgage"
        icon="hecm"
        ocid="inputs.hecm"
        open={hecmOpen}
        onToggle={() => setHecmOpen((current) => !current)}
      >
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="hecm-projection-switch"
            className="text-[11px] font-medium text-muted-foreground"
          >
            Use HECM Projection
          </label>
          <button
            id="hecm-projection-switch"
            type="button"
            role="switch"
            aria-checked={isHecm}
            data-ocid="inputs.hecm.switch"
            onClick={() => setIsHecm(!isHecm)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-smooth outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isHecm ? "border-primary bg-primary" : "border-input bg-muted/60",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "block size-3.5 rounded-full bg-card shadow-subtle transition-transform duration-200",
                isHecm ? "translate-x-[18px]" : "translate-x-[3px]",
              )}
            />
          </button>
        </div>

        {isHecm ? (
          <>
            <p className="rounded-sm border border-prov-estimate/40 bg-prov-estimate/10 px-2.5 py-2 text-[11px] leading-relaxed text-foreground">
              Projected HECM balance — ESTIMATE. Verify with lender.
            </p>
            <FieldPair>
              <MoneyInput
                label="HECM initial balance"
                data-ocid="inputs.hecm_initial_balance"
                value={drafts.hecmInitialBalance}
                onChange={(value) => setField("hecmInitialBalance", value)}
                provenance={fields.hecmInitialBalance.provenance}
                error={issueFor("hecmInitialBalance")}
                hint={
                  missing.has("hecmInitialBalance")
                    ? "Required — enter the HECM origination balance."
                    : "Balance at HECM origination."
                }
              />
              <MoneyInput
                label="HECM current rate"
                data-ocid="inputs.hecm_current_rate"
                value={drafts.hecmCurrentRateBps}
                onChange={(value) => setField("hecmCurrentRateBps", value)}
                provenance={fields.hecmCurrentRateBps.provenance}
                prefix=""
                suffix="bps"
                inputMode="numeric"
                error={issueFor("hecmCurrentRateBps")}
                hint={
                  missing.has("hecmCurrentRateBps")
                    ? "Required — enter the current accrual rate in basis points."
                    : "Current accrual rate, 0–10000 bps."
                }
              />
            </FieldPair>
            <FieldPair>
              <MoneyInput
                label="HECM months elapsed"
                data-ocid="inputs.hecm_months_elapsed"
                value={drafts.hecmMonthsElapsed}
                onChange={(value) => setField("hecmMonthsElapsed", value)}
                provenance={fields.hecmMonthsElapsed.provenance}
                prefix=""
                suffix="mo"
                inputMode="numeric"
                error={issueFor("hecmMonthsElapsed")}
                hint={
                  missing.has("hecmMonthsElapsed")
                    ? "Required — enter whole months since origination."
                    : "Whole months since HECM origination."
                }
              />
              <MoneyInput
                label="HECM lifetime cap (optional)"
                data-ocid="inputs.hecm_lifetime_cap"
                value={drafts.hecmLifetimeCapBps}
                onChange={(value) => setField("hecmLifetimeCapBps", value)}
                provenance={fields.hecmLifetimeCapBps.provenance}
                prefix=""
                suffix="bps"
                inputMode="numeric"
                error={issueFor("hecmLifetimeCapBps")}
                hint="Optional — leave blank when no cap applies."
              />
            </FieldPair>
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Off — the standard mortgage payoff workflow applies. Turn the switch
            on to project an accruing HECM balance instead.
          </p>
        )}
      </AdvancedSection>

      <AdvancedSection
        title="Capital Gains / Section 121"
        meta={taxActive ? "Active" : "Optional"}
        icon="capital_gains"
        ocid="inputs.capital_gains"
        open={taxOpen}
        onToggle={() => setTaxOpen((current) => !current)}
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Optional. Entering any value below activates the estimate; once
          active, every field here is required. Leave all fields untouched to
          keep capital-gains tax out of the waterfall.
        </p>

        <FieldPair>
          <MoneyInput
            label="Original purchase price"
            data-ocid="inputs.original_purchase_price"
            value={drafts.originalPurchasePrice}
            onChange={(value) => setField("originalPurchasePrice", value)}
            provenance={fields.originalPurchasePrice.provenance}
            error={issueFor("originalPurchasePrice")}
            hint={
              missing.has("originalPurchasePrice")
                ? "Required — enter the original purchase price."
                : "Basis before improvements."
            }
          />
          <MoneyInput
            label="Capital improvements"
            data-ocid="inputs.capital_improvements"
            value={drafts.capitalImprovements}
            onChange={(value) => setField("capitalImprovements", value)}
            provenance={fields.capitalImprovements.provenance}
            error={issueFor("capitalImprovements")}
            hint={
              missing.has("capitalImprovements")
                ? "Required — enter 0 if none."
                : "An explicit 0 is a valid value."
            }
          />
        </FieldPair>

        <fieldset className="space-y-1">
          <legend className="text-[11px] font-medium text-muted-foreground">
            Section 121 status
          </legend>
          <div className="inline-grid grid-cols-4 gap-0.5 rounded-sm border border-input bg-muted/40 p-0.5">
            {SECTION_121_STATUSES.map((status) => {
              const active = section121Status === status;
              return (
                <button
                  key={status}
                  type="button"
                  data-ocid={`inputs.section_121.${status.toLowerCase()}`}
                  aria-pressed={active}
                  onClick={() => setSection121Status(status)}
                  className={cn(
                    "h-6 rounded-sm px-2 text-[11px] font-medium transition-smooth outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    active
                      ? "bg-card text-foreground shadow-subtle"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {SECTION_121_LABELS[status]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {section121Status === "UNKNOWN"
              ? "Choose a status to run the estimate — it is never assumed to be None."
              : `Exclusion applied: ${formatMoney(
                  SECTION_121_EXEMPTIONS[section121Status],
                )}.`}
          </p>
        </fieldset>

        <MoneyInput
          label="Estimated capital-gains tax rate"
          data-ocid="inputs.capital_gains_tax_rate"
          value={drafts.estimatedCapitalGainsTaxRateBps}
          onChange={(value) =>
            setField("estimatedCapitalGainsTaxRateBps", value)
          }
          provenance={fields.estimatedCapitalGainsTaxRateBps.provenance}
          prefix=""
          suffix="bps"
          inputMode="numeric"
          error={issueFor("estimatedCapitalGainsTaxRateBps")}
          hint={
            missing.has("estimatedCapitalGainsTaxRateBps")
              ? "Required — enter the estimated rate in basis points."
              : "1 bp = 0.01%. An explicit 0 is a valid value."
          }
        />

        {taxActive ? (
          <div
            data-ocid="inputs.tax_results"
            className="space-y-1.5 rounded-sm border border-border bg-muted/30 px-3 py-2.5"
          >
            <p className="eyebrow text-muted-foreground">
              Estimated tax figures
            </p>
            <dl className="space-y-1">
              <TaxResultRow
                label="Adjusted basis"
                value={formatMoney(result.output.adjustedBasis)}
              />
              <TaxResultRow
                label="Capital gain"
                value={formatMoney(result.output.capitalGain)}
              />
              <TaxResultRow
                label="Section 121 exclusion"
                value={formatMoney(result.output.section121Exemption)}
              />
              <TaxResultRow
                label="Taxable gain"
                value={formatMoney(result.output.taxableGain)}
              />
              <TaxResultRow
                label="Estimated capital-gains tax"
                value={formatMoney(result.output.estimatedTaxOwed)}
                emphasis
              />
            </dl>
            {result.output.section121EligibilityAssumed ? (
              <p className="border-t border-border pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                A Section 121 exclusion is assumed based on the status you
                selected. Eligibility is not determined here — confirm with a
                CPA.
              </p>
            ) : null}
          </div>
        ) : null}
      </AdvancedSection>

      <AdvancedSection
        title="Market / Time Friction"
        meta={frictionActive ? "Active" : "Optional"}
        icon="market_friction"
        ocid="inputs.market_friction"
        open={frictionOpen}
        onToggle={() => setFrictionOpen((current) => !current)}
      >
        <FrictionFields />
        {frictionActive ? <FrictionResultRows /> : null}
      </AdvancedSection>
    </div>
  );
}

function TaxResultRow({
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
