import {
  type RunRecordError,
  type RunRecordView,
  createActor,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Saved run records — the caller's immutable scenario snapshots.
 *
 * Every read and write goes through the generated actor; nothing is cached in
 * localStorage or Context. The list is the single source of truth for the saved
 * runs page, and mutations invalidate it so the newest-first order stays exact.
 */

export const RUN_RECORDS_QUERY_KEY = ["run-records"] as const;

/** The caller's saved run records, newest first (ordering is backend-owned). */
export function useRunRecords() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<RunRecordView[]>({
    queryKey: RUN_RECORDS_QUERY_KEY,
    queryFn: async () => {
      if (!actor) return [];
      return actor.listRunRecords();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetch a single run record by id; `null` when it does not exist. */
export function useRunRecord(runId: string | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery<RunRecordView | null>({
    queryKey: ["run-record", runId],
    queryFn: async () => {
      if (!actor || !runId) return null;
      return actor.getRunRecord(runId);
    },
    enabled: !!actor && !isFetching && !!runId,
  });
}

/** Delete one of the caller's run records, then refresh the list. */
export function useDeleteRunRecord() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      if (!actor) throw new Error("Backend is not ready");
      const result = await actor.deleteRunRecord(runId);
      if (result.__kind__ === "err") {
        throw new Error(describeRunRecordError(result.err));
      }
      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RUN_RECORDS_QUERY_KEY });
    },
  });
}

/** Human-readable message for a backend run-record error variant. */
export function describeRunRecordError(error: RunRecordError): string {
  switch (error.__kind__) {
    case "notAuthenticated":
      return "Sign in to manage saved runs.";
    case "notFound":
      return "That run record no longer exists.";
    case "alreadyExists":
      return "A run record with that identifier already exists.";
    case "invalidInput":
      return `The run record was rejected: ${error.invalidInput}`;
    default:
      return "The run record could not be processed.";
  }
}
