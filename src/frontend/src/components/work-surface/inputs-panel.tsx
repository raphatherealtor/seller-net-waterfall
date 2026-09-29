import { MoneyInput } from "@/components/ui/money-input";
import { SectionCard } from "@/components/ui/section-card";
import { SectionIcon } from "@/components/ui/section-icon";
import { AdvancedSections } from "@/components/work-surface/advanced-sections";
import { CONDITION_TIER_LABELS, type ConditionTier } from "@/lib/seller-net";
import { cn } from "@/lib/utils";
import { useSellerNet } from "@/state/seller-net-context";
import { RotateCcw } from "lucide-react";

/**
 * Left panel of the work surface: the property identifier, the always-visible
 * primary inputs, and the collapsible advanced sections.
 *
 * Every value is a raw string draft owned by the shared context; this panel
 * never parses or computes. Provenance is set by typing and refined with the
 * per-field actions.
 *
 * Presentation-only: related fields pair into two-column rows on wider panels
 * and stack on narrow ones. No field is forced to full page width.
 */

const CONDITION_TIERS: ConditionTier[] = [
  "NEEDS_WORK",
  "GOOD",
  "TURNKEY_10_PLUS",
];

/** Two related fields side by side; stacks below the sm breakpoint. */
function FieldPair({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
      {children}
    </div>
  );
}

export function InputsPanel() {
  const {
    propertyId,
    setPropertyId,
    drafts,
    fields,
    setField,
    clearField,
    markEstimate,
    markVerified,
    conditionTier,
    setConditionTier,
    validation,
    reset,
  } = useSellerNet();

  const issueFor = (key: string): string | undefined =>
    validation.issues.find((issue) => issue.field === key)?.message;

  const missing = new Set(validation.missingFields);

  return (
    <fieldset className="space-y-2.5" data-ocid="inputs.panel">
      <SectionCard
        title="Property / Case"
        meta="Labels the run"
        icon={<SectionIcon section="property" />}
        data-ocid="inputs.property_section"
      >
        <div className="space-y-1">
          <label
            htmlFor="property-id"
            className="text-[11px] font-medium text-muted-foreground"
          >
            Property / case identifier
          </label>
          <input
            id="property-id"
            data-ocid="inputs.property_id"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            placeholder="e.g. 1420 Maple Ave — Escrow 2026-014"
            className="h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm text-foreground outline-none transition-smooth placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Primary Inputs"
        meta="Required"
        icon={<SectionIcon section="primary_inputs" />}
        data-ocid="inputs.primary_section"
      >
        <FieldPair>
          <MoneyInput
            label="Base price before condition adjustment"
            data-ocid="inputs.base_price"
            value={drafts.basePrice}
            onChange={(value) => setField("basePrice", value)}
            provenance={fields.basePrice.provenance}
            error={issueFor("basePrice")}
            hint={
              missing.has("basePrice")
                ? "Required — enter the list price."
                : undefined
            }
          />

          <fieldset className="space-y-1">
            <legend className="text-[11px] font-medium text-muted-foreground">
              Condition tier
            </legend>
            <div className="inline-grid grid-cols-3 gap-0.5 rounded-sm border border-input bg-muted/40 p-0.5">
              {CONDITION_TIERS.map((tier) => {
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
                    {CONDITION_TIER_LABELS[tier]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Applied to the base price unless a manual adjusted price is set.
            </p>
          </fieldset>
        </FieldPair>

        <FieldPair>
          <MoneyInput
            label="Listing-side compensation"
            data-ocid="inputs.listing_commission"
            value={drafts.listingCommissionRateBps}
            onChange={(value) => setField("listingCommissionRateBps", value)}
            provenance={fields.listingCommissionRateBps.provenance}
            prefix=""
            suffix="bps"
            inputMode="numeric"
            error={issueFor("listingCommissionRateBps")}
            hint={
              missing.has("listingCommissionRateBps")
                ? "Required — enter the listing-side rate in basis points."
                : "1 bp = 0.01%. 250 bps = 2.50%."
            }
          />

          <MoneyInput
            label="Buyer-side compensation"
            data-ocid="inputs.buyer_commission"
            value={drafts.buyerCommissionRateBps}
            onChange={(value) => setField("buyerCommissionRateBps", value)}
            provenance={fields.buyerCommissionRateBps.provenance}
            prefix=""
            suffix="bps"
            inputMode="numeric"
            error={issueFor("buyerCommissionRateBps")}
            hint={
              missing.has("buyerCommissionRateBps")
                ? "Required — enter the buyer-side rate in basis points."
                : "1 bp = 0.01%. 250 bps = 2.50%."
            }
          />
        </FieldPair>

        <FieldPair>
          <MoneyInput
            label="Mortgage / payoff"
            data-ocid="inputs.mortgage_balance"
            value={drafts.mortgageBalance}
            onChange={(value) => setField("mortgageBalance", value)}
            provenance={fields.mortgageBalance.provenance}
            error={issueFor("mortgageBalance")}
            hint={
              missing.has("mortgageBalance")
                ? "Required — enter the outstanding principal."
                : undefined
            }
          />

          <MoneyInput
            label="Property tax (annual)"
            data-ocid="inputs.annual_property_tax"
            value={drafts.annualPropertyTax}
            onChange={(value) => setField("annualPropertyTax", value)}
            provenance={fields.annualPropertyTax.provenance}
            error={issueFor("annualPropertyTax")}
            hint={
              missing.has("annualPropertyTax")
                ? "Required — enter the annual tax amount."
                : undefined
            }
          />
        </FieldPair>

        <FieldPair>
          <MoneyInput
            label="Seller concessions"
            data-ocid="inputs.seller_concessions"
            value={drafts.sellerConcessionsToBuyer}
            onChange={(value) => setField("sellerConcessionsToBuyer", value)}
            provenance={fields.sellerConcessionsToBuyer.provenance}
            error={issueFor("sellerConcessionsToBuyer")}
            hint={
              missing.has("sellerConcessionsToBuyer")
                ? "Required — enter 0 if none."
                : undefined
            }
          />

          <MoneyInput
            label="Repairs"
            data-ocid="inputs.repairs"
            value={drafts.repairsCost}
            onChange={(value) => setField("repairsCost", value)}
            provenance={fields.repairsCost.provenance}
            error={issueFor("repairsCost")}
            hint={
              missing.has("repairsCost")
                ? "Required — enter 0 if none."
                : undefined
            }
          />
        </FieldPair>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
          <span className="mr-auto text-[11px] text-muted-foreground">
            Set provenance on the focused field
          </span>
          <button
            type="button"
            data-ocid="inputs.mark_estimate_button"
            onClick={() => markEstimate("mortgageBalance")}
            className="h-7 rounded-sm border border-input px-2 text-[11px] font-medium text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            Mark mortgage estimate
          </button>
          <button
            type="button"
            data-ocid="inputs.mark_verified_button"
            onClick={() => markVerified("mortgageBalance")}
            className="h-7 rounded-sm border border-input px-2 text-[11px] font-medium text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            Mark verified payoff
          </button>
          <button
            type="button"
            data-ocid="inputs.clear_mortgage_button"
            onClick={() => clearField("mortgageBalance")}
            className="h-7 rounded-sm border border-input px-2 text-[11px] font-medium text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            Clear mortgage
          </button>
        </div>
      </SectionCard>

      <AdvancedSections />

      <div className="flex justify-end">
        <button
          type="button"
          data-ocid="inputs.reset_button"
          onClick={reset}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-input px-2.5 text-[11px] font-medium text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
          Reset all inputs
        </button>
      </div>
    </fieldset>
  );
}
