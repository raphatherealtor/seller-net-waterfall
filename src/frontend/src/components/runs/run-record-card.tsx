import type { RunRecordView } from "@/backend";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  formatDateTime,
  formatMoneyWhole,
  formatPropertyId,
  timestampToDate,
} from "@/lib/format";
import type { SellerNetOutput } from "@/lib/seller-net";
import { cn } from "@/lib/utils";
import { AlertTriangle, Hash, History, RotateCcw, Trash2 } from "lucide-react";

/**
 * One saved run record, rendered as a ledger row.
 *
 * The card is a pure presentation of the stored snapshot: the identity block
 * (property, runId, version, createdAt, input hash) and the key output figures
 * parsed from `outputsJson`. It never recomputes anything — replay hands the
 * stored effective inputs back to the work surface, which owns the calculator.
 */

interface RunRecordCardProps {
  record: RunRecordView;
  /** 1-based position in the newest-first list, used for stable test markers. */
  index: number;
  onReplay: (record: RunRecordView) => void;
  onDelete: (record: RunRecordView) => void;
  isDeleting?: boolean;
  className?: string;
}

/** Parse the stored outputs JSON; returns `null` when it is unreadable. */
function parseOutputs(outputsJson: string): SellerNetOutput | null {
  try {
    const parsed: unknown = JSON.parse(outputsJson);
    if (parsed && typeof parsed === "object") {
      return parsed as SellerNetOutput;
    }
    return null;
  } catch {
    return null;
  }
}

interface IdentityRow {
  label: string;
  value: string;
  mono?: boolean;
}

export function RunRecordCard({
  record,
  index,
  onReplay,
  onDelete,
  isDeleting = false,
  className,
}: RunRecordCardProps) {
  const output = parseOutputs(record.outputsJson);
  const createdAt = formatDateTime(timestampToDate(record.createdAt));
  const hasShortfall = (output?.estimatedSellerShortfall ?? 0) > 0;

  const identity: IdentityRow[] = [
    { label: "Run ID", value: record.runId, mono: true },
    {
      label: "Calculator version",
      value: record.calculatorVersion,
      mono: true,
    },
    { label: "Created", value: createdAt },
    { label: "Input hash", value: record.inputHash, mono: true },
  ];

  return (
    <article
      data-ocid={`runs.item.${index}`}
      className={cn(
        "overflow-hidden rounded-sm border border-border bg-card shadow-subtle",
        className,
      )}
    >
      <header className="flex flex-col gap-2.5 border-b border-border px-3.5 py-2.5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow text-primary">Saved scenario</p>
          <h3 className="mt-0.5 truncate font-display text-base font-semibold tracking-tight text-foreground">
            {formatPropertyId(record.propertyId)}
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid={`runs.replay_button.${index}`}
            onClick={() => onReplay(record)}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Replay
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-ocid={`runs.delete_button.${index}`}
            disabled={isDeleting}
            onClick={() => onDelete(record)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-b border-border px-3.5 py-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {identity.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="eyebrow">{row.label}</dt>
            <dd
              className={cn(
                "mt-0.5 truncate text-xs text-foreground",
                row.mono ? "font-money" : "font-body",
              )}
              title={row.value}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {output ? (
        <div className="grid grid-cols-1 gap-2.5 px-3.5 py-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            data-ocid={`runs.gross_price.card.${index}`}
            label="Gross sale price"
            value={formatMoneyWhole(output.grossPrice)}
            tone="accent"
          />
          <KpiCard
            data-ocid={`runs.total_deductions.card.${index}`}
            label="Total deductions"
            value={formatMoneyWhole(output.totalDeductions)}
            tone="neutral"
          />
          <KpiCard
            data-ocid={`runs.net_proceeds.card.${index}`}
            label="Estimated net proceeds"
            value={formatMoneyWhole(output.estimatedNetProceeds)}
            tone={hasShortfall ? "neutral" : "positive"}
          />
          {hasShortfall ? (
            <KpiCard
              data-ocid={`runs.shortfall.card.${index}`}
              label="Estimated seller shortfall"
              value={formatMoneyWhole(output.estimatedSellerShortfall)}
              tone="negative"
            />
          ) : (
            <KpiCard
              data-ocid={`runs.net_position.card.${index}`}
              label="Net position"
              value={formatMoneyWhole(output.nominalNet)}
              tone={output.nominalNet >= 0 ? "positive" : "negative"}
            />
          )}
        </div>
      ) : (
        <div
          data-ocid={`runs.outputs_unavailable.${index}`}
          className="flex items-center gap-2 px-3.5 py-2.5 text-xs text-muted-foreground"
        >
          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
          <span>
            Stored output figures could not be read. Replay the run to recompute
            them from its saved inputs.
          </span>
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/30 px-3.5 py-1.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Hash aria-hidden="true" className="size-3" />
          <span className="font-money">{record.inputHash}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <History aria-hidden="true" className="size-3" />
          {createdAt}
        </span>
      </footer>
    </article>
  );
}
