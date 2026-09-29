import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

/** The one canonical planning-purposes disclaimer. Never reworded per view. */
export const PLANNING_DISCLAIMER =
  "Estimated figures are for planning purposes and are not a final settlement statement. Actual escrow, title, lender, tax, HOA, lien, and transaction charges may differ.";

interface DisclaimerProps {
  className?: string;
  /** `inline` for the footer strip, `block` for the print sheet. */
  variant?: "inline" | "block";
}

export function Disclaimer({ className, variant = "inline" }: DisclaimerProps) {
  return (
    <div
      data-ocid="disclaimer"
      className={cn(
        "flex gap-2 text-muted-foreground",
        variant === "block"
          ? "rounded-sm border border-border bg-muted/40 p-3 text-[11px] leading-relaxed"
          : "items-start text-[11px] leading-relaxed",
        className,
      )}
    >
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <p>{PLANNING_DISCLAIMER}</p>
    </div>
  );
}
