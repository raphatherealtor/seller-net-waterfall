/**
 * MCP integration layer — JSON-RPC 2.0 transport adapter.
 *
 * This is the ONLY module that knows about wire framing and credentials. It:
 *
 *   1. extracts a bearer token from an `Authorization` header,
 *   2. resolves the auth context via `resolveAuthContext`,
 *   3. dispatches through the `McpService` interface,
 *   4. serializes the result as a JSON-RPC 2.0 response.
 *
 * It calls only the `McpService` interface — never the calculator, never the
 * backend, never a vendor SDK. A different transport (stdio, in-process, a real
 * HTTP server) can be attached by reusing `handleJsonRpcRequest` unchanged; only
 * the request/response plumbing around it differs. No secret is ever read from
 * source: the verifier is injected by the host.
 */

import { anonymousAuthContext, hasScope, resolveAuthContext } from "./auth";
import type { McpAuthContext, McpTokenVerifier } from "./auth";
import { mcpError } from "./errors";
import type { McpError } from "./errors";
import {
  JSONRPC_INTERNAL_ERROR,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_METHOD_NOT_FOUND,
  isJsonRpcNotification,
  jsonRpcError,
  jsonRpcSuccess,
  parseJsonRpcRequest,
} from "./jsonrpc";
import type {
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./jsonrpc";
import { MCP_TOOL_NAMES } from "./schemas";
import type { McpToolName } from "./schemas";
import type { McpService } from "./service";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SCHEMA_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./version";

/** The MCP methods this transport understands. */
export const MCP_TRANSPORT_METHODS = [
  "initialize",
  "ping",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read",
  "notifications/initialized",
] as const;

export type McpTransportMethod = (typeof MCP_TRANSPORT_METHODS)[number];

/** A minimal, transport-agnostic HTTP request shape. */
export interface McpHttpRequest {
  /** HTTP method; only POST is accepted. */
  method: string;
  /** Request headers, case-insensitive lookup applied by the adapter. */
  headers: Record<string, string | undefined>;
  /** Raw request body. */
  body: string;
}

/** A minimal, transport-agnostic HTTP response shape. */
export interface McpHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Options for constructing the transport. */
export interface McpTransportOptions {
  /** The provider-neutral service the transport dispatches to. */
  service: McpService;
  /** Resolves a bearer token to a principal. Injected by the host. */
  verifier: McpTokenVerifier;
}

/** The transport surface a host attaches to a real HTTP endpoint. */
export interface McpTransport {
  /** Handle one HTTP request and produce one HTTP response. */
  handle(request: McpHttpRequest): Promise<McpHttpResponse>;
  /** Handle one already-parsed JSON-RPC request. */
  handleJsonRpcRequest(
    request: JsonRpcRequest,
    ctx: McpAuthContext,
  ): Promise<JsonRpcResponse | null>;
}

/** Case-insensitive header lookup. */
function readHeader(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return undefined;
}

/**
 * Extract a bearer token from an `Authorization: Bearer <token>` header.
 * Returns `undefined` when the header is absent or not a bearer scheme.
 */
export function extractBearerToken(
  headers: Record<string, string | undefined>,
): string | undefined {
  const raw = readHeader(headers, "authorization");
  if (!raw) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : undefined;
}

/** Convert a structured `McpError` into a JSON-RPC error response. */
function errorToResponse(id: JsonRpcId, error: McpError): JsonRpcErrorResponse {
  return jsonRpcError(id, error.jsonRpcCode, error.message, {
    code: error.code,
    details: error.details,
  });
}

/** The MCP `initialize` result payload. */
function initializeResult() {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
    },
    serverInfo: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    schemaVersion: MCP_SCHEMA_VERSION,
  };
}

/** The MCP `tools/list` result payload, derived from the service descriptors. */
function toolsListResult(service: McpService) {
  return {
    tools: service.toolDescriptors().map((descriptor) => ({
      name: descriptor.name,
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
      outputSchema: descriptor.outputSchema,
      requiredScope: descriptor.requiredScope,
    })),
  };
}

/** The MCP `resources/list` result payload, derived from capabilities. */
async function resourcesListResult(
  service: McpService,
  ctx: McpAuthContext,
): Promise<{ resources: unknown[] }> {
  let capabilities: Awaited<ReturnType<McpService["capabilities"]>>;
  try {
    capabilities = await service.capabilities(ctx);
  } catch {
    return { resources: [] };
  }
  if (!capabilities.ok || !capabilities.result) {
    return { resources: [] };
  }
  return { resources: capabilities.result.resources };
}

/** Narrow an unknown params value to a record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** True when `name` is one of the ten canonical tool names. */
function isToolName(name: unknown): name is McpToolName {
  return (
    typeof name === "string" &&
    (MCP_TOOL_NAMES as readonly string[]).includes(name)
  );
}

/**
 * Dispatch through the service, converting a thrown error into a structured
 * failure envelope. The real `McpService` never throws (every path returns an
 * envelope), but a misbehaving adapter must not be able to propagate an
 * exception out of the transport.
 */
async function dispatchSafely(
  service: McpService,
  ctx: McpAuthContext,
  toolName: McpToolName,
  params: unknown,
): Promise<Awaited<ReturnType<McpService["dispatch"]>>> {
  try {
    return await service.dispatch(ctx, toolName, params);
  } catch {
    return {
      ok: false,
      error: mcpError("INTERNAL_ERROR", "The service failed to dispatch."),
      audit: {
        requestId: "transport",
        toolName,
        calculatorVersion: "unknown",
        schemaVersion: MCP_SCHEMA_VERSION,
        outcome: "failure",
        durationMs: 0,
        completedAt: new Date(0).toISOString(),
      },
    };
  }
}

/** Read a resource, treating a thrown error as an absent resource. */
async function readResourceSafely(
  service: McpService,
  ctx: McpAuthContext,
  uri: string,
): Promise<Awaited<ReturnType<McpService["readResource"]>>> {
  try {
    return await service.readResource(ctx, uri);
  } catch {
    return null;
  }
}

/**
 * Build the transport. The returned object is transport-agnostic: `handle`
 * adapts a minimal HTTP request, and `handleJsonRpcRequest` is the pure
 * JSON-RPC entry point a different transport can call directly.
 */
export function createMcpTransport(options: McpTransportOptions): McpTransport {
  const { service, verifier } = options;

  async function handleJsonRpcRequest(
    request: JsonRpcRequest,
    ctx: McpAuthContext,
  ): Promise<JsonRpcResponse | null> {
    // JSON-RPC notifications never receive a JSON-RPC response. In this
    // stateless legacy adapter we acknowledge them only at the HTTP layer.
    // No current notification carries a seller-net mutation, so notification
    // methods are intentionally side-effect free here.
    if (isJsonRpcNotification(request)) {
      return null;
    }

    const id: JsonRpcId = request.id ?? null;
    const params = asRecord(request.params);

    switch (request.method) {
      case "initialize":
        return jsonRpcSuccess(id, initializeResult());

      case "ping":
        return jsonRpcSuccess(id, {});

      case "tools/list":
        return jsonRpcSuccess(id, toolsListResult(service));

      case "tools/call": {
        if (!params || !isToolName(params.name)) {
          return errorToResponse(
            id,
            mcpError(
              "UNKNOWN_TOOL",
              "tools/call requires a known seller_net.* tool name",
            ),
          );
        }
        const envelope = await dispatchSafely(
          service,
          ctx,
          params.name,
          params.arguments ?? {},
        );
        if (!envelope.ok) {
          return errorToResponse(
            id,
            envelope.error ??
              mcpError("INTERNAL_ERROR", "Tool call failed without an error"),
          );
        }
        return jsonRpcSuccess(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(envelope.result ?? null),
            },
          ],
          structuredContent: envelope.result ?? null,
          isError: false,
        });
      }

      case "resources/list":
        return jsonRpcSuccess(id, await resourcesListResult(service, ctx));

      case "resources/read": {
        const uri = params?.uri;
        if (typeof uri !== "string" || uri.length === 0) {
          return jsonRpcError(
            id,
            JSONRPC_INVALID_PARAMS,
            "resources/read requires a string `uri`",
          );
        }
        const content = await readResourceSafely(service, ctx, uri);
        if (!content) {
          return errorToResponse(
            id,
            mcpError("NOT_FOUND", `Unknown resource: ${uri}`),
          );
        }
        return jsonRpcSuccess(id, {
          contents: [
            {
              uri: content.uri,
              mimeType: content.mimeType,
              text: content.text,
            },
          ],
        });
      }

      default:
        return jsonRpcError(
          id,
          JSONRPC_METHOD_NOT_FOUND,
          `Method not found: ${request.method}`,
        );
    }
  }

  async function handle(request: McpHttpRequest): Promise<McpHttpResponse> {
    const jsonHeaders = { "content-type": "application/json" };

    if (request.method.toUpperCase() !== "POST") {
      return {
        status: 405,
        headers: { ...jsonHeaders, allow: "POST" },
        body: JSON.stringify(
          jsonRpcError(null, JSONRPC_METHOD_NOT_FOUND, "Method not allowed"),
        ),
      };
    }

    const parsed = parseJsonRpcRequest(request.body);
    if (!parsed.ok) {
      return {
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(parsed.response),
      };
    }

    const token = extractBearerToken(request.headers);
    const ctx = await resolveAuthContext(token, verifier);

    let response: JsonRpcResponse | null;
    try {
      response = await handleJsonRpcRequest(parsed.request, ctx);
    } catch {
      response = jsonRpcError(
        parsed.request.id ?? null,
        JSONRPC_INTERNAL_ERROR,
        "Internal error",
      );
    }

    if (response === null) {
      return {
        status: 202,
        headers: {},
        body: "",
      };
    }

    return {
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify(response),
    };
  }

  return { handle, handleJsonRpcRequest };
}

/** Re-exported for hosts that need the anonymous context without a token. */
export { anonymousAuthContext, hasScope };
