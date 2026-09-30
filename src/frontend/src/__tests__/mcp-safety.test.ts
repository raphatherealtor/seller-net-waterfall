import {
  MCP_ERROR_CODES,
  MCP_LIMITS,
  MCP_TOOL_NAMES,
  type McpAuthContext,
  type McpErrorCode,
  type McpPrincipal,
  type McpService,
  type RunRecordPayload,
  type RunRecordStore,
  SCOPE_READ,
  SCOPE_RUNS,
  anonymousAuthContext,
  createMcpService,
} from "@/lib/mcp";
import {
  SELLER_NET_CONFIG,
  type SellerNetInput,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * MCP safety and structured-error coverage.
 *
 * Every failure mode the service can produce must surface as a stable,
 * machine-readable code — never a crash, never a leaked internal. These tests
 * exercise authorization, malformed input, out-of-range numbers, scenario-count
 * limits, pagination bounds, and the UNKNOWN-versus-explicit-0 distinction, and
 * assert that the codes they receive are members of the frozen
 * `MCP_ERROR_CODES` tuple.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
  return {
    basePrice: userProvided(500_000),
    manualAdjustedPrice: userProvided(0),
    conditionTier: "GOOD",
    listingCommissionRateBps: userProvided(250),
    buyerCommissionRateBps: userProvided(250),
    escrowRateBps: defaultAssumption(SELLER_NET_CONFIG.escrowRateBps),
    titleRateBps: defaultAssumption(SELLER_NET_CONFIG.titleRateBps),
    transferTaxRateBps: defaultAssumption(SELLER_NET_CONFIG.transferTaxRateBps),
    recordingFees: defaultAssumption(SELLER_NET_CONFIG.recordingFees),
    homeWarranty: defaultAssumption(SELLER_NET_CONFIG.homeWarranty),
    annualPropertyTax: userProvided(6_000),
    taxDaysElapsed: userProvided(0),
    mortgageBalance: userProvided(300_000),
    mortgageRateBps: userProvided(0),
    mortgageMonthsRemaining: userProvided(0),
    mortgagePayoffMode: "VERIFIED_PAYOFF",
    hoaPayoff: userProvided(0),
    liensJudgments: userProvided(0),
    stagingPhotoCost: userProvided(0),
    sellerConcessionsToBuyer: userProvided(0),
    repairsCost: userProvided(0),
    renovationCost: userProvided(0),
    isHecm: false,
    hecmInitialBalance: unknownField(),
    hecmCurrentRateBps: unknownField(),
    hecmLifetimeCapBps: unknownField(),
    hecmMonthsElapsed: unknownField(),
    originalPurchasePrice: unknownField(),
    capitalImprovements: unknownField(),
    section121Status: "UNKNOWN",
    estimatedCapitalGainsTaxRateBps: unknownField(),
    monthlyCarryingCost: unknownField(),
    pctExpectedDom: unknownField(),
    pctExpectedDiscountPct: unknownField(),
    ...overrides,
  };
}

function createMemoryStore(): RunRecordStore {
  const records = new Map<string, Map<string, RunRecordPayload>>();
  const bucket = (owner: string): Map<string, RunRecordPayload> => {
    const existing = records.get(owner);
    if (existing) return existing;
    const created = new Map<string, RunRecordPayload>();
    records.set(owner, created);
    return created;
  };
  return {
    async save(owner, record) {
      const owned = bucket(owner);
      if (owned.has(record.runId)) return { ok: false, code: "DUPLICATE_RUN" };
      owned.set(record.runId, record);
      return { ok: true };
    },
    async get(owner, runId) {
      return bucket(owner).get(runId) ?? null;
    },
    async list(owner) {
      return [...bucket(owner).values()].reverse();
    },
  };
}

const READ_PRINCIPAL: McpPrincipal = {
  id: "principal-read",
  anonymous: false,
  scopes: [SCOPE_READ],
};

const RUNS_PRINCIPAL: McpPrincipal = {
  id: "principal-runs",
  anonymous: false,
  scopes: [SCOPE_READ, SCOPE_RUNS],
};

const readCtx: McpAuthContext = { principal: READ_PRINCIPAL };
const runsCtx: McpAuthContext = { principal: RUNS_PRINCIPAL };

function makeService(): McpService {
  return createMcpService({ store: createMemoryStore() });
}

/** Assert a failure envelope carries a stable, known error code. */
function expectCode(
  envelope: { ok: boolean; error?: { code: McpErrorCode } },
  code: McpErrorCode,
): void {
  expect(envelope.ok).toBe(false);
  expect(envelope.error?.code).toBe(code);
  expect(MCP_ERROR_CODES).toContain(envelope.error?.code);
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization
// ─────────────────────────────────────────────────────────────────────────────

describe("authorization", () => {
  it("returns UNAUTHORIZED for an anonymous protected call, not a crash", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      anonymousAuthContext,
      "seller_net.create_run",
      { runId: "r1", propertyId: "p1", input: baseInput() },
    );
    expectCode(envelope, "UNAUTHORIZED");
  });

  it("returns FORBIDDEN for an authenticated principal without the scope", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.list_runs",
      {},
    );
    expectCode(envelope, "FORBIDDEN");
  });

  it("allows public tools for an anonymous caller", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      anonymousAuthContext,
      "seller_net.calculate",
      { input: baseInput() },
    );
    expect(envelope.ok).toBe(true);
  });

  it("denies get_run and list_runs without the runs scope", async () => {
    const service = makeService();
    const getRun = await service.dispatch(readCtx, "seller_net.get_run", {
      runId: "r1",
    });
    const listRuns = await service.dispatch(
      readCtx,
      "seller_net.list_runs",
      {},
    );
    expectCode(getRun, "FORBIDDEN");
    expectCode(listRuns, "FORBIDDEN");
  });

  it("allows protected tools with the runs scope", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      runsCtx,
      "seller_net.list_runs",
      {},
    );
    expect(envelope.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unknown tools
// ─────────────────────────────────────────────────────────────────────────────

describe("unknown tools", () => {
  it("returns UNKNOWN_TOOL for a name outside the ten tools", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.nope" as never,
      {},
    );
    expectCode(envelope, "UNKNOWN_TOOL");
  });

  it("keeps every declared tool name dispatchable", async () => {
    const service = makeService();
    for (const name of MCP_TOOL_NAMES) {
      const envelope = await service.dispatch(runsCtx, name, {});
      // No tool should ever throw; each returns an envelope.
      expect(envelope.audit.toolName).toBe(name);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Malformed input
// ─────────────────────────────────────────────────────────────────────────────

describe("malformed input", () => {
  it("returns INVALID_PARAMS when the input object is missing", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.calculate",
      {},
    );
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("returns INVALID_PARAMS when the input is not structurally valid", async () => {
    const service = makeService();
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: { basePrice: 1 },
    });
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("returns INVALID_PARAMS for a non-object params value", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.calculate",
      "not-an-object",
    );
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("returns INVALID_PARAMS for a missing runId", async () => {
    const service = makeService();
    const envelope = await service.dispatch(runsCtx, "seller_net.get_run", {});
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("returns INVALID_PARAMS for an oversized runId", async () => {
    const service = makeService();
    const envelope = await service.dispatch(runsCtx, "seller_net.get_run", {
      runId: "x".repeat(MCP_LIMITS.maxTextLength + 1),
    });
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("returns INVALID_PARAMS when explain_result has neither result nor runId", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.explain_result",
      {},
    );
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("returns INVALID_PARAMS when explain_result receives a non-result", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.explain_result",
      { result: { nope: true } },
    );
    expectCode(envelope, "INVALID_PARAMS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Out-of-range numbers
// ─────────────────────────────────────────────────────────────────────────────

describe("out-of-range numbers", () => {
  it("returns OUT_OF_RANGE for a negative scenario spread", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.compare_scenarios",
      { input: baseInput(), spread: -1 },
    );
    expectCode(envelope, "OUT_OF_RANGE");
  });

  it("returns OUT_OF_RANGE for a spread above the money limit", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.compare_scenarios",
      { input: baseInput(), spread: MCP_LIMITS.maxMoney + 1 },
    );
    expectCode(envelope, "OUT_OF_RANGE");
  });

  it("returns OUT_OF_RANGE for a negative scenario target", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.compare_scenarios",
      { input: baseInput(), targets: [-5] },
    );
    expectCode(envelope, "OUT_OF_RANGE");
  });

  it("returns OUT_OF_RANGE for a non-finite scenario target", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.compare_scenarios",
      { input: baseInput(), targets: [Number.POSITIVE_INFINITY] },
    );
    expectCode(envelope, "OUT_OF_RANGE");
  });

  it("returns VALIDATION_FAILED when the canonical validator rejects the input", async () => {
    const service = makeService();
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: baseInput({ basePrice: userProvided(-1) }),
    });
    expectCode(envelope, "VALIDATION_FAILED");
  });

  it("returns VALIDATION_FAILED when a required field is UNKNOWN", async () => {
    const service = makeService();
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: baseInput({ mortgageBalance: unknownField() }),
    });
    expectCode(envelope, "VALIDATION_FAILED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario count limits
// ─────────────────────────────────────────────────────────────────────────────

describe("scenario count limits", () => {
  it("returns TOO_MANY_SCENARIOS above the limit", async () => {
    const service = makeService();
    const targets = Array.from(
      { length: MCP_LIMITS.maxScenarios + 1 },
      (_, index) => 400_000 + index * 1_000,
    );
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.compare_scenarios",
      { input: baseInput(), targets },
    );
    expectCode(envelope, "TOO_MANY_SCENARIOS");
  });

  it("accepts exactly three explicit scenario targets", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.compare_scenarios",
      { input: baseInput(), targets: [475_000, 500_000, 525_000] },
    );
    expect(envelope.ok).toBe(true);
  });

  it("rejects a non-three target array within the global scenario limit", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.compare_scenarios",
      { input: baseInput(), targets: [475_000, 500_000, 525_000, 550_000] },
    );
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("returns INVALID_PARAMS when targets is not an array", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.compare_scenarios",
      { input: baseInput(), targets: "nope" },
    );
    expectCode(envelope, "INVALID_PARAMS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pagination bounds
// ─────────────────────────────────────────────────────────────────────────────

describe("pagination bounds", () => {
  it("returns PAGINATION_OUT_OF_BOUNDS for a zero limit", async () => {
    const service = makeService();
    const envelope = await service.dispatch(runsCtx, "seller_net.list_runs", {
      limit: 0,
    });
    expectCode(envelope, "PAGINATION_OUT_OF_BOUNDS");
  });

  it("returns PAGINATION_OUT_OF_BOUNDS above the max page size", async () => {
    const service = makeService();
    const envelope = await service.dispatch(runsCtx, "seller_net.list_runs", {
      limit: MCP_LIMITS.maxPageSize + 1,
    });
    expectCode(envelope, "PAGINATION_OUT_OF_BOUNDS");
  });

  it("returns PAGINATION_OUT_OF_BOUNDS for a negative offset", async () => {
    const service = makeService();
    const envelope = await service.dispatch(runsCtx, "seller_net.list_runs", {
      offset: -1,
    });
    expectCode(envelope, "PAGINATION_OUT_OF_BOUNDS");
  });

  it("returns PAGINATION_OUT_OF_BOUNDS above the max offset", async () => {
    const service = makeService();
    const envelope = await service.dispatch(runsCtx, "seller_net.list_runs", {
      offset: MCP_LIMITS.maxOffset + 1,
    });
    expectCode(envelope, "PAGINATION_OUT_OF_BOUNDS");
  });

  it("returns PAGINATION_OUT_OF_BOUNDS for a non-integer limit", async () => {
    const service = makeService();
    const envelope = await service.dispatch(runsCtx, "seller_net.list_runs", {
      limit: 2.5,
    });
    expectCode(envelope, "PAGINATION_OUT_OF_BOUNDS");
  });

  it("applies the default page size when limit is omitted", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      runsCtx,
      "seller_net.list_runs",
      {},
    );
    expect(envelope.ok).toBe(true);
    expect((envelope.result as { limit: number }).limit).toBe(
      MCP_LIMITS.defaultPageSize,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Numeric safety: UNKNOWN distinct from explicit 0
// ─────────────────────────────────────────────────────────────────────────────

describe("numeric safety", () => {
  it("preserves UNKNOWN as distinct from an explicit 0 in provenance", async () => {
    const service = makeService();
    // `manualAdjustedPrice` is optional, so UNKNOWN remains calculable.
    const unknownEnvelope = await service.dispatch(
      readCtx,
      "seller_net.calculate",
      { input: baseInput({ manualAdjustedPrice: unknownField() }) },
    );
    const zeroEnvelope = await service.dispatch(
      readCtx,
      "seller_net.calculate",
      { input: baseInput({ manualAdjustedPrice: userProvided(0) }) },
    );
    const unknownProvenance = (
      unknownEnvelope.result as { provenance: Record<string, string> }
    ).provenance;
    const zeroProvenance = (
      zeroEnvelope.result as { provenance: Record<string, string> }
    ).provenance;
    expect(unknownProvenance.manualAdjustedPrice).toBe("UNKNOWN");
    expect(zeroProvenance.manualAdjustedPrice).toBe("USER_PROVIDED");
  });

  it("produces different input hashes for UNKNOWN and explicit 0", async () => {
    const service = makeService();
    const unknownEnvelope = await service.dispatch(
      readCtx,
      "seller_net.calculate",
      { input: baseInput({ manualAdjustedPrice: unknownField() }) },
    );
    const zeroEnvelope = await service.dispatch(
      readCtx,
      "seller_net.calculate",
      { input: baseInput({ manualAdjustedPrice: userProvided(0) }) },
    );
    const unknownHash = (
      unknownEnvelope.result as { result: { inputHash: string } }
    ).result.inputHash;
    const zeroHash = (zeroEnvelope.result as { result: { inputHash: string } })
      .result.inputHash;
    expect(unknownHash).not.toBe(zeroHash);
  });

  it("keeps every numeric output finite", async () => {
    const service = makeService();
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: baseInput(),
    });
    const output = (
      envelope.result as { result: { output: Record<string, unknown> } }
    ).result.output;
    for (const value of Object.values(output)) {
      if (typeof value === "number") {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("rejects an oversized serialized input with OUT_OF_RANGE", async () => {
    const service = makeService();
    const huge = "x".repeat(MCP_LIMITS.maxJsonBytes + 1);
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: { ...baseInput(), padding: huge },
    });
    expectCode(envelope, "OUT_OF_RANGE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Structured error surface
// ─────────────────────────────────────────────────────────────────────────────

describe("structured error surface", () => {
  it("never throws out of dispatch for any malformed params", async () => {
    const service = makeService();
    const malformed: unknown[] = [
      null,
      undefined,
      42,
      "string",
      [],
      { input: null },
      { input: [] },
    ];
    for (const params of malformed) {
      const envelope = await service.dispatch(
        readCtx,
        "seller_net.calculate",
        params,
      );
      expect(envelope.ok).toBe(false);
      expect(MCP_ERROR_CODES).toContain(envelope.error?.code);
    }
  });

  it("carries a JSON-RPC numeric code on every structured error", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.list_runs",
      {},
    );
    expect(typeof envelope.error?.jsonRpcCode).toBe("number");
  });

  it("attaches audit metadata to failures", async () => {
    const service = makeService();
    const envelope = await service.dispatch(
      readCtx,
      "seller_net.calculate",
      {},
      "req-fail-1",
    );
    expect(envelope.audit.requestId).toBe("req-fail-1");
    expect(envelope.audit.outcome).toBe("failure");
  });
});


describe("strict MCP input shape", () => {
  it("rejects a provenanced field whose value is not numeric/null", async () => {
    const service = makeService();
    const malformed = {
      ...baseInput(),
      basePrice: { value: "500000", provenance: "USER_PROVIDED" },
    };
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: malformed,
    });
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("rejects an unknown provenance state", async () => {
    const service = makeService();
    const malformed = {
      ...baseInput(),
      basePrice: { value: 500000, provenance: "GUESSED" },
    };
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: malformed,
    });
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("rejects unsupported enum values", async () => {
    const service = makeService();
    const malformed = { ...baseInput(), conditionTier: "MAGICAL" };
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: malformed,
    });
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("rejects unexpected top-level input keys", async () => {
    const service = makeService();
    const malformed = { ...baseInput(), injected: true };
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input: malformed,
    });
    expectCode(envelope, "INVALID_PARAMS");
  });

  it("advertises concrete SellerNetInput properties in tool discovery", async () => {
    const service = makeService();
    const envelope = await service.capabilities(readCtx);
    const calculate = envelope.result?.tools.find(
      (tool) => tool.name === "seller_net.calculate",
    );
    const input = calculate?.inputSchema.properties?.input;
    expect(input?.properties?.basePrice).toBeDefined();
    expect(input?.properties?.conditionTier?.enum).toContain("GOOD");
    expect(input?.additionalProperties).toBe(false);
  });
});


describe("authoritative calculation failure", () => {
  it("returns CALCULATION_FAILED instead of a zeroed result for HECM overflow", async () => {
    const service = makeService();
    const input = baseInput({
      isHecm: true,
      mortgageBalance: userProvided(0),
      hecmInitialBalance: userProvided(1_000_000_000),
      hecmCurrentRateBps: userProvided(10_000),
      hecmLifetimeCapBps: userProvided(0),
      hecmMonthsElapsed: userProvided(10_000),
    });
    const envelope = await service.dispatch(readCtx, "seller_net.calculate", {
      input,
    });
    expectCode(envelope, "CALCULATION_FAILED");
  });
});
