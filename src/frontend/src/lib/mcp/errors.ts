/**
 * MCP integration layer — stable structured error codes.
 *
 * Every failure mode the service can produce has exactly one stable code. Codes
 * are part of the public contract: clients branch on `code`, never on message
 * text. The numeric `jsonRpcCode` maps onto JSON-RPC 2.0 error codes so a true
 * MCP transport can forward them unchanged.
 */

/** Stable, machine-readable error codes. Never rename or renumber. */
export const MCP_ERROR_CODES = [
  /** Request body is not valid JSON or not a JSON-RPC object. */
  "MALFORMED_REQUEST",
  /** A required parameter is missing or has the wrong type. */
  "INVALID_PARAMS",
  /** A numeric parameter is outside its permitted range. */
  "OUT_OF_RANGE",
  /** Requested scenario count exceeds MCP_LIMITS.maxScenarios. */
  "TOO_MANY_SCENARIOS",
  /** Pagination limit/offset exceeds MCP_LIMITS bounds. */
  "PAGINATION_OUT_OF_BOUNDS",
  /** The requested tool name is not one of the ten seller_net.* tools. */
  "UNKNOWN_TOOL",
  /** The caller presented no credentials where credentials are required. */
  "UNAUTHORIZED",
  /** The caller presented credentials that are invalid or expired. */
  "FORBIDDEN",
  /** A referenced run record does not exist for the caller. */
  "NOT_FOUND",
  /** A run record with the same runId already exists for the caller. */
  "DUPLICATE_RUN",
  /** The canonical calculator rejected the input (validation issues). */
  "VALIDATION_FAILED",
  /** The canonical calculator could not produce a finite result. */
  "CALCULATION_FAILED",
  /** An unexpected internal failure. Never leaks internals. */
  "INTERNAL_ERROR",
] as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];

/** JSON-RPC 2.0 numeric code carried alongside every structured error. */
export const MCP_JSONRPC_CODES: Record<McpErrorCode, number> = {
  MALFORMED_REQUEST: -32700,
  INVALID_PARAMS: -32602,
  OUT_OF_RANGE: -32602,
  TOO_MANY_SCENARIOS: -32602,
  PAGINATION_OUT_OF_BOUNDS: -32602,
  UNKNOWN_TOOL: -32601,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32002,
  NOT_FOUND: -32004,
  DUPLICATE_RUN: -32009,
  VALIDATION_FAILED: -32022,
  CALCULATION_FAILED: -32023,
  INTERNAL_ERROR: -32603,
};

/** A structured, JSON-serializable error. */
export interface McpError {
  /** Stable machine-readable code. */
  code: McpErrorCode;
  /** JSON-RPC 2.0 numeric code for transport forwarding. */
  jsonRpcCode: number;
  /** Human-readable, non-authoritative message. */
  message: string;
  /** Optional field-level detail (e.g. calculator validation issues). */
  details?: unknown;
}

/** Build a structured error from a code and message. */
export function mcpError(
  code: McpErrorCode,
  message: string,
  details?: unknown,
): McpError {
  return { code, jsonRpcCode: MCP_JSONRPC_CODES[code], message, details };
}
