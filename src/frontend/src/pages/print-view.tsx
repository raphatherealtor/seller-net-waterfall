import { NetSheet } from "@/components/print-view/net-sheet";
import { Button } from "@/components/ui/button";
import { useSellerNet } from "@/state/seller-net-context";
import { Printer } from "lucide-react";
import { useState } from "react";

/**
 * Print view route body.
 *
 * Renders the one-page-friendly net sheet from the shared work-surface state and
 * offers a single on-screen-only Print action. The sheet itself is the only
 * thing that survives `window.print()`.
 */
export default function PrintViewPage() {
  const { propertyId, input, result, calculable } = useSellerNet();
  const [generatedAt] = useState(() => new Date());

  return (
    <div data-ocid="page.print_view" className="bg-background">
      <div className="no-print mx-auto flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6">
        <div className="min-w-0">
          <h1 className="font-display text-sm font-semibold tracking-tight text-foreground">
            Print net sheet
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Letter portrait, one page. Figures come straight from the current
            work surface.
          </p>
        </div>
        <Button
          type="button"
          data-ocid="print.print_button"
          onClick={() => window.print()}
          className="rounded-sm"
        >
          <Printer aria-hidden="true" />
          Print net sheet
        </Button>
      </div>

      <div className="mx-auto max-w-[8.5in] px-4 py-4 md:px-6">
        <NetSheet
          propertyId={propertyId}
          input={input}
          result={result}
          calculable={calculable}
          generatedAt={generatedAt}
        />
      </div>
    </div>
  );
}
