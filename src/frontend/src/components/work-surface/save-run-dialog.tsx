import { createActor } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RUN_RECORDS_QUERY_KEY } from "@/hooks/use-run-records";
import { formatMoneyWhole } from "@/lib/format";
import { calculateSellerNetWaterfallStrict } from "@/lib/seller-net";
import { useSellerNet } from "@/state/seller-net-context";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Save } from "lucide-react";
import { useState } from "react";

/**
 * Save Run dialog. Builds a snapshot of the effective inputs, their provenance,
 * and the calculator outputs, then persists it through `saveRunRecord`.
 *
 * The snapshot is taken from the same `input`/`result` the calculator used, so
 * the stored inputs always match the stored outputs.
 */

interface SaveRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SaveRunDialog({ open, onOpenChange }: SaveRunDialogProps) {
  const { effectiveInput, result, propertyId, calculable, calculatorVersion } =
    useSellerNet();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  const [savedRunId, setSavedRunId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      const strictResult = calculateSellerNetWaterfallStrict(effectiveInput);
      const inputHash = strictResult.inputHash;
      const runId = `${inputHash}-${Date.now().toString(36)}`;
      const provenance = Object.fromEntries(
        Object.entries(effectiveInput)
          .filter(
            (entry): entry is [string, { provenance: string }] =>
              typeof entry[1] === "object" &&
              entry[1] !== null &&
              "provenance" in entry[1],
          )
          .map(([key, field]) => [key, field.provenance]),
      );
      return actor.saveRunRecord({
        runId,
        propertyId: propertyId.trim(),
        calculatorVersion: strictResult.calculatorVersion,
        inputHash,
        effectiveInputsJson: JSON.stringify(effectiveInput),
        inputProvenanceJson: JSON.stringify(provenance),
        outputsJson: JSON.stringify(strictResult.output),
      });
    },
    onSuccess: (response) => {
      if (response.__kind__ === "ok") {
        setSavedRunId(response.ok.runId);
        void queryClient.invalidateQueries({ queryKey: RUN_RECORDS_QUERY_KEY });
      }
    },
  });

  const errorMessage =
    mutation.data && mutation.data.__kind__ === "err"
      ? mutation.data.err.__kind__ === "notAuthenticated"
        ? "Sign in to save run records."
        : mutation.data.err.__kind__ === "alreadyExists"
          ? "A run with this identity already exists."
          : mutation.data.err.__kind__ === "invalidInput"
            ? `Invalid input: ${mutation.data.err.invalidInput}`
            : "The run record could not be found."
      : mutation.isError
        ? "The run could not be saved. Please try again."
        : null;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSavedRunId(null);
      mutation.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-ocid="save_run.dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base">
            Save run record
          </DialogTitle>
          <DialogDescription>
            Stores a snapshot of the effective inputs, their provenance, and the
            calculated outputs. Saved runs are immutable.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-1.5 rounded-sm border border-border bg-muted/30 px-3 py-2.5 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Property / case</dt>
            <dd className="truncate font-medium text-foreground">
              {propertyId.trim() || "Untitled property"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Estimated net proceeds</dt>
            <dd className="font-money tabular-nums text-foreground">
              {formatMoneyWhole(result.output.estimatedNetProceeds)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Input hash</dt>
            <dd className="font-money text-[11px] text-foreground">
              {result.inputHash}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Calculator version</dt>
            <dd className="font-money text-[11px] text-foreground">
              {calculatorVersion}
            </dd>
          </div>
        </dl>

        {savedRunId ? (
          <p
            data-ocid="save_run.success_state"
            className="flex items-start gap-1.5 rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-xs text-foreground"
          >
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-success"
            />
            <span>
              Saved as run{" "}
              <span className="font-money font-semibold">{savedRunId}</span>.
            </span>
          </p>
        ) : null}

        {errorMessage ? (
          <p
            data-ocid="save_run.error_state"
            className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-ocid="save_run.cancel_button"
            onClick={() => handleOpenChange(false)}
          >
            {savedRunId ? "Close" : "Cancel"}
          </Button>
          <Button
            type="button"
            data-ocid="save_run.submit_button"
            disabled={!calculable || mutation.isPending || savedRunId !== null}
            onClick={() => mutation.mutate()}
          >
            <Save aria-hidden="true" />
            {mutation.isPending ? "Saving…" : "Save run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
