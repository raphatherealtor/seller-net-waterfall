import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import type { ProvenanceState } from "@/lib/seller-net";
import { cn } from "@/lib/utils";
import { useId } from "react";

interface MoneyInputProps {
  label: string;
  /** Raw string draft owned by the caller — never a parsed number. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  provenance: ProvenanceState;
  /** `$` for dollars, `%` for basis-point rates. */
  prefix?: string;
  /** Rendered after the field, e.g. `bps`. */
  suffix?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  inputMode?: "decimal" | "numeric";
  "data-ocid"?: string;
}

/**
 * A ledger field: sentence-case label + provenance chip on one line, then a
 * right-aligned tabular monospace value with a muted currency/rate prefix and
 * suffix. The field is slightly taller than a normal text input but never
 * oversized. The caller owns the string draft; this component never parses or
 * computes.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  onBlur,
  provenance,
  prefix = "$",
  suffix,
  placeholder = "—",
  hint,
  error,
  disabled = false,
  inputMode = "decimal",
  "data-ocid": dataOcid,
}: MoneyInputProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-[11px] font-medium text-muted-foreground"
        >
          {label}
        </label>
        <ProvenanceBadge state={provenance} />
      </div>
      <div
        className={cn(
          "flex h-10 items-center gap-1.5 rounded-sm border bg-card px-2.5 transition-smooth focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
          error ? "border-destructive" : "border-input",
          disabled && "opacity-60",
        )}
      >
        {prefix ? (
          <span
            aria-hidden="true"
            className="font-money text-xs text-muted-foreground"
          >
            {prefix}
          </span>
        ) : null}
        <input
          id={inputId}
          data-ocid={dataOcid}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className="h-full w-full min-w-0 bg-transparent text-right font-money text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {suffix ? (
          <span
            aria-hidden="true"
            className="font-money text-[10px] uppercase text-muted-foreground"
          >
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p
          id={errorId}
          data-ocid={`${dataOcid ?? "field"}.error`}
          className="text-[11px] text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
