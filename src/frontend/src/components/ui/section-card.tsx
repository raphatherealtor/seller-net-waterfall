import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  /** Short uppercase descriptor rendered next to the title. */
  meta?: string;
  /** Optional dimensional icon badge rendered beside the title. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-ocid"?: string;
}

/**
 * A titled input group on the left panel: a small dimensional icon badge and
 * uppercase eyebrow over a hairline rule, then the field rows. 3px radius,
 * hairline border, quiet elevation from the `.section-head` strip.
 */
export function SectionCard({
  title,
  meta,
  icon,
  children,
  className,
  "data-ocid": dataOcid,
}: SectionCardProps) {
  return (
    <section
      data-ocid={dataOcid}
      className={cn(
        "overflow-hidden rounded-sm border border-border bg-card shadow-subtle",
        className,
      )}
    >
      <header className="section-head flex items-center justify-between gap-3 px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="eyebrow truncate text-foreground">{title}</h2>
        </div>
        {meta ? (
          <span className="shrink-0 font-money text-[10px] uppercase tracking-wider text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </header>
      <div className="space-y-2.5 px-3.5 py-3">{children}</div>
    </section>
  );
}
