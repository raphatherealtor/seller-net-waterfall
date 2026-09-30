/**
 * MCP integration layer — tool input/output schemas.
 *
 * These are the provider-neutral contracts. They reuse the canonical calculator
 * types (`SellerNetInput`, `SellerNetOutput`, `SellerNetResult`,
 * `ValidationResult`, `ScenarioComparison`) rather than redefining them. No
 * financial formula appears here — only the shape of what crosses the boundary.
 */

import type {
  ProfessionalReviewDomain,
  ProvenanceState,
  SellerNetConfig,
  SellerNetInput,
  SellerNetOutput,
  SellerNetResult,
  ValidationResult,
} from "@/lib/seller-net";
import type { ScenarioComparison } from "@/lib/seller-net";
import type { McpAuditMetadata, McpToolEnvelope } from "./audit";
import type { McpError } from "./errors";

/** The ten provider-neutral tool names. */
export const MCP_TOOL_NAMES = [
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
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/**
 * The full professional review domain vocabulary this MCP layer declares in its
 * contract. It mirrors the canonical seller-net review vocabulary:
 * ESCROW and TITLE are baseline review domains, while LENDER and CPA_TAX are
 * activated contextually by HECM and tax calculations.
 *
 * This constant is discovery metadata only. Result-producing tools still echo
 * the canonical calculator's `professionalReviewDomains` verbatim.
 */
export const MCP_PROFESSIONAL_REVIEW_DOMAINS = [
  "ESCROW",
  "TITLE",
  "CPA_TAX",
  "LENDER",
] as const;

export type McpProfessionalReviewDomain =
  (typeof MCP_PROFESSIONAL_REVIEW_DOMAINS)[number];

/** A JSON-schema-shaped descriptor for one tool parameter. */
export interface McpJsonSchema {
  type:
    | "object"
    | "array"
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "null"
    | readonly ("object" | "array" | "string" | "number" | "integer" | "boolean" | "null")[];
  description?: string;
  properties?: Record<string, McpJsonSchema>;
  items?: McpJsonSchema;
  required?: readonly string[];
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  additionalProperties?: boolean;
}

/** A tool descriptor as returned by seller_net.capabilities. */
export interface McpToolDescriptor {
  name: McpToolName;
  description: string;
  /** JSON schema of the tool's params object. */
  inputSchema: McpJsonSchema;
  /** JSON schema of the tool's result payload. */
  outputSchema: McpJsonSchema;
  /** Scope required to invoke the tool, or null for public tools. */
  requiredScope: string | null;
}

/** Result of seller_net.capabilities. */
export interface CapabilitiesResult {
  serverName: string;
  serverVersion: string;
  schemaVersion: string;
  protocolVersion: string;
  calculatorVersion: string;
  /**
   * The full professional review domain vocabulary this layer declares in its
   * contract (ESCROW, TITLE, CPA_TAX, LENDER). Discoverable by any MCP client.
   */
  supportedProfessionalReviewDomains: readonly McpProfessionalReviewDomain[];
  tools: McpToolDescriptor[];
  resources: McpResourceDescriptor[];
}

/** Result of seller_net.get_config. */
export interface GetConfigResult {
  /** The canonical config object, verbatim. */
  config: SellerNetConfig;
  calculatorVersion: string;
  schemaVersion: string;
}

/** Params of seller_net.validate. */
export interface ValidateParams {
  input: SellerNetInput;
}

/** Result of seller_net.validate. */
export interface ValidateResult {
  /** The canonical validation result, verbatim. */
  validation: ValidationResult;
  calculatorVersion: string;
}

/** Params of seller_net.calculate. */
export interface CalculateParams {
  input: SellerNetInput;
}

/** Result of seller_net.calculate. */
export interface CalculateResult {
  /** The canonical calculator result, verbatim. */
  result: SellerNetResult;
  /** Provenance echo per input field, preserved from the input. */
  provenance: Record<string, ProvenanceState>;
  /** Professional review domains required for this result. */
  professionalReviewDomains: readonly ProfessionalReviewDomain[];
}

/** Params of seller_net.compare_scenarios. */
export interface CompareScenariosParams {
  input: SellerNetInput;
  /** Optional dollar spread; defaults to SCENARIO_DEFAULT_SPREAD. */
  spread?: number;
  /** Optional explicit target prices; when present, `spread` is ignored. */
  targets?: number[];
}

/** Result of seller_net.compare_scenarios. */
export interface CompareScenariosResult {
  /** The canonical scenario comparison, verbatim. */
  comparison: ScenarioComparison;
  calculatorVersion: string;
}

/** Params of seller_net.create_run. */
export interface CreateRunParams {
  /** Client-generated run id, unique per caller. */
  runId: string;
  /** Property / case identifier. */
  propertyId: string;
  /** The exact effective inputs the calculator used. */
  input: SellerNetInput;
}

/** Result of seller_net.create_run. */
export interface CreateRunResult {
  runId: string;
  inputHash: string;
  calculatorVersion: string;
  createdAt: string;
}

/** Params of seller_net.get_run. */
export interface GetRunParams {
  runId: string;
}

/** A stored run record as returned to a client. */
export interface RunRecordPayload {
  runId: string;
  calculatorVersion: string;
  propertyId: string;
  effectiveInputs: SellerNetInput;
  inputProvenance: Record<string, ProvenanceState>;
  inputHash: string;
  outputs: SellerNetOutput;
  createdAt: string;
}

/** Result of seller_net.get_run. */
export interface GetRunResult {
  record: RunRecordPayload;
  /** True when the stored run was created by a different calculator version. */
  versionMismatch: boolean;
}

/** Params of seller_net.list_runs. */
export interface ListRunsParams {
  limit?: number;
  offset?: number;
}

/** Result of seller_net.list_runs. */
export interface ListRunsResult {
  records: RunRecordPayload[];
  total: number;
  limit: number;
  offset: number;
}

/** Params of seller_net.explain_result. */
export interface ExplainResultParams {
  /** Either a full calculator result, or a runId to explain a stored run. */
  result?: SellerNetResult;
  runId?: string;
}

/** One structured explanation line; no new arithmetic is performed. */
export interface ExplanationLine {
  /** Canonical output field this line describes. */
  field: string;
  /** The value read verbatim from the calculator output. */
  value: number | null;
  /** Provenance state of the underlying input, when applicable. */
  provenance?: ProvenanceState;
  /** Static label describing the line. */
  label: string;
}

/** Result of seller_net.explain_result. */
export interface ExplainResultResult {
  /** Structured lines derived only from existing calculator outputs. */
  lines: ExplanationLine[];
  professionalReviewDomains: readonly ProfessionalReviewDomain[];
  calculatorVersion: string;
}

/** Result of seller_net.health. */
export interface HealthResult {
  status: "ok" | "degraded";
  schemaVersion: string;
  calculatorVersion: string;
  /** True when the canonical calculator module is importable and callable. */
  calculatorAvailable: boolean;
  /** True when run-record persistence is reachable. */
  persistenceAvailable: boolean;
}

/** A read-only MCP resource descriptor. */
export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/** The four read-only resource URIs. */
export const MCP_RESOURCE_URIS = {
  schema: "seller_net://schema",
  config: "seller_net://config",
  calculator: "seller_net://calculator",
  provenance: "seller_net://provenance",
} as const;

/** A read-only resource payload. */
export interface McpResourceContent {
  uri: string;
  mimeType: string;
  /** JSON-serialized content. */
  text: string;
}

/** Re-exported envelope/audit/error types for consumers. */
export type { McpAuditMetadata, McpToolEnvelope, McpError };
