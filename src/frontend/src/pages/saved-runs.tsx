import type { RunRecordView } from "@/backend";
import { RunRecordCard } from "@/components/runs/run-record-card";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/ui/disclaimer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  describeRunRecordError,
  useDeleteRunRecord,
  useRunRecords,
} from "@/hooks/use-run-records";
import type { SellerNetInput } from "@/lib/seller-net";
import { useSellerNet } from "@/state/seller-net-context";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderOpen, LogIn, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

/**
 * Saved runs — the caller's immutable scenario snapshots, newest first.
 *
 * Replay is the load-bearing action: it parses the stored `effectiveInputsJson`
 * and hands it to `loadInput`, so the work surface recomputes the exact same
 * outputs from the exact same inputs. Stored outputs are never trusted as the
 * source of truth.
 */

const SKELETON_IDS = Array.from({ length: 3 }, (_, i) => `run-skeleton-${i}`);

/** Parse a stored effective-inputs JSON blob into a canonical SellerNetInput. */
function parseEffectiveInputs(json: string): SellerNetInput | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<SellerNetInput>;
    if (
      typeof candidate.conditionTier !== "string" ||
      typeof candidate.mortgagePayoffMode !== "string" ||
      typeof candidate.basePrice !== "object" ||
      candidate.basePrice === null
    ) {
      return null;
    }
    return candidate as SellerNetInput;
  } catch {
    return null;
  }
}

export function SavedRunsPage() {
  const { isAuthenticated, isInitializing, login } = useInternetIdentity();
  const { loadInput } = useSellerNet();
  const navigate = useNavigate();
  const [replayError, setReplayError] = useState<string | null>(null);

  const recordsQuery = useRunRecords();
  const deleteMutation = useDeleteRunRecord();

  const records = recordsQuery.data ?? [];

  function handleReplay(record: RunRecordView) {
    const input = parseEffectiveInputs(record.effectiveInputsJson);
    if (!input) {
      setReplayError(
        `Run ${record.runId} has unreadable stored inputs and cannot be replayed.`,
      );
      return;
    }
    setReplayError(null);
    loadInput(input, record.propertyId);
    void navigate({ to: "/" });
  }

  function handleDelete(record: RunRecordView) {
    setReplayError(null);
    deleteMutation.mutate(record.runId);
  }

  return (
    <div
      data-ocid="page.saved_runs"
      className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8"
    >
      <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-primary">
            Run archive
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            Saved runs
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Immutable snapshots of completed scenarios. Replaying a run restores
            its exact inputs so the work surface reproduces identical outputs.
          </p>
        </div>

        {isAuthenticated ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="runs.refresh_button"
            disabled={recordsQuery.isFetching}
            onClick={() => void recordsQuery.refetch()}
            className="shrink-0"
          >
            <RefreshCw
              aria-hidden="true"
              className={
                recordsQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"
              }
            />
            Refresh
          </Button>
        ) : null}
      </header>

      {replayError ? (
        <div
          data-ocid="runs.error_state"
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <p>{replayError}</p>
        </div>
      ) : null}

      {deleteMutation.isError ? (
        <div
          data-ocid="runs.delete_error_state"
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <p>
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : describeRunRecordError({ __kind__: "notFound", notFound: "" })}
          </p>
        </div>
      ) : null}

      <div className="mt-6">
        {isInitializing ? (
          <LoadingState />
        ) : !isAuthenticated ? (
          <NotAuthenticatedState onLogin={() => login()} />
        ) : recordsQuery.isLoading ? (
          <LoadingState />
        ) : recordsQuery.isError ? (
          <ErrorState onRetry={() => void recordsQuery.refetch()} />
        ) : records.length === 0 ? (
          <EmptyState />
        ) : (
          <ul
            data-ocid="runs.list"
            className="flex flex-col gap-4"
            aria-label="Saved run records"
          >
            {records.map((record, i) => (
              <li key={record.runId}>
                <RunRecordCard
                  record={record}
                  index={i + 1}
                  onReplay={handleReplay}
                  onDelete={handleDelete}
                  isDeleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables === record.runId
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <Disclaimer variant="block" />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div data-ocid="runs.loading_state" className="flex flex-col gap-4">
      {SKELETON_IDS.map((id) => (
        <div
          key={id}
          className="overflow-hidden rounded-md border border-border bg-card shadow-subtle"
        >
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotAuthenticatedState({ onLogin }: { onLogin: () => void }) {
  return (
    <div
      data-ocid="runs.not_authenticated_state"
      className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-card px-6 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <LogIn className="size-5" />
      </span>
      <h2 className="mt-4 font-display text-base font-semibold text-foreground">
        Sign in to view saved runs
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Saved runs are private to your account. Sign in to list, replay, and
        delete your scenario snapshots.
      </p>
      <Button
        type="button"
        size="sm"
        data-ocid="runs.login_button"
        onClick={onLogin}
        className="mt-5"
      >
        <LogIn aria-hidden="true" className="size-3.5" />
        Sign in
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-ocid="runs.empty_state"
      className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-card px-6 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <FolderOpen className="size-5" />
      </span>
      <h2 className="mt-4 font-display text-base font-semibold text-foreground">
        No saved runs yet
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Complete a seller net calculation on the work surface and save it to
        build a replayable archive of scenarios.
      </p>
      <Button asChild size="sm" className="mt-5">
        <Link to="/" data-ocid="runs.go_to_work_surface_button">
          Go to work surface
        </Link>
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-ocid="runs.error_state"
      className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-card px-6 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"
      >
        <TriangleAlert className="size-5" />
      </span>
      <h2 className="mt-4 font-display text-base font-semibold text-foreground">
        Could not load saved runs
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        The run archive is temporarily unavailable. Retry to fetch your saved
        scenarios.
      </p>
      <Button
        type="button"
        size="sm"
        data-ocid="runs.retry_button"
        onClick={onRetry}
        className="mt-5"
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}
