import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Actor, CanisterFixture } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

/**
 * Backend behavior lane for the run-record surface.
 *
 * Installs the app's own compiled wasm into the platform's PocketIC replica and
 * calls the real public API. The frontend suite mocks the actor, so it passes
 * unchanged against a canister whose methods are all `Debug.todo()` stubs; this
 * lane is what proves the methods actually answer.
 *
 * The declarations' shapes apply here, not the TypeScript wrapper's: `?T` is
 * `[] | [T]`, variants are `{ variantName: null }`, and a unit reply decodes to
 * `null`.
 *
 * A freshly created actor calls as the anonymous principal, and every write
 * method rejects anonymous callers, so each test sets its own identity first.
 */

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

const alice = createIdentity("alice");
const bob = createIdentity("bob");

let pic: PocketIc | undefined;
let actor: Actor<_SERVICE>;
let canisterId: CanisterFixture<_SERVICE>["canisterId"];

/** A structurally valid snapshot payload, as the frontend would submit it. */
function snapshot(runId: string, propertyId: string) {
  return {
    runId,
    propertyId,
    calculatorVersion: "SELLER_NET_WATERFALL v1.1.0",
    inputHash: "deadbeef",
    effectiveInputsJson: JSON.stringify({ conditionTier: "GOOD" }),
    inputProvenanceJson: JSON.stringify({ basePrice: "USER_PROVIDED" }),
    outputsJson: JSON.stringify({ estimatedNetProceeds: 100 }),
  };
}

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  ({ actor, canisterId } = await pic.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  }));
});

afterAll(async () => {
  await pic?.tearDown();
});

it("answers an empty-state read instead of trapping", async () => {
  actor.setIdentity(alice);
  await expect(actor.listRunRecords()).resolves.toEqual([]);
});

it("round-trips a run record through the real canister", async () => {
  actor.setIdentity(alice);
  const input = snapshot("run-round-trip", "PID 1001");
  const saved = await actor.saveRunRecord(input);
  expect(saved).toMatchObject({ ok: { runId: "run-round-trip" } });

  const listed = await actor.listRunRecords();
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({
    runId: "run-round-trip",
    propertyId: "PID 1001",
    inputHash: "deadbeef",
  });

  const fetched = await actor.getRunRecord("run-round-trip");
  expect(fetched).toHaveLength(1);
  expect(fetched[0]).toMatchObject({ runId: "run-round-trip" });
});

it("rejects a duplicate runId for the same caller", async () => {
  actor.setIdentity(alice);
  const input = snapshot("run-duplicate", "PID 1002");
  await actor.saveRunRecord(input);
  const second = await actor.saveRunRecord(input);
  expect(second).toMatchObject({ err: { alreadyExists: "run-duplicate" } });
});

it("rejects a structurally invalid snapshot", async () => {
  actor.setIdentity(alice);
  const result = await actor.saveRunRecord({
    ...snapshot("", "PID 1003"),
  });
  expect(result).toMatchObject({ err: { invalidInput: expect.any(String) } });
});

it("deletes a run record and reports a missing one", async () => {
  actor.setIdentity(alice);
  await actor.saveRunRecord(snapshot("run-delete", "PID 1004"));
  await expect(actor.deleteRunRecord("run-delete")).resolves.toMatchObject({
    ok: null,
  });
  await expect(actor.deleteRunRecord("run-delete")).resolves.toMatchObject({
    err: { notFound: "run-delete" },
  });
});

it("does not show one caller's run records to another", async () => {
  actor.setIdentity(alice);
  await actor.saveRunRecord(snapshot("run-alice", "PID 2001"));
  const aliceRecords = await actor.listRunRecords();
  expect(aliceRecords.some((record) => record.runId === "run-alice")).toBe(true);

  actor.setIdentity(bob);
  expect(await actor.listRunRecords()).toEqual([]);
  await expect(actor.getRunRecord("run-alice")).resolves.toEqual([]);
});

it("rejects an anonymous caller", async () => {
  const guest = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(
    guest.saveRunRecord(snapshot("run-guest", "PID 3001")),
  ).resolves.toMatchObject({ err: { notAuthenticated: null } });
});
