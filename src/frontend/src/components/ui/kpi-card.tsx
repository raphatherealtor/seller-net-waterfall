import { cn } from "@/lib/utils";

type KpiTone = "neutral" | "positive" | "negative" | "accent";

/** `anchor` is the single hero figure; `medium` is a supporting readout. */
type KpiSize = "anchor" | "medium";

const TONE_BAR: Record<KpiTone, string> = {
  neutral: "bg-border",
  positive: "bg-success",
  negative: "bg-destructive",
  accent: "bg-primary",
};

const TONE_VALUE: Record<KpiTone, string> = {
  neutral: "text-foreground",
  positive: "text-success",
  negative: "text-destructive",
  accent: "text-foreground",
};

const SIZE_VALUE: Record<KpiSize, string> = {
  anchor: "text-2xl",
  medium: "text-lg",
};

const SIZE_PAD: Record<KpiSize, string> = {
  anchor: "py-3.5 pl-4 pr-3",
  medium: "py-2.5 pl-3.5 pr-3",
};

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  /** `anchor` for the headline figure, `medium` for supporting readouts. */
  size?: KpiSize;
  className?: string;
  "data-ocid"?: string;
}

/**
 * A single ledger readout: 2px status bar, uppercase label, monospace figure.
 * Depth comes from the bar and a hairline border, never a heavy shadow.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  size = "medium",
  className,
  "data-ocid": dataOcid,
}: KpiCardProps) {
  return (
    <div
      data-ocid={dataOcid}
      className={cn(
        "relative overflow-hidden rounded-sm border border-border bg-card shadow-subtle",
        SIZE_PAD[size],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-0.5", TONE_BAR[tone])}
      />
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-money font-semibold tabular-nums",
          SIZE_VALUE[size],
          TONE_VALUE[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
