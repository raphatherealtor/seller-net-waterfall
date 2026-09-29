import { PROVENANCE_LABELS, type ProvenanceState } from "@/lib/seller-net";
import { cn } from "@/lib/utils";

/**
 * Provenance chip. Every state shares one coherent outlined status system built
 * on the `--chip-*` tokens and the `.chip` utility: a quiet indicator, never an
 * action button. The dot carries the per-state hue so confidence is readable at
 * a glance without turning the chip into a colored button.
 */
const STATE_DOT: Record<ProvenanceState, string> = {
  USER_PROVIDED: "text-prov-user",
  DEFAULT_ASSUMPTION: "text-prov-default",
  ESTIMATE: "text-prov-estimate",
  VERIFIED_PAYOFF: "text-prov-verified",
  UNKNOWN: "text-prov-unknown",
};

interface ProvenanceBadgeProps {
  state: ProvenanceState;
  className?: string;
}

export function ProvenanceBadge({ state, className }: ProvenanceBadgeProps) {
  return (
    <span
      data-ocid={`provenance.badge.${state.toLowerCase()}`}
      title={PROVENANCE_LABELS[state]}
      className={cn("chip shrink-0", className)}
    >
      <span aria-hidden="true" className={cn("chip-dot", STATE_DOT[state])} />
      {PROVENANCE_LABELS[state]}
    </span>
  );
}
