import {
  MCP_ERROR_CODES,
  MCP_JSONRPC_CODES,
  MCP_LIMITS,
  MCP_PROTOCOL_VERSION,
  MCP_RESOURCE_URIS,
  MCP_SCHEMA_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOOL_NAMES,
  type McpErrorCode,
  type McpPrincipal,
  type McpTokenVerifier,
  SCOPE_READ,
  SCOPE_RUNS,
  anonymousAuthContext,
  invalidCredentialsContext,
  hasScope,
  mcpError,
  resolveAuthContext,
} from "@/lib/mcp";
import { CALCULATOR_VERSION } from "@/lib/seller-net";
import { describe, expect, it, vi } from "vitest";

/**
 * MCP integration-layer contract characterization.
 *
 * A provider-neutral MCP integration layer is being added on top of the
 * existing Seller Net Waterfall app. The request is explicitly additive: it must
 * not alter any existing behavior. The layer's contract-only modules already
 * exist (version constants, stable error codes, safe limits, auth scopes, tool
 * and resource names), and the integration work will build on them.
 *
 * These tests freeze that existing contract surface so an implementation that
 * renumbers an error code, loosens a limit, renames a tool, or collapses the
 * schema/calculator version separation is caught here rather than in front of a
 * client. They assert only behavior that exists today and exercise no
 * calculator math — the canonical calculator suites stay authoritative for
 * financial figures.
 */

describe("version separation", () => {
  it("keeps the MCP schema version independent of the calculator version", () => {
    expect(MCP_SCHEMA_VERSION).toBe("seller_net.mcp.v2");
    expect(CALCULATOR_VERSION).toBe("SELLER_NET_WATERFALL v1.3.0");
    expect(MCP_SCHEMA_VERSION).not.toBe(CALCULATOR_VERSION);
  });

  it("pins the protocol, server name, and server version", () => {
    expect(MCP_PROTOCOL_VERSION).toBe("2024-11-05");
    expect(MCP_SERVER_NAME).toBe("seller-net-mcp");
    expect(MCP_SERVER_VERSION).toBe("1.1.0");
  });
});

describe("stable error codes", () => {
  it("exposes exactly the documented codes, in order", () => {
    expect(MCP_ERROR_CODES).toEqual([
      "MALFORMED_REQUEST",
      "INVALID_PARAMS",
      "OUT_OF_RANGE",
      "TOO_MANY_SCENARIOS",
      "PAGINATION_OUT_OF_BOUNDS",
      "UNKNOWN_TOOL",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "DUPLICATE_RUN",
      "VALIDATION_FAILED",
      "CALCULATION_FAILED",
      "INTERNAL_ERROR",
    ]);
  });

  it("maps every code to a JSON-RPC numeric code", () => {
    for (const code of MCP_ERROR_CODES) {
      expect(typeof MCP_JSONRPC_CODES[code]).toBe("number");
    }
    expect(MCP_JSONRPC_CODES.MALFORMED_REQUEST).toBe(-32700);
    expect(MCP_JSONRPC_CODES.UNKNOWN_TOOL).toBe(-32601);
    expect(MCP_JSONRPC_CODES.INTERNAL_ERROR).toBe(-32603);
  });

  it("builds a structured error carrying the code and its JSON-RPC number", () => {
    const error = mcpError("NOT_FOUND", "no such run", { runId: "run-1" });
    expect(error).toEqual({
      code: "NOT_FOUND",
      jsonRpcCode: MCP_JSONRPC_CODES.NOT_FOUND,
      message: "no such run",
      details: { runId: "run-1" },
    });
  });
});

describe("safe limits", () => {
  it("pins every bound the service enforces on untrusted input", () => {
    expect(MCP_LIMITS).toEqual({
      maxScenarios: 10,
      defaultPageSize: 20,
      maxPageSize: 100,
      maxOffset: 10_000,
      maxMoney: 1_000_000_000,
      maxBps: 10_000,
      maxFraction: 1,
      maxMonths: 1_200,
      maxDays: 365,
      maxTextLength: 256,
      maxJsonBytes: 1_000_000,
    });
  });
});

describe("tool and resource names", () => {
  it("exposes exactly the ten provider-neutral tool names", () => {
    expect(MCP_TOOL_NAMES).toEqual([
      "seller_net.capabilities",
      "seller_net.get_config",
      "seller_net.validate",
      "seller_net.calculate",
      "seller_net.compare_scenarios",
      "seller_net.create_run",
      "seller_net.get_run",
      "seller_net.list_runs",
      "seller_net.explain_result",
      "seller_net.health",
    ]);
  });

  it("exposes exactly the four read-only resource URIs", () => {
    expect(MCP_RESOURCE_URIS).toEqual({
      schema: "seller_net://schema",
      config: "seller_net://config",
      calculator: "seller_net://calculator",
      provenance: "seller_net://provenance",
    });
  });
});

describe("auth scopes and context resolution", () => {
  it("names the read and runs scopes", () => {
    expect(SCOPE_READ).toBe("seller_net:read");
    expect(SCOPE_RUNS).toBe("seller_net:runs");
  });

  it("grants the anonymous context no scopes", () => {
    expect(anonymousAuthContext.principal).toEqual({
      id: "anonymous",
      anonymous: true,
      scopes: [],
    });
    expect(hasScope(anonymousAuthContext, SCOPE_READ)).toBe(false);
    expect(hasScope(anonymousAuthContext, SCOPE_RUNS)).toBe(false);
  });

  it("reports a scope only when the principal actually holds it", () => {
    const principal: McpPrincipal = {
      id: "principal-1",
      anonymous: false,
      scopes: [SCOPE_READ],
    };
    const ctx = { principal };
    expect(hasScope(ctx, SCOPE_READ)).toBe(true);
    expect(hasScope(ctx, SCOPE_RUNS)).toBe(false);
  });

  it("falls back to the anonymous context when no token is presented", async () => {
    const verifier: McpTokenVerifier = { verify: vi.fn() };
    await expect(resolveAuthContext(undefined, verifier)).resolves.toBe(
      anonymousAuthContext,
    );
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("preserves rejected credentials as a distinct scope-free context", async () => {
    const verifier: McpTokenVerifier = {
      verify: vi.fn(async () => null),
    };
    await expect(resolveAuthContext("bad-token", verifier)).resolves.toBe(
      invalidCredentialsContext,
    );
    expect(verifier.verify).toHaveBeenCalledWith("bad-token");
  });

  it("resolves a verified token to its principal and carries the token", async () => {
    const principal: McpPrincipal = {
      id: "principal-1",
      anonymous: false,
      scopes: [SCOPE_READ, SCOPE_RUNS],
    };
    const verifier: McpTokenVerifier = {
      verify: vi.fn(async () => principal),
    };
    const ctx = await resolveAuthContext("good-token", verifier);
    expect(ctx.principal).toEqual(principal);
    expect(ctx.bearerToken).toBe("good-token");
    expect(hasScope(ctx, SCOPE_RUNS)).toBe(true);
  });
});

describe("error code type surface", () => {
  it("accepts every declared code as an McpErrorCode", () => {
    const codes: McpErrorCode[] = [...MCP_ERROR_CODES];
    expect(codes).toHaveLength(MCP_ERROR_CODES.length);
  });
});
