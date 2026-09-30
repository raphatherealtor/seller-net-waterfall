/**
 * MCP integration layer — public module surface.
 *
 * Import everything from `@/lib/mcp`. Transports (JSON-RPC, HTTP, in-process)
 * import only from here and never reach into individual files.
 */

export {
  MCP_PROTOCOL_VERSION,
  MCP_SCHEMA_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./version";

export { MCP_ERROR_CODES, MCP_JSONRPC_CODES, mcpError } from "./errors";
export type { McpError, McpErrorCode } from "./errors";

export { MCP_LIMITS } from "./limits";
export type { McpLimits } from "./limits";

export type {
  McpAuditMetadata,
  McpAuditOutcome,
  McpToolEnvelope,
} from "./audit";

export {
  SCOPE_READ,
  SCOPE_RUNS,
  anonymousAuthContext,
  invalidCredentialsContext,
  hasScope,
  resolveAuthContext,
} from "./auth";
export type {
  McpAuthContext,
  McpPrincipal,
  McpTokenVerifier,
} from "./auth";

export {
  MCP_PROFESSIONAL_REVIEW_DOMAINS,
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
} from "./schemas";
export type {
  CalculateParams,
  CalculateResult,
  CapabilitiesResult,
  CompareScenariosParams,
  CompareScenariosResult,
  CreateRunParams,
  CreateRunResult,
  ExplainResultParams,
  ExplainResultResult,
  ExplanationLine,
  GetConfigResult,
  GetRunParams,
  GetRunResult,
  HealthResult,
  ListRunsParams,
  ListRunsResult,
  McpJsonSchema,
  McpProfessionalReviewDomain,
  McpResourceContent,
  McpResourceDescriptor,
  McpToolDescriptor,
  McpToolName,
  RunRecordPayload,
  ValidateParams,
  ValidateResult,
} from "./schemas";

export {
  MCP_RESOURCE_DESCRIPTORS,
  MCP_TOOL_DESCRIPTORS,
  createMcpService,
} from "./service";
export type {
  McpService,
  McpServiceOptions,
  RunRecordStore,
} from "./service";
