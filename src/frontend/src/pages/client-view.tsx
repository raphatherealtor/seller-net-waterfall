import { ClientSummary } from "@/components/client-view/client-summary";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/ui/disclaimer";
import { formatDate, formatPropertyId } from "@/lib/format";
import { useSellerNet } from "@/state/seller-net-context";
import { Link } from "@tanstack/react-router";
import { FileText, Printer } from "lucide-react";

/**
 * Seller-facing client view.
 *
 * Shows only the figures a seller should see — property identifier, date,
 * calculator version, gross price, deductions, net proceeds, and any shortfall.
 * All calculator internals (provenance, raw inputs, validation, rates) are
 * deliberately absent. Every figure is read from `result`; nothing is recomputed.
 */
export function ClientViewPage() {
  const { propertyId, result, calculable, calculatorVersion } = useSellerNet();
  const output = result.output;
  const today = formatDate(new Date());

  return (
    <div
      data-ocid="page.client_view"
      className="mx-auto max-w-[1100px] px-4 py-5 md:px-6 md:py-6"
    >
      <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow text-primary">Estimated Seller Net Sheet</p>
          <h1 className="mt-1 truncate font-display text-2xl font-semibold tracking-tight text-foreground">
            {formatPropertyId(propertyId)}
          </h1>
          <p className="mt-1 font-money text-xs text-muted-foreground">
            Prepared {today} · {calculatorVersion}
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          size="sm"
          className="no-print shrink-0"
        >
          <Link to="/print" data-ocid="client_view.print_button">
            <Printer aria-hidden="true" className="size-3.5" />
            Print net sheet
          </Link>
        </Button>
      </header>

      <div className="mt-5">
        {calculable ? (
          <ClientSummary output={output} />
        ) : (
          <div
            data-ocid="client_view.empty_state"
            className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border bg-card px-6 py-14 text-center"
          >
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <FileText className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-base font-semibold text-foreground">
              No net sheet available yet
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Complete the seller net calculation on the work surface to prepare
              a client-ready summary.
            </p>
            <Button asChild size="sm" className="mt-5">
              <Link to="/" data-ocid="client_view.go_to_work_surface_button">
                Go to work surface
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5">
        <Disclaimer variant="block" />
      </div>
    </div>
  );
}
