/**
 * MCP integration layer — JSON-RPC 2.0 envelope types and serialization helpers.
 *
 * This module is pure framing: it knows nothing about Seller Net, the MCP
 * service, or any transport. It defines the wire shapes of JSON-RPC 2.0
 * (requests, notifications, responses, errors) and the small set of helpers a
 * transport needs to parse a request and serialize a response. Keeping framing
 * here means a different transport (HTTP, stdio, in-process) reuses the exact
 * same envelopes without touching handlers.
 *
 * Spec: https://www.jsonrpc.org/specification
 */

/** JSON-RPC 2.0 protocol version literal. */
export const JSONRPC_VERSION = "2.0" as const;

/** Standard JSON-RPC 2.0 error codes. */
export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

/** A JSON-RPC request id: string, number, or null. */
export type JsonRpcId = string | number | null;

/** A JSON-RPC 2.0 request object. */
export interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  /** Method name, e.g. "tools/call". */
  method: string;
  /** Method params; object or array per the spec. */
  params?: unknown;
  /** Correlation id; absent on notifications. */
  id?: JsonRpcId;
}

/** A JSON-RPC 2.0 notification: a request with no id. */
export interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: unknown;
  id?: undefined;
}

/** A JSON-RPC 2.0 error object. */
export interface JsonRpcErrorObject {
  /** Numeric error code. */
  code: number;
  /** Short, non-authoritative message. */
  message: string;
  /** Optional structured detail. */
  data?: unknown;
}

/** A JSON-RPC 2.0 success response. */
export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  result: T;
  id: JsonRpcId;
}

/** A JSON-RPC 2.0 error response. */
export interface JsonRpcErrorResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  error: JsonRpcErrorObject;
  id: JsonRpcId;
}

/** Any JSON-RPC 2.0 response. */
export type JsonRpcResponse<T = unknown> =
  | JsonRpcSuccessResponse<T>
  | JsonRpcErrorResponse;

/** True when a parsed value is a JSON-RPC 2.0 request object. */
export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.jsonrpc === JSONRPC_VERSION &&
    typeof candidate.method === "string" &&
    candidate.method.length > 0
  );
}

/** True when a request is a notification (no id). */
export function isJsonRpcNotification(
  request: JsonRpcRequest,
): request is JsonRpcNotification {
  return request.id === undefined;
}

/** Build a JSON-RPC success response. */
export function jsonRpcSuccess<T>(
  id: JsonRpcId,
  result: T,
): JsonRpcSuccessResponse<T> {
  return { jsonrpc: JSONRPC_VERSION, result, id };
}

/** Build a JSON-RPC error response. */
export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    error: data === undefined ? { code, message } : { code, message, data },
    id,
  };
}

/**
 * Parse a raw JSON-RPC request body. Returns the request on success, or a
 * structured error response (with a null id, per the spec) when the body is not
 * valid JSON or not a JSON-RPC 2.0 request object.
 */
export function parseJsonRpcRequest(
  body: string,
):
  | { ok: true; request: JsonRpcRequest }
  | { ok: false; response: JsonRpcErrorResponse } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      ok: false,
      response: jsonRpcError(null, JSONRPC_PARSE_ERROR, "Parse error"),
    };
  }
  if (!isJsonRpcRequest(parsed)) {
    return {
      ok: false,
      response: jsonRpcError(null, JSONRPC_INVALID_REQUEST, "Invalid Request"),
    };
  }
  return { ok: true, request: parsed };
}

/** Serialize any JSON-RPC envelope to a wire string. */
export function serializeJsonRpc(
  envelope: JsonRpcResponse | JsonRpcErrorResponse,
): string {
  return JSON.stringify(envelope);
}
