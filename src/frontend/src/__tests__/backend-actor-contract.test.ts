import {
  Backend,
  type Result,
  type Result_1,
  type RunRecordView,
  type SaveRunRecordInput,
} from "@/backend";
import type { _SERVICE } from "@/declarations/backend.did";
import type { ActorSubclass } from "@icp-sdk/core/agent";
import { describe, expect, it, vi } from "vitest";

/**
 * Backend actor consumer-contract characterization.
 *
 * A provider-neutral MCP integration layer is being added. Its run-record tools
 * must delegate to the same generated `Backend` wrapper the UI uses — never
 * re-implement the actor calls or reshape the Candid variants. These tests pin
 * the wrapper's observable contract against a typed local actor mock: the exact
 * method names it calls, the payload it forwards, and how it unwraps the
 * `ok`/`err` variants and the `?RunRecordView` option.
 *
 * The mock is a typed `_SERVICE` stand-in, so a change to the generated actor
 * surface that the wrapper fails to track is caught at type-check time. No
 * network or real canister is involved; the PocketIC lane is what exercises the
 * real backend.
 */

/** A structurally valid run-record view, as the backend returns it. */
function runRecordView(runId: string): RunRecordView {
  return {
    runId,
    propertyId: "PID 4242",
    calculatorVersion: "SELLER_NET_WATERFALL v1.3.0",
    inputHash: "deadbeef",
    effectiveInputsJson: JSON.stringify({ conditionTier: "GOOD" }),
    inputProvenanceJson: JSON.stringify({ basePrice: "USER_PROVIDED" }),
    outputsJson: JSON.stringify({ estimatedNetProceeds: 166_000 }),
    createdAt: 1_700_000_000_000_000_000n,
  };
}

/** A structurally valid save payload, as the UI would submit it. */
function saveInput(runId: string): SaveRunRecordInput {
  return {
    runId,
    propertyId: "PID 4242",
    calculatorVersion: "SELLER_NET_WATERFALL v1.3.0",
    inputHash: "deadbeef",
    effectiveInputsJson: JSON.stringify({ conditionTier: "GOOD" }),
    inputProvenanceJson: JSON.stringify({ basePrice: "USER_PROVIDED" }),
    outputsJson: JSON.stringify({ estimatedNetProceeds: 166_000 }),
  };
}

/**
 * A typed actor mock. Only the run-record methods are exercised; the rest are
 * present so the object satisfies `_SERVICE` and the wrapper's constructor.
 */
function mockActor() {
  return {
    listRunRecords: vi.fn<() => Promise<RunRecordView[]>>(),
    getRunRecord: vi.fn<(runId: string) => Promise<[] | [RunRecordView]>>(),
    saveRunRecord: vi.fn<(input: SaveRunRecordInput) => Promise<Result>>(),
    deleteRunRecord: vi.fn<(runId: string) => Promise<Result_1>>(),
  };
}

/** Build a real Backend wrapper over the typed mock actor. */
function backendOver(actor: ReturnType<typeof mockActor>): Backend {
  return new Backend(
    actor as unknown as ActorSubclass<_SERVICE>,
    async () => new Uint8Array(),
    async () => ({}) as never,
  );
}

describe("Backend wrapper run-record contract", () => {
  it("forwards listRunRecords and returns the array unchanged", async () => {
    const actor = mockActor();
    const records = [runRecordView("run-1"), runRecordView("run-2")];
    actor.listRunRecords.mockResolvedValue(records);

    const backend = backendOver(actor);
    await expect(backend.listRunRecords()).resolves.toEqual(records);
    expect(actor.listRunRecords).toHaveBeenCalledTimes(1);
  });

  it("unwraps a present getRunRecord option to the view", async () => {
    const actor = mockActor();
    const view = runRecordView("run-1");
    actor.getRunRecord.mockResolvedValue([view]);

    const backend = backendOver(actor);
    await expect(backend.getRunRecord("run-1")).resolves.toEqual(view);
    expect(actor.getRunRecord).toHaveBeenCalledWith("run-1");
  });

  it("unwraps an absent getRunRecord option to null", async () => {
    const actor = mockActor();
    actor.getRunRecord.mockResolvedValue([]);

    const backend = backendOver(actor);
    await expect(backend.getRunRecord("missing")).resolves.toBeNull();
  });

  it("forwards the save payload and preserves the ok variant", async () => {
    const actor = mockActor();
    const input = saveInput("run-1");
    actor.saveRunRecord.mockResolvedValue({
      __kind__: "ok",
      ok: runRecordView("run-1"),
    });

    const backend = backendOver(actor);
    const result = await backend.saveRunRecord(input);

    expect(actor.saveRunRecord).toHaveBeenCalledWith(input);
    expect(result.__kind__).toBe("ok");
    if (result.__kind__ === "ok") {
      expect(result.ok.runId).toBe("run-1");
    }
  });

  it("preserves the err variant and its discriminant for the caller", async () => {
    const actor = mockActor();
    actor.saveRunRecord.mockResolvedValue({
      __kind__: "err",
      err: { __kind__: "alreadyExists", alreadyExists: "run-1" },
    });

    const backend = backendOver(actor);
    const result = await backend.saveRunRecord(saveInput("run-1"));

    expect(result.__kind__).toBe("err");
    if (result.__kind__ === "err") {
      expect(result.err.__kind__).toBe("alreadyExists");
    }
  });

  it("preserves the notAuthenticated err variant", async () => {
    const actor = mockActor();
    actor.saveRunRecord.mockResolvedValue({
      __kind__: "err",
      err: { __kind__: "notAuthenticated", notAuthenticated: null },
    });

    const backend = backendOver(actor);
    const result = await backend.saveRunRecord(saveInput("run-1"));
    expect(result).toMatchObject({
      __kind__: "err",
      err: { __kind__: "notAuthenticated" },
    });
  });

  it("forwards deleteRunRecord and preserves both variants", async () => {
    const actor = mockActor();
    actor.deleteRunRecord.mockResolvedValueOnce({ __kind__: "ok", ok: null });
    actor.deleteRunRecord.mockResolvedValueOnce({
      __kind__: "err",
      err: { __kind__: "notFound", notFound: "run-1" },
    });

    const backend = backendOver(actor);
    await expect(backend.deleteRunRecord("run-1")).resolves.toMatchObject({
      __kind__: "ok",
    });
    await expect(backend.deleteRunRecord("run-1")).resolves.toMatchObject({
      __kind__: "err",
      err: { __kind__: "notFound" },
    });
    expect(actor.deleteRunRecord).toHaveBeenCalledTimes(2);
  });
});
