import {
  MCP_PROTOCOL_VERSION,
  MCP_RESOURCE_URIS,
  MCP_SCHEMA_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOOL_NAMES,
  type McpAuthContext,
  type McpPrincipal,
  type McpService,
  type McpTokenVerifier,
  type RunRecordPayload,
  type RunRecordStore,
  SCOPE_READ,
  SCOPE_RUNS,
  anonymousAuthContext,
  createMcpService,
} from "@/lib/mcp";
import {
  type McpHttpRequest,
  createMcpTransport,
  extractBearerToken,
} from "@/lib/mcp/transport";
import {
  CALCULATOR_VERSION,
  SELLER_NET_CONFIG,
  type SellerNetInput,
  calculateSellerNetWaterfall,
  defaultAssumption,
  unknownField,
  userProvided,
} from "@/lib/seller-net";
import { describe, expect, it, vi } from "vitest";

/**
 * MCP JSON-RPC transport coverage.
 *
 * The transport is the only module that knows about wire framing and
 * credentials. These tests drive it through the minimal HTTP shape and through
 * the pure `handleJsonRpcRequest` entry point, and assert that it dispatches
 * only through the `McpService` interface — never the calculator, never the
 * backend. Transport isolation is proven by injecting a stub service and by
 * showing that a failing endpoint never throws out of `handle`.
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

const RUNS_PRINCIPAL: McpPrincipal = {
  id: "principal-runs",
  anonymous: false,
  scopes: [SCOPE_READ, SCOPE_RUNS],
};

/** A verifier that resolves one known token to a scoped principal. */
function createVerifier(): McpTokenVerifier {
  return {
    verify: vi.fn(async (token: string) =>
      token === "good-token" ? RUNS_PRINCIPAL : null,
    ),
  };
}

function makeTransport(service?: McpService) {
  const actualService =
    service ?? createMcpService({ store: createMemoryStore() });
  const verifier = createVerifier();
  return {
    service: actualService,
    verifier,
    transport: createMcpTransport({ service: actualService, verifier }),
  };
}

/** Build a POST request with an optional bearer token. */
function post(body: unknown, token?: string): McpHttpRequest {
  return {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

/** Parse a transport response body as JSON. */
function parseBody(response: { body: string }): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bearer extraction
// ─────────────────────────────────────────────────────────────────────────────

describe("bearer extraction", () => {
  it("extracts a bearer token case-insensitively", () => {
    expect(extractBearerToken({ Authorization: "Bearer abc.def" })).toBe(
      "abc.def",
    );
    expect(extractBearerToken({ authorization: "bearer xyz" })).toBe("xyz");
  });

  it("returns undefined when the header is absent or not a bearer scheme", () => {
    expect(extractBearerToken({})).toBeUndefined();
    expect(extractBearerToken({ authorization: "Basic abc" })).toBeUndefined();
    expect(extractBearerToken({ authorization: "Bearer" })).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// initialize
// ─────────────────────────────────────────────────────────────────────────────

describe("initialize", () => {
  it("returns the protocol version, capabilities, and server info", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    );
    expect(response.status).toBe(200);
    const body = parseBody(response);
    const result = body.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(result.schemaVersion).toBe(MCP_SCHEMA_VERSION);
    expect(result.serverInfo).toEqual({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });
    expect(body.id).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ping
// ─────────────────────────────────────────────────────────────────────────────

describe("ping", () => {
  it("returns an empty result", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({ jsonrpc: "2.0", id: "p1", method: "ping" }),
    );
    const body = parseBody(response);
    expect(body.result).toEqual({});
    expect(body.id).toBe("p1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// tools/list
// ─────────────────────────────────────────────────────────────────────────────

describe("tools/list", () => {
  it("returns all ten tools with JSON schemas", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    );
    const body = parseBody(response);
    const result = body.result as { tools: Array<Record<string, unknown>> };
    expect(result.tools).toHaveLength(10);
    expect(result.tools.map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES]);
    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// tools/call
// ─────────────────────────────────────────────────────────────────────────────

describe("tools/call", () => {
  it("dispatches a public tool and returns structured content", async () => {
    const { transport } = makeTransport();
    const input = baseInput();
    const response = await transport.handle(
      post({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "seller_net.calculate", arguments: { input } },
      }),
    );
    const body = parseBody(response);
    const result = body.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: { result: { inputHash: string } };
      isError: boolean;
    };
    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe("text");
    expect(result.structuredContent.result.inputHash).toBe(
      calculateSellerNetWaterfall(input).inputHash,
    );
  });

  it("returns a JSON-RPC error for an unknown tool name", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "seller_net.nope", arguments: {} },
      }),
    );
    const body = parseBody(response);
    const error = body.error as { code: number; data: { code: string } };
    expect(error.code).toBe(-32601);
    expect(error.data.code).toBe("UNKNOWN_TOOL");
  });

  it("returns a structured authorization error for a protected tool without a token", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "seller_net.create_run",
          arguments: { runId: "r1", propertyId: "p1", input: baseInput() },
        },
      }),
    );
    const body = parseBody(response);
    const error = body.error as { data: { code: string } };
    expect(error.data.code).toBe("UNAUTHORIZED");
  });

  it("returns FORBIDDEN when a protected call presents an invalid bearer token", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post(
        {
          jsonrpc: "2.0",
          id: "invalid-token",
          method: "tools/call",
          params: {
            name: "seller_net.create_run",
            arguments: { runId: "r1", propertyId: "p1", input: baseInput() },
          },
        },
        "bad-token",
      ),
    );
    const body = parseBody(response);
    const error = body.error as { data: { code: string } };
    expect(error.data.code).toBe("FORBIDDEN");
  });

  it("dispatches a protected tool when a valid bearer token is presented", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post(
        {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "seller_net.create_run",
            arguments: { runId: "r1", propertyId: "p1", input: baseInput() },
          },
        },
        "good-token",
      ),
    );
    const body = parseBody(response);
    const result = body.result as { isError: boolean };
    expect(result.isError).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resources/list and resources/read
// ─────────────────────────────────────────────────────────────────────────────

describe("resources/list", () => {
  it("lists the four read-only resources", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({ jsonrpc: "2.0", id: 7, method: "resources/list" }),
    );
    const body = parseBody(response);
    const result = body.result as { resources: Array<{ uri: string }> };
    expect(result.resources.map((resource) => resource.uri)).toEqual([
      MCP_RESOURCE_URIS.schema,
      MCP_RESOURCE_URIS.config,
      MCP_RESOURCE_URIS.calculator,
      MCP_RESOURCE_URIS.provenance,
    ]);
  });
});

describe("resources/read", () => {
  it("reads a known resource", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({
        jsonrpc: "2.0",
        id: 8,
        method: "resources/read",
        params: { uri: MCP_RESOURCE_URIS.config },
      }),
    );
    const body = parseBody(response);
    const result = body.result as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    expect(result.contents[0].uri).toBe(MCP_RESOURCE_URIS.config);
    expect(JSON.parse(result.contents[0].text)).toEqual(SELLER_NET_CONFIG);
  });

  it("returns NOT_FOUND for an unknown resource", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({
        jsonrpc: "2.0",
        id: 9,
        method: "resources/read",
        params: { uri: "seller_net://nope" },
      }),
    );
    const body = parseBody(response);
    const error = body.error as { data: { code: string } };
    expect(error.data.code).toBe("NOT_FOUND");
  });

  it("rejects a missing uri with an invalid-params error", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({ jsonrpc: "2.0", id: 10, method: "resources/read", params: {} }),
    );
    const body = parseBody(response);
    const error = body.error as { code: number };
    expect(error.code).toBe(-32602);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Framing and method handling
// ─────────────────────────────────────────────────────────────────────────────

describe("framing and method handling", () => {
  it("rejects a non-POST method with 405", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle({
      method: "GET",
      headers: {},
      body: "",
    });
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("POST");
  });

  it("returns a parse error for malformed JSON", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(post("{not json"));
    const body = parseBody(response);
    const error = body.error as { code: number };
    expect(error.code).toBe(-32700);
    expect(body.id).toBeNull();
  });

  it("returns an invalid-request error for a non-JSON-RPC body", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(post({ hello: "world" }));
    const body = parseBody(response);
    const error = body.error as { code: number };
    expect(error.code).toBe(-32600);
  });

  it("returns method-not-found for an unknown method", async () => {
    const { transport } = makeTransport();
    const response = await transport.handle(
      post({ jsonrpc: "2.0", id: 11, method: "tools/nope" }),
    );
    const body = parseBody(response);
    const error = body.error as { code: number };
    expect(error.code).toBe(-32601);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Transport isolation from business logic
// ─────────────────────────────────────────────────────────────────────────────

describe("transport isolation", () => {
  it("dispatches only through the McpService interface", async () => {
    const dispatch = vi.fn(async () => ({
      ok: true as const,
      result: { stubbed: true },
      audit: {
        requestId: "req-stub",
        toolName: "seller_net.calculate",
        calculatorVersion: CALCULATOR_VERSION,
        schemaVersion: MCP_SCHEMA_VERSION,
        outcome: "success" as const,
        durationMs: 0,
        completedAt: new Date(0).toISOString(),
      },
    }));
    const stubService = {
      dispatch,
      toolDescriptors: () => [],
      capabilities: vi.fn(),
      readResource: vi.fn(),
    } as unknown as McpService;

    const { transport } = makeTransport(stubService);
    const response = await transport.handle(
      post({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: { name: "seller_net.calculate", arguments: { input: {} } },
      }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    const body = parseBody(response);
    const result = body.result as { structuredContent: { stubbed: boolean } };
    expect(result.structuredContent.stubbed).toBe(true);
  });

  it("returns a structured JSON-RPC error when the service rejects", async () => {
    const stubService = {
      dispatch: vi.fn(async () => {
        throw new Error("boom");
      }),
      toolDescriptors: () => [],
      capabilities: vi.fn(),
      readResource: vi.fn(),
    } as unknown as McpService;

    const { transport } = makeTransport(stubService);
    const response = await transport.handle(
      post({
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: { name: "seller_net.calculate", arguments: {} },
      }),
    );
    expect(response.status).toBe(200);
    const body = parseBody(response);
    const error = body.error as { code: number; data: { code: string } };
    expect(error.code).toBe(-32603);
    expect(error.data.code).toBe("INTERNAL_ERROR");
    expect(body.id).toBe(13);
  });

  it("handles a JSON-RPC request directly without HTTP plumbing", async () => {
    const { transport } = makeTransport();
    const response = await transport.handleJsonRpcRequest(
      { jsonrpc: "2.0", id: 14, method: "ping" },
      anonymousAuthContext,
    );
    expect(response).toEqual({ jsonrpc: "2.0", result: {}, id: 14 });
  });

  it("keeps the anonymous context scope-free for protected tools", async () => {
    const { transport } = makeTransport();
    const response = await transport.handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 15,
        method: "tools/call",
        params: {
          name: "seller_net.list_runs",
          arguments: {},
        },
      },
      anonymousAuthContext,
    );
    const error = (response as { error: { data: { code: string } } }).error;
    expect(error.data.code).toBe("UNAUTHORIZED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth context resolution through the transport
// ─────────────────────────────────────────────────────────────────────────────

describe("auth context resolution", () => {
  it("treats an invalid token as forbidden rather than anonymous", async () => {
    const { transport, verifier } = makeTransport();
    const response = await transport.handle(
      post(
        {
          jsonrpc: "2.0",
          id: 16,
          method: "tools/call",
          params: {
            name: "seller_net.create_run",
            arguments: { runId: "r1", propertyId: "p1", input: baseInput() },
          },
        },
        "bad-token",
      ),
    );
    expect(verifier.verify).toHaveBeenCalledWith("bad-token");
    const body = parseBody(response);
    const error = body.error as { data: { code: string } };
    expect(error.data.code).toBe("FORBIDDEN");
  });

  it("does not call the verifier when no token is present", async () => {
    const { transport, verifier } = makeTransport();
    await transport.handle(
      post({ jsonrpc: "2.0", id: 17, method: "tools/list" }),
    );
    expect(verifier.verify).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end run flow through the transport
// ─────────────────────────────────────────────────────────────────────────────

describe("run flow through the transport", () => {
  it("creates and retrieves a run over JSON-RPC", async () => {
    const { transport } = makeTransport();
    const input = baseInput();
    const created = await transport.handle(
      post(
        {
          jsonrpc: "2.0",
          id: 18,
          method: "tools/call",
          params: {
            name: "seller_net.create_run",
            arguments: { runId: "run-e2e", propertyId: "prop-1", input },
          },
        },
        "good-token",
      ),
    );
    const createdBody = parseBody(created);
    expect((createdBody.result as { isError: boolean }).isError).toBe(false);

    const fetched = await transport.handle(
      post(
        {
          jsonrpc: "2.0",
          id: 19,
          method: "tools/call",
          params: {
            name: "seller_net.get_run",
            arguments: { runId: "run-e2e" },
          },
        },
        "good-token",
      ),
    );
    const fetchedBody = parseBody(fetched);
    const structured = (
      fetchedBody.result as {
        structuredContent: { record: { inputHash: string } };
      }
    ).structuredContent;
    expect(structured.record.inputHash).toBe(
      calculateSellerNetWaterfall(input).inputHash,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Local helper
// ─────────────────────────────────────────────────────────────────────────────

function unusedAuthContext(): McpAuthContext {
  return { principal: { id: "unused", anonymous: true, scopes: [] } };
}
void unusedAuthContext;
