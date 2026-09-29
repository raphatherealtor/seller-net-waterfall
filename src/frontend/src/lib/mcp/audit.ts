/**
 * MCP integration layer — audit metadata.
 *
 * Every tool invocation produces exactly one audit record. Audit metadata is
 * attached to the tool result envelope, never mixed into the tool's own output
 * payload, so clients can ignore it without parsing financial data.
 */

/** Outcome of a single tool invocation. */
export type McpAuditOutcome = "success" | "failure";

/** Audit metadata attached to every tool call. */
export interface McpAuditMetadata {
  /** Caller-supplied or server-generated correlation id for this request. */
  requestId: string;
  /** The invoked tool name, e.g. "seller_net.calculate". */
  toolName: string;
  /** Canonical calculator version in effect for this call. */
  calculatorVersion: string;
  /** MCP schema version in effect for this call. */
  schemaVersion: string;
  /** Whether the call succeeded. */
  outcome: McpAuditOutcome;
  /** Wall-clock duration of the call in milliseconds. */
  durationMs: number;
  /** ISO-8601 timestamp of when the call completed. */
  completedAt: string;
}

/** The uniform envelope every tool returns. */
export interface McpToolEnvelope<T> {
  /** True when the tool produced a result; false when `error` is set. */
  ok: boolean;
  /** Tool output payload; present only when `ok` is true. */
  result?: T;
  /** Structured error; present only when `ok` is false. */
  error?: import("./errors").McpError;
  /** Audit metadata for this invocation. */
  audit: McpAuditMetadata;
}
