import {
  MCP_LIMITS,
  MCP_RESOURCE_URIS,
  MCP_SCHEMA_VERSION,
  MCP_TOOL_NAMES,
  type McpAuthContext,
  type McpPrincipal,
  type McpService,
  type RunRecordPayload,
  type RunRecordStore,
  SCOPE_READ,
  SCOPE_RUNS,
  createMcpService,
} from "@/lib/mcp";
import {
  CALCULATOR_VERSION,
  PROVENANCE_STATES,
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  computeScenarios,
  defaultAssumption,
  unknownField,
  userProvided,
  validateInput,
} from "@/lib/seller-net";
import { describe, expect, it } from "vitest";

/**
 * MCP tool contract coverage.
 *
 * These tests drive the provider-neutral `McpService` directly (no transport)
 * and assert that every tool delegates to the canonical calculator rather than
 * re-deriving a financial figure. The canonical calculator suites remain
 * authoritative for the numbers; here we pin the integration contract: tool
 * discovery, validation passthrough, calculation identity (same output, same
 * input hash, same calculator version), the HECM / Section 121 / friction
 * branches, scenario parity, run persistence and replay, provenance and review
 * domains, audit metadata, schema versioning, and the read-only resources.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures and in-memory store
// ─────────────────────────────────────────────────────────────────────────────

/** A complete, calculable non-HECM input with every field explicitly provided. */
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

/** A complete, calculable HECM input. */
function hecmInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
  return baseInput({
    isHecm: true,
    hecmInitialBalance: userProvided(400_000),
    hecmCurrentRateBps: userProvided(500),
    hecmLifetimeCapBps: userProvided(0),
    hecmMonthsElapsed: userProvided(24),
    ...overrides,
  });
}

/** A complete, calculable input with the Section 121 tax module active. */
function taxInput(overrides: Partial<SellerNetInput> = {}): SellerNetInput {
  return baseInput({
    originalPurchasePrice: userProvided(300_000),
    capitalImprovements: userProvided(50_000),
    section121Status: "SINGLE",
    estimatedCapitalGainsTaxRateBps: userProvided(1_500),
    ...overrides,
  });
}

/** A complete, calculable input with the market/time friction module active. */
function frictionInput(
  overrides: Partial<SellerNetInput> = {},
): SellerNetInput {
  return baseInput({
    monthlyCarryingCost: userProvided(2_400),
    pctExpectedDom: userProvided(90),
    pctExpectedDiscountPct: userProvided(0.05),
    ...overrides,
  });
}

/** An underwater input: encumbrances exceed the gross price. */
function underwaterInput(
  overrides: Partial<SellerNetInput> = {},
): SellerNetInput {
  return baseInput({
    basePrice: userProvided(300_000),
    mortgageBalance: userProvided(420_000),
    ...overrides,
  });
}

/** An in-memory RunRecordStore adapter, keyed by owner then runId. */
function createMemoryStore(): RunRecordStore & {
  records: Map<string, Map<string, RunRecordPayload>>;
} {
  const records = new Map<string, Map<string, RunRecordPayload>>();
  const bucket = (owner: string): Map<string, RunRecordPayload> => {
    const existing = records.get(owner);
    if (existing) return existing;
    const created = new Map<string, RunRecordPayload>();
    records.set(owner, created);
    return created;
  };
  return {
    records,
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

// ─────────────────────────────────────────────────────────────────────────────
// Tool discovery
// ─────────────────────────────────────────────────────────────────────────────

describe("tool discovery", () => {
  it("lists all ten seller_net.* tools with JSON schemas", async () => {
    const service = makeService();
    const envelope = await service.capabilities(readCtx);
    expect(envelope.ok).toBe(true);
    const tools = envelope.result?.tools ?? [];
    expect(tools).toHaveLength(10);
    expect(tools.map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.outputSchema.type).toBe("object");
    }
  });

  it("reports the schema, protocol, and calculator versions", async () => {
    const service = makeService();
    const envelope = await service.capabilities(readCtx);
    expect(envelope.result?.schemaVersion).toBe(MCP_SCHEMA_VERSION);
    expect(envelope.result?.calculatorVersion).toBe(CALCULATOR_VERSION);
    expect(envelope.result?.protocolVersion).toBe("2024-11-05");
  });

  it("marks run tools as scope-protected and read tools as public", async () => {
    const service = makeService();
    const envelope = await service.capabilities(readCtx);
    const byName = new Map(
      (envelope.result?.tools ?? []).map((tool) => [tool.name, tool]),
    );
    expect(byName.get("seller_net.calculate")?.requiredScope).toBeNull();
    expect(byName.get("seller_net.create_run")?.requiredScope).toBe(SCOPE_RUNS);
    expect(byName.get("seller_net.get_run")?.requiredScope).toBe(SCOPE_RUNS);
    expect(byName.get("seller_net.list_runs")?.requiredScope).toBe(SCOPE_RUNS);
  });

  it("exposes the same descriptors through toolDescriptors()", () => {
    const service = makeService();
    const descriptors = service.toolDescriptors();
    expect(descriptors.map((descriptor) => descriptor.name)).toEqual([
      ...MCP_TOOL_NAMES,
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("validation", () => {
  it("returns the canonical validation result for a valid input", async () => {
    const service = makeService();
    const input = baseInput();
    const envelope = await service.validate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.validation).toEqual(validateInput(input));
    expect(envelope.result?.validation.valid).toBe(true);
  });

  it("returns the canonical validation result for an invalid input", async () => {
    const service = makeService();
    const input = baseInput({ basePrice: unknownField() });
    const envelope = await service.validate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.validation).toEqual(validateInput(input));
    expect(envelope.result?.validation.valid).toBe(false);
    expect(envelope.result?.validation.missingFields).toContain("basePrice");
  });

  it("reports the calculator version alongside the validation result", async () => {
    const service = makeService();
    const envelope = await service.validate(readCtx, { input: baseInput() });
    expect(envelope.result?.calculatorVersion).toBe(CALCULATOR_VERSION);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Standard calculation
// ─────────────────────────────────────────────────────────────────────────────

describe("standard calculation", () => {
  it("returns the same output as the canonical calculator", async () => {
    const service = makeService();
    const input = baseInput();
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.result).toEqual(calculateSellerNetWaterfall(input));
  });

  it("matches the canonical input hash and calculator version", async () => {
    const service = makeService();
    const input = baseInput();
    const canonical = calculateSellerNetWaterfall(input);
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.result?.result.inputHash).toBe(canonical.inputHash);
    expect(envelope.result?.result.calculatorVersion).toBe(CALCULATOR_VERSION);
  });

  it("is deterministic across repeated calls", async () => {
    const service = makeService();
    const input = baseInput();
    const first = await service.calculate(readCtx, { input });
    const second = await service.calculate(readCtx, { input });
    expect(first.result?.result).toEqual(second.result?.result);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verified payoff provenance
// ─────────────────────────────────────────────────────────────────────────────

describe("verified payoff", () => {
  it("flows a VERIFIED_PAYOFF input through to the canonical result", async () => {
    const service = makeService();
    const input = baseInput({
      mortgageBalance: {
        value: 287_450.12,
        provenance: "VERIFIED_PAYOFF",
      },
      mortgagePayoffMode: "VERIFIED_PAYOFF",
    });
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.result).toEqual(calculateSellerNetWaterfall(input));
    expect(envelope.result?.provenance.mortgageBalance).toBe("VERIFIED_PAYOFF");
  });

  it("echoes the verified payoff value without recomputing it", async () => {
    const service = makeService();
    const input = baseInput({
      mortgageBalance: { value: 287_450.12, provenance: "VERIFIED_PAYOFF" },
    });
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.result?.result.output.mortgagePayoff).toBe(287_450.12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HECM
// ─────────────────────────────────────────────────────────────────────────────

describe("HECM", () => {
  it("produces the canonical HECM result", async () => {
    const service = makeService();
    const input = hecmInput();
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.result).toEqual(calculateSellerNetWaterfall(input));
    expect(envelope.result?.result.output.hecmAccruedPayoff).not.toBeNull();
  });

  it("reports the LENDER review domain", async () => {
    const service = makeService();
    const envelope = await service.calculate(readCtx, { input: hecmInput() });
    expect(envelope.result?.professionalReviewDomains).toContain("LENDER");
  });

  it("disables the standard mortgage payoff while HECM is active", async () => {
    const service = makeService();
    const envelope = await service.calculate(readCtx, { input: hecmInput() });
    expect(envelope.result?.result.output.mortgagePayoff).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 121 tax
// ─────────────────────────────────────────────────────────────────────────────

describe("Section 121 tax", () => {
  it("produces the canonical tax result", async () => {
    const service = makeService();
    const input = taxInput();
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.result).toEqual(calculateSellerNetWaterfall(input));
    expect(envelope.result?.result.output.taxActive).toBe(true);
  });

  it("reports the CPA_TAX review domain", async () => {
    const service = makeService();
    const envelope = await service.calculate(readCtx, { input: taxInput() });
    expect(envelope.result?.professionalReviewDomains).toContain("CPA_TAX");
  });

  it("applies the canonical Section 121 exemption", async () => {
    const service = makeService();
    const envelope = await service.calculate(readCtx, { input: taxInput() });
    expect(envelope.result?.result.output.section121Exemption).toBe(250_000);
    expect(envelope.result?.result.output.section121EligibilityAssumed).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Friction
// ─────────────────────────────────────────────────────────────────────────────

describe("friction", () => {
  it("produces the canonical friction result", async () => {
    const service = makeService();
    const input = frictionInput();
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.result).toEqual(calculateSellerNetWaterfall(input));
    expect(envelope.result?.result.output.frictionActive).toBe(true);
  });

  it("keeps friction supplemental to estimated net proceeds", async () => {
    const service = makeService();
    const envelope = await service.calculate(readCtx, {
      input: frictionInput(),
    });
    const output = envelope.result?.result.output;
    expect(output?.probabilisticTrueNet).toBeLessThanOrEqual(
      output?.estimatedNetProceeds ?? 0,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("scenarios", () => {
  it("returns one canonical result per scenario", async () => {
    const service = makeService();
    const input = baseInput();
    const envelope = await service.compareScenarios(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.comparison.scenarios).toHaveLength(3);
    expect(envelope.result?.comparison.scenarios.map((s) => s.key)).toEqual([
      "downside",
      "current",
      "upside",
    ]);
  });

  it("matches a direct canonical computeScenarios call", async () => {
    const service = makeService();
    const input = baseInput();
    const current = calculateSellerNetWaterfall(input);
    const envelope = await service.compareScenarios(readCtx, { input });
    expect(envelope.result?.comparison).toEqual(
      computeScenarios(input, current),
    );
  });

  it("honours an explicit spread", async () => {
    const service = makeService();
    const input = baseInput();
    const current = calculateSellerNetWaterfall(input);
    const envelope = await service.compareScenarios(readCtx, {
      input,
      spread: 10_000,
    });
    expect(envelope.result?.comparison).toEqual(
      computeScenarios(input, current, 10_000),
    );
    expect(envelope.result?.comparison.spread).toBe(10_000);
  });

  it("matches direct canonical calls for each scenario figure", async () => {
    const service = makeService();
    const input = baseInput();
    const envelope = await service.compareScenarios(readCtx, { input });
    const current = calculateSellerNetWaterfall(input);
    const direct = computeScenarios(input, current);
    for (const [index, scenario] of (
      envelope.result?.comparison.scenarios ?? []
    ).entries()) {
      expect(scenario.figures).toEqual(direct.scenarios[index].figures);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Underwater seller
// ─────────────────────────────────────────────────────────────────────────────

describe("underwater seller", () => {
  it("produces the canonical shortfall result", async () => {
    const service = makeService();
    const input = underwaterInput();
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.result).toEqual(calculateSellerNetWaterfall(input));
    expect(envelope.result?.result.output.estimatedNetProceeds).toBe(0);
    expect(
      envelope.result?.result.output.estimatedSellerShortfall,
    ).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Run creation, retrieval, and replay
// ─────────────────────────────────────────────────────────────────────────────

describe("run creation, retrieval, and replay", () => {
  it("creates a run and replays it to the identical output", async () => {
    const service = makeService();
    const input = baseInput();
    const created = await service.createRun(runsCtx, {
      runId: "run-1",
      propertyId: "prop-1",
      input,
    });
    expect(created.ok).toBe(true);

    const fetched = await service.getRun(runsCtx, { runId: "run-1" });
    expect(fetched.ok).toBe(true);
    const record = fetched.result?.record;
    expect(record).toBeDefined();

    const replayed = calculateSellerNetWaterfall(record!.effectiveInputs);
    expect(replayed.output).toEqual(record!.outputs);
    expect(replayed.inputHash).toBe(record!.inputHash);
    expect(replayed.calculatorVersion).toBe(record!.calculatorVersion);
  });

  it("stores the exact effective inputs the calculator used", async () => {
    const service = makeService();
    const input = baseInput();
    await service.createRun(runsCtx, {
      runId: "run-2",
      propertyId: "prop-2",
      input,
    });
    const fetched = await service.getRun(runsCtx, { runId: "run-2" });
    expect(fetched.result?.record.effectiveInputs).toEqual(input);
    expect(fetched.result?.record.inputHash).toBe(
      calculateSellerNetWaterfall(input).inputHash,
    );
  });

  it("rejects a duplicate run id with DUPLICATE_RUN", async () => {
    const service = makeService();
    const params = {
      runId: "run-dup",
      propertyId: "prop-1",
      input: baseInput(),
    };
    await service.createRun(runsCtx, params);
    const second = await service.createRun(runsCtx, params);
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("DUPLICATE_RUN");
  });

  it("returns NOT_FOUND for an unknown run id", async () => {
    const service = makeService();
    const envelope = await service.getRun(runsCtx, { runId: "missing" });
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("NOT_FOUND");
  });

  it("lists runs newest first with pagination metadata", async () => {
    const service = makeService();
    for (const runId of ["run-a", "run-b", "run-c"]) {
      await service.createRun(runsCtx, {
        runId,
        propertyId: "prop-1",
        input: baseInput(),
      });
    }
    const envelope = await service.listRuns(runsCtx, { limit: 2, offset: 0 });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.total).toBe(3);
    expect(envelope.result?.records).toHaveLength(2);
    expect(envelope.result?.limit).toBe(2);
    expect(envelope.result?.offset).toBe(0);
  });

  it("isolates run records per principal", async () => {
    const service = makeService();
    await service.createRun(runsCtx, {
      runId: "run-owned",
      propertyId: "prop-1",
      input: baseInput(),
    });
    const otherCtx: McpAuthContext = {
      principal: {
        id: "principal-other",
        anonymous: false,
        scopes: [SCOPE_READ, SCOPE_RUNS],
      },
    };
    const envelope = await service.getRun(otherCtx, { runId: "run-owned" });
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("NOT_FOUND");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// explain_result
// ─────────────────────────────────────────────────────────────────────────────

describe("explain_result", () => {
  it("restructures an existing result without introducing new numbers", async () => {
    const service = makeService();
    const input = baseInput();
    const canonical = calculateSellerNetWaterfall(input);
    const envelope = await service.explainResult(readCtx, {
      result: canonical,
    });
    expect(envelope.ok).toBe(true);
    const lines = envelope.result?.lines ?? [];
    expect(lines.length).toBeGreaterThan(0);
    const allowed = new Set<number | null>([
      canonical.output.grossPrice,
      canonical.output.totalCommissions,
      canonical.output.totalClosingCosts,
      canonical.output.totalEncumbrances,
      canonical.output.totalDeductions,
      canonical.output.estimatedNetProceeds,
      canonical.output.estimatedSellerShortfall,
      canonical.output.hecmAccruedPayoff,
      canonical.output.estimatedTaxOwed,
      canonical.output.probabilisticTrueNet,
    ]);
    for (const line of lines) {
      expect(allowed.has(line.value)).toBe(true);
    }
  });

  it("explains a stored run by runId", async () => {
    const service = makeService();
    const input = baseInput();
    await service.createRun(runsCtx, {
      runId: "run-explain",
      propertyId: "prop-1",
      input,
    });
    const envelope = await service.explainResult(runsCtx, {
      runId: "run-explain",
    });
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.lines.length).toBeGreaterThan(0);
  });

  it("reports the review domains of the explained result", async () => {
    const service = makeService();
    const envelope = await service.explainResult(readCtx, {
      result: calculateSellerNetWaterfall(hecmInput()),
    });
    expect(envelope.result?.professionalReviewDomains).toContain("LENDER");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────

describe("health", () => {
  it("returns service status, schema version, and calculator version", async () => {
    const service = makeService();
    const envelope = await service.health(readCtx);
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.status).toBe("ok");
    expect(envelope.result?.schemaVersion).toBe(MCP_SCHEMA_VERSION);
    expect(envelope.result?.calculatorVersion).toBe(CALCULATOR_VERSION);
    expect(envelope.result?.calculatorAvailable).toBe(true);
    expect(envelope.result?.persistenceAvailable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Provenance states and review domains
// ─────────────────────────────────────────────────────────────────────────────

describe("provenance and review domains", () => {
  it("echoes all five provenance states", async () => {
    const service = makeService();
    // Only non-required fields may be UNKNOWN without failing validation, so
    // the five states are demonstrated across optional fields.
    const input = baseInput({
      basePrice: userProvided(500_000),
      escrowRateBps: defaultAssumption(SELLER_NET_CONFIG.escrowRateBps),
      mortgageRateBps: estimate(500),
      mortgageMonthsRemaining: verifiedPayoff(24),
      manualAdjustedPrice: unknownField(),
    });
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.ok).toBe(true);
    const provenance = envelope.result?.provenance ?? {};
    expect(provenance.basePrice).toBe("USER_PROVIDED");
    expect(provenance.escrowRateBps).toBe("DEFAULT_ASSUMPTION");
    expect(provenance.mortgageRateBps).toBe("ESTIMATE");
    expect(provenance.mortgageMonthsRemaining).toBe("VERIFIED_PAYOFF");
    expect(provenance.manualAdjustedPrice).toBe("UNKNOWN");
    expect(new Set(Object.values(provenance))).toEqual(
      new Set(PROVENANCE_STATES),
    );
  });

  it("reports LENDER and CPA_TAX together when both modules are active", async () => {
    const service = makeService();
    const input = hecmInput({
      originalPurchasePrice: userProvided(300_000),
      capitalImprovements: userProvided(50_000),
      section121Status: "MARRIED",
      estimatedCapitalGainsTaxRateBps: userProvided(1_500),
    });
    const envelope = await service.calculate(readCtx, { input });
    expect(envelope.result?.professionalReviewDomains).toContain("LENDER");
    expect(envelope.result?.professionalReviewDomains).toContain("CPA_TAX");
  });

  it("reports no review domains for a plain calculation", async () => {
    const service = makeService();
    const envelope = await service.calculate(readCtx, { input: baseInput() });
    expect(envelope.result?.professionalReviewDomains).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Declared professional review domain vocabulary
// ─────────────────────────────────────────────────────────────────────────────

describe("declared review domain vocabulary", () => {
  it("declares ESCROW, TITLE, CPA_TAX, and LENDER in capabilities", async () => {
    const service = makeService();
    const envelope = await service.capabilities(readCtx);
    expect(envelope.result?.supportedProfessionalReviewDomains).toEqual([
      "ESCROW",
      "TITLE",
      "CPA_TAX",
      "LENDER",
    ]);
  });

  it("exposes the full vocabulary in the capabilities output schema enum", async () => {
    const service = makeService();
    const envelope = await service.capabilities(readCtx);
    const capabilitiesTool = (envelope.result?.tools ?? []).find(
      (tool) => tool.name === "seller_net.capabilities",
    );
    const domainSchema =
      capabilitiesTool?.outputSchema.properties
        ?.supportedProfessionalReviewDomains;
    expect(domainSchema?.type).toBe("array");
    expect(domainSchema?.items?.enum).toEqual([
      "ESCROW",
      "TITLE",
      "CPA_TAX",
      "LENDER",
    ]);
  });

  it("exposes the full vocabulary through the schema resource", async () => {
    const service = makeService();
    const content = await service.readResource(
      readCtx,
      MCP_RESOURCE_URIS.schema,
    );
    const parsed = JSON.parse(content!.text) as {
      supportedProfessionalReviewDomains: string[];
    };
    expect(parsed.supportedProfessionalReviewDomains).toEqual([
      "ESCROW",
      "TITLE",
      "CPA_TAX",
      "LENDER",
    ]);
  });

  it("echoes only the canonical active domains, never inventing ESCROW or TITLE", async () => {
    const service = makeService();
    const envelope = await service.calculate(readCtx, { input: hecmInput() });
    const domains = envelope.result?.professionalReviewDomains ?? [];
    expect(domains).toContain("LENDER");
    expect(domains).not.toContain("ESCROW");
    expect(domains).not.toContain("TITLE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit metadata
// ─────────────────────────────────────────────────────────────────────────────

describe("audit metadata", () => {
  it("carries requestId, toolName, versions, outcome, and duration", async () => {
    const service = makeService();
    const envelope = await service.calculate(
      readCtx,
      { input: baseInput() },
      "req-fixed-1",
    );
    expect(envelope.audit.requestId).toBe("req-fixed-1");
    expect(envelope.audit.toolName).toBe("seller_net.calculate");
    expect(envelope.audit.calculatorVersion).toBe(CALCULATOR_VERSION);
    expect(envelope.audit.schemaVersion).toBe(MCP_SCHEMA_VERSION);
    expect(envelope.audit.outcome).toBe("success");
    expect(envelope.audit.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof envelope.audit.completedAt).toBe("string");
  });

  it("marks a failed call with a failure outcome", async () => {
    const service = makeService();
    const envelope = await service.calculate(readCtx, {
      input: baseInput({ basePrice: unknownField() }),
    });
    expect(envelope.ok).toBe(false);
    expect(envelope.audit.outcome).toBe("failure");
    expect(envelope.audit.toolName).toBe("seller_net.calculate");
  });

  it("generates a requestId when none is supplied", async () => {
    const service = makeService();
    const envelope = await service.health(readCtx);
    expect(envelope.audit.requestId.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema versioning
// ─────────────────────────────────────────────────────────────────────────────

describe("schema versioning", () => {
  it("reports schema and calculator versions independently", async () => {
    const service = makeService();
    const envelope = await service.capabilities(readCtx);
    expect(envelope.result?.schemaVersion).toBe(MCP_SCHEMA_VERSION);
    expect(envelope.result?.calculatorVersion).toBe(CALCULATOR_VERSION);
    expect(envelope.result?.schemaVersion).not.toBe(
      envelope.result?.calculatorVersion,
    );
  });

  it("keeps the schema version stable across tools", async () => {
    const service = makeService();
    const health = await service.health(readCtx);
    const config = await service.getConfig(readCtx);
    expect(health.result?.schemaVersion).toBe(config.result?.schemaVersion);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Read-only resources
// ─────────────────────────────────────────────────────────────────────────────

describe("read-only resources", () => {
  it("lists the four resources", async () => {
    const service = makeService();
    const envelope = await service.capabilities(readCtx);
    const uris = (envelope.result?.resources ?? []).map((r) => r.uri);
    expect(uris).toEqual([
      MCP_RESOURCE_URIS.schema,
      MCP_RESOURCE_URIS.config,
      MCP_RESOURCE_URIS.calculator,
      MCP_RESOURCE_URIS.provenance,
    ]);
  });

  it("reads the schema resource", async () => {
    const service = makeService();
    const content = await service.readResource(
      readCtx,
      MCP_RESOURCE_URIS.schema,
    );
    expect(content).not.toBeNull();
    const parsed = JSON.parse(content!.text) as {
      schemaVersion: string;
      tools: unknown[];
    };
    expect(parsed.schemaVersion).toBe(MCP_SCHEMA_VERSION);
    expect(parsed.tools).toHaveLength(10);
  });

  it("reads the config resource verbatim", async () => {
    const service = makeService();
    const content = await service.readResource(
      readCtx,
      MCP_RESOURCE_URIS.config,
    );
    expect(JSON.parse(content!.text)).toEqual(SELLER_NET_CONFIG);
  });

  it("reads the calculator metadata resource", async () => {
    const service = makeService();
    const content = await service.readResource(
      readCtx,
      MCP_RESOURCE_URIS.calculator,
    );
    const parsed = JSON.parse(content!.text) as { calculatorVersion: string };
    expect(parsed.calculatorVersion).toBe(CALCULATOR_VERSION);
  });

  it("reads the provenance documentation resource", async () => {
    const service = makeService();
    const content = await service.readResource(
      readCtx,
      MCP_RESOURCE_URIS.provenance,
    );
    const parsed = JSON.parse(content!.text) as { states: string[] };
    expect(parsed.states).toEqual([...PROVENANCE_STATES]);
  });

  it("returns null for an unknown resource uri", async () => {
    const service = makeService();
    const content = await service.readResource(readCtx, "seller_net://nope");
    expect(content).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Numeric safety: UNKNOWN distinct from explicit 0
// ─────────────────────────────────────────────────────────────────────────────

describe("numeric safety", () => {
  it("preserves UNKNOWN as distinct from an explicit 0", async () => {
    const service = makeService();
    // `manualAdjustedPrice` is optional, so UNKNOWN is calculable; an explicit
    // 0 is a different provenance and a different input identity.
    const unknownEnvelope = await service.calculate(readCtx, {
      input: baseInput({ manualAdjustedPrice: unknownField() }),
    });
    const zeroEnvelope = await service.calculate(readCtx, {
      input: baseInput({ manualAdjustedPrice: userProvided(0) }),
    });
    expect(unknownEnvelope.ok).toBe(true);
    expect(zeroEnvelope.ok).toBe(true);
    expect(unknownEnvelope.result?.provenance.manualAdjustedPrice).toBe(
      "UNKNOWN",
    );
    expect(zeroEnvelope.result?.provenance.manualAdjustedPrice).toBe(
      "USER_PROVIDED",
    );
    expect(unknownEnvelope.result?.result.inputHash).not.toBe(
      zeroEnvelope.result?.result.inputHash,
    );
  });

  it("enforces the money range on scenario targets", async () => {
    const service = makeService();
    const envelope = await service.compareScenarios(readCtx, {
      input: baseInput(),
      targets: [MCP_LIMITS.maxMoney + 1],
    });
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("OUT_OF_RANGE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Local helper used by the provenance test
// ─────────────────────────────────────────────────────────────────────────────

function estimate(value: number) {
  return { value, provenance: "ESTIMATE" as const };
}

function verifiedPayoff(value: number) {
  return { value, provenance: "VERIFIED_PAYOFF" as const };
}


describe("explain_result stored-run authorization", () => {
  it("requires seller_net:runs scope when explanation is loaded by runId", async () => {
    const store = createMemoryStore();
    const service = createMcpService({ store });
    const ownerWithRuns: McpAuthContext = {
      principal: {
        id: "principal-shared",
        anonymous: false,
        scopes: [SCOPE_READ, SCOPE_RUNS],
      },
    };
    const sameOwnerWithoutRuns: McpAuthContext = {
      principal: {
        id: "principal-shared",
        anonymous: false,
        scopes: [SCOPE_READ],
      },
    };

    const created = await service.createRun(ownerWithRuns, {
      runId: "run-explain-auth",
      propertyId: "prop-explain-auth",
      input: baseInput(),
    });
    expect(created.ok).toBe(true);

    const denied = await service.explainResult(sameOwnerWithoutRuns, {
      runId: "run-explain-auth",
    });
    expect(denied.ok).toBe(false);
    expect(denied.error?.code).toBe("FORBIDDEN");

    const allowed = await service.explainResult(ownerWithRuns, {
      runId: "run-explain-auth",
    });
    expect(allowed.ok).toBe(true);
  });
});
