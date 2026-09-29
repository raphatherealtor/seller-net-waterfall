/**
 * MCP integration layer — transport-independent service interface + implementation.
 *
 * This is the boundary a JSON-RPC MCP endpoint (or any future transport) calls.
 * The service performs NO financial math: every calculation delegates to the
 * canonical `@/lib/seller-net` calculator, and every run record delegates to the
 * persistence port below. Transport concerns (HTTP, JSON-RPC framing, bearer
 * extraction) live outside this interface.
 */

import {
  CALCULATOR_VERSION,
  CONDITION_TIERS,
  MORTGAGE_PAYOFF_MODES,
  PROFESSIONAL_REVIEW_DOMAINS,
  PROVENANCE_STATES,
  SCENARIO_DEFAULT_SPREAD,
  SECTION_121_STATUSES,
  SELLER_NET_CONFIG,
  calculateSellerNetWaterfall,
  computeScenarios,
  computeScenariosAtTargets,
  validateInput,
} from "@/lib/seller-net";
import type {
  ProfessionalReviewDomain,
  ProvenanceState,
  SellerNetInput,
  SellerNetResult,
} from "@/lib/seller-net";
import type { McpAuditMetadata, McpToolEnvelope } from "./audit";
import { SCOPE_READ, SCOPE_RUNS, hasScope } from "./auth";
import type { McpAuthContext } from "./auth";
import { mcpError } from "./errors";
import type { McpError, McpErrorCode } from "./errors";
import { MCP_LIMITS } from "./limits";
import {
  MCP_PROFESSIONAL_REVIEW_DOMAINS,
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
} from "./schemas";
import type {
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
  McpResourceContent,
  McpResourceDescriptor,
  McpToolDescriptor,
  McpToolName,
  RunRecordPayload,
  ValidateParams,
  ValidateResult,
} from "./schemas";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SCHEMA_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./version";

/**
 * Persistence port for run records. The production adapter delegates to the
 * existing backend canister methods (`saveRunRecord`, `getRunRecord`,
 * `listRunRecords`); tests supply an in-memory adapter. The port stores opaque
 * snapshots and never recomputes financial values.
 */
export interface RunRecordStore {
  /** Persist a snapshot. Rejects with DUPLICATE_RUN when runId exists. */
  save(
    owner: string,
    record: RunRecordPayload,
  ): Promise<
    { ok: true } | { ok: false; code: "DUPLICATE_RUN" | "INTERNAL_ERROR" }
  >;
  /** Fetch one snapshot owned by `owner`, or null when absent. */
  get(owner: string, runId: string): Promise<RunRecordPayload | null>;
  /** List snapshots owned by `owner`, newest first. */
  list(owner: string): Promise<RunRecordPayload[]>;
}

/** Options for constructing the service. */
export interface McpServiceOptions {
  /** Run-record persistence adapter. */
  store: RunRecordStore;
  /** Clock, injectable for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Id generator for requestId, injectable for tests. */
  newRequestId?: () => string;
}

/**
 * The provider-neutral MCP service. Every method returns a uniform envelope
 * carrying either a result or a structured error, plus audit metadata.
 */
export interface McpService {
  /** List tools and resources. Public. */
  capabilities(
    ctx: McpAuthContext,
    requestId?: string,
  ): Promise<McpToolEnvelope<CapabilitiesResult>>;

  /** Return the canonical config verbatim. Public. */
  getConfig(
    ctx: McpAuthContext,
    requestId?: string,
  ): Promise<McpToolEnvelope<GetConfigResult>>;

  /** Validate an input via the canonical validator. Public. */
  validate(
    ctx: McpAuthContext,
    params: ValidateParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<ValidateResult>>;

  /** Run the canonical calculator once. Public. */
  calculate(
    ctx: McpAuthContext,
    params: CalculateParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<CalculateResult>>;

  /** Run the canonical calculator once per scenario. Public. */
  compareScenarios(
    ctx: McpAuthContext,
    params: CompareScenariosParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<CompareScenariosResult>>;

  /** Persist a run record. Requires SCOPE_RUNS. */
  createRun(
    ctx: McpAuthContext,
    params: CreateRunParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<CreateRunResult>>;

  /** Fetch a run record. Requires SCOPE_RUNS. */
  getRun(
    ctx: McpAuthContext,
    params: GetRunParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<GetRunResult>>;

  /** List run records. Requires SCOPE_RUNS. */
  listRuns(
    ctx: McpAuthContext,
    params: ListRunsParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<ListRunsResult>>;

  /** Structure existing calculator outputs. Performs no new math. Public. */
  explainResult(
    ctx: McpAuthContext,
    params: ExplainResultParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<ExplainResultResult>>;

  /** Liveness and dependency probe. Public. */
  health(
    ctx: McpAuthContext,
    requestId?: string,
  ): Promise<McpToolEnvelope<HealthResult>>;

  /** Read one of the four read-only resources. Public. */
  readResource(
    ctx: McpAuthContext,
    uri: string,
  ): Promise<McpResourceContent | null>;

  /** The tool descriptors, for transports that build their own discovery. */
  toolDescriptors(): McpToolDescriptor[];

  /** Dispatch a tool by name — the single entry point a transport calls. */
  dispatch(
    ctx: McpAuthContext,
    toolName: McpToolName,
    params: unknown,
    requestId?: string,
  ): Promise<McpToolEnvelope<unknown>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static descriptors
// ─────────────────────────────────────────────────────────────────────────────

const PROVENANCED_NUMBER_SCHEMA: McpJsonSchema = {
  type: "object",
  properties: {
    value: {
      type: ["number", "null"],
      description: "Numeric value, or null when provenance is UNKNOWN.",
    },
    provenance: {
      type: "string",
      enum: PROVENANCE_STATES,
    },
  },
  required: ["value", "provenance"],
  additionalProperties: false,
};

const PROVENANCED_FIELDS = [
  "basePrice",
  "manualAdjustedPrice",
  "listingCommissionRateBps",
  "buyerCommissionRateBps",
  "escrowRateBps",
  "titleRateBps",
  "transferTaxRateBps",
  "recordingFees",
  "homeWarranty",
  "annualPropertyTax",
  "taxDaysElapsed",
  "mortgageBalance",
  "mortgageRateBps",
  "mortgageMonthsRemaining",
  "hoaPayoff",
  "liensJudgments",
  "stagingPhotoCost",
  "sellerConcessionsToBuyer",
  "repairsCost",
  "renovationCost",
  "hecmInitialBalance",
  "hecmCurrentRateBps",
  "hecmLifetimeCapBps",
  "hecmMonthsElapsed",
  "originalPurchasePrice",
  "capitalImprovements",
  "estimatedCapitalGainsTaxRateBps",
  "monthlyCarryingCost",
  "pctExpectedDom",
  "pctExpectedDiscountPct",
] as const;

const INPUT_SCHEMA: McpJsonSchema = {
  type: "object",
  description:
    "Canonical SellerNetInput. UNKNOWN is represented by { value: null, provenance: 'UNKNOWN' }; explicit zero remains numeric 0.",
  properties: {
    ...Object.fromEntries(
      PROVENANCED_FIELDS.map((field) => [field, PROVENANCED_NUMBER_SCHEMA]),
    ),
    conditionTier: { type: "string", enum: CONDITION_TIERS },
    mortgagePayoffMode: { type: "string", enum: MORTGAGE_PAYOFF_MODES },
    isHecm: { type: "boolean" },
    section121Status: { type: "string", enum: SECTION_121_STATUSES },
  },
  required: [
    ...PROVENANCED_FIELDS,
    "conditionTier",
    "mortgagePayoffMode",
    "isHecm",
    "section121Status",
  ],
  additionalProperties: false,
};

const RESULT_SCHEMA: McpJsonSchema = {
  type: "object",
  description: "Canonical calculator result (output + inputHash + version).",
  additionalProperties: true,
};

const TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = [
  {
    name: "seller_net.capabilities",
    description:
      "List the available seller_net tools, schema version, calculator version, and supported enums.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        supportedProfessionalReviewDomains: {
          type: "array",
          items: {
            type: "string",
            enum: MCP_PROFESSIONAL_REVIEW_DOMAINS,
          },
          description:
            "The full professional review domain vocabulary declared by this MCP contract.",
        },
      },
      additionalProperties: true,
    },
    requiredScope: null,
  },
  {
    name: "seller_net.get_config",
    description: "Return the canonical SELLER_NET_CONFIG defaults verbatim.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    requiredScope: null,
  },
  {
    name: "seller_net.validate",
    description:
      "Validate a SellerNetInput with the canonical validator; returns valid, issues, missingFields.",
    inputSchema: {
      type: "object",
      properties: { input: INPUT_SCHEMA },
      required: ["input"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    requiredScope: null,
  },
  {
    name: "seller_net.calculate",
    description:
      "Run the canonical waterfall once; returns the result, input hash, and calculator version.",
    inputSchema: {
      type: "object",
      properties: { input: INPUT_SCHEMA },
      required: ["input"],
      additionalProperties: false,
    },
    outputSchema: RESULT_SCHEMA,
    requiredScope: null,
  },
  {
    name: "seller_net.compare_scenarios",
    description:
      "Run the canonical calculator once per price scenario (downside/current/upside).",
    inputSchema: {
      type: "object",
      properties: {
        input: INPUT_SCHEMA,
        spread: { type: "number", minimum: 0 },
        targets: { type: "array", items: { type: "number" } },
      },
      required: ["input"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    requiredScope: null,
  },
  {
    name: "seller_net.create_run",
    description:
      "Persist a run record storing the exact effective inputs the calculator used.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        propertyId: { type: "string" },
        input: INPUT_SCHEMA,
      },
      required: ["runId", "propertyId", "input"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    requiredScope: SCOPE_RUNS,
  },
  {
    name: "seller_net.get_run",
    description: "Fetch a stored run record by id.",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    requiredScope: SCOPE_RUNS,
  },
  {
    name: "seller_net.list_runs",
    description:
      "List the caller's run records, newest first, with pagination.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: MCP_LIMITS.maxPageSize },
        offset: { type: "integer", minimum: 0, maximum: MCP_LIMITS.maxOffset },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    requiredScope: SCOPE_RUNS,
  },
  {
    name: "seller_net.explain_result",
    description:
      "Structure an existing calculator result into labeled lines. Performs no new math. Supplying runId requires seller_net:runs scope.",
    inputSchema: {
      type: "object",
      properties: { result: RESULT_SCHEMA, runId: { type: "string" } },
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    requiredScope: null,
  },
  {
    name: "seller_net.health",
    description:
      "Report service status, schema version, and calculator version.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    requiredScope: null,
  },
];

const RESOURCE_DESCRIPTORS: readonly McpResourceDescriptor[] = [
  {
    uri: MCP_RESOURCE_URIS.schema,
    name: "Tool schema",
    description: "The ten seller_net tool descriptors and their JSON schemas.",
    mimeType: "application/json",
  },
  {
    uri: MCP_RESOURCE_URIS.config,
    name: "Canonical config",
    description: "The SELLER_NET_CONFIG defaults object, verbatim.",
    mimeType: "application/json",
  },
  {
    uri: MCP_RESOURCE_URIS.calculator,
    name: "Calculator metadata",
    description: "Calculator version and the canonical config it reads.",
    mimeType: "application/json",
  },
  {
    uri: MCP_RESOURCE_URIS.provenance,
    name: "Provenance states",
    description: "The five provenance states and their labels.",
    mimeType: "application/json",
  },
];

/** The scope required to invoke each tool; null means public. */
const TOOL_SCOPES: Record<McpToolName, string | null> = {
  "seller_net.capabilities": null,
  "seller_net.get_config": null,
  "seller_net.validate": null,
  "seller_net.calculate": null,
  "seller_net.compare_scenarios": null,
  "seller_net.create_run": SCOPE_RUNS,
  "seller_net.get_run": SCOPE_RUNS,
  "seller_net.list_runs": SCOPE_RUNS,
  "seller_net.explain_result": null,
  "seller_net.health": null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolName(value: string): value is McpToolName {
  return (MCP_TOOL_NAMES as readonly string[]).includes(value);
}

/** True when the value is a finite number within [min, max]. */
function inRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

/** True when the value is a non-empty string within the text limit. */
function isBoundedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MCP_LIMITS.maxTextLength
  );
}

/** True when the value is a plain object whose serialized size is within limits. */
function isBoundedJson(value: unknown): boolean {
  if (!isRecord(value)) return false;
  try {
    return JSON.stringify(value).length <= MCP_LIMITS.maxJsonBytes;
  } catch {
    return false;
  }
}

/**
 * Structural check that a value looks like a SellerNetInput. This is a shape
 * guard only — it never validates financial semantics; the canonical validator
 * owns that.
 */
function isProvenancedNumber(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.some((key) => key !== "value" && key !== "provenance") ||
    !("value" in value) ||
    !("provenance" in value)
  ) {
    return false;
  }
  const rawValue = value.value;
  if (
    rawValue !== null &&
    (typeof rawValue !== "number" || !Number.isFinite(rawValue))
  ) {
    return false;
  }
  return (
    typeof value.provenance === "string" &&
    (PROVENANCE_STATES as readonly string[]).includes(value.provenance)
  );
}

function isSellerNetInput(value: unknown): value is SellerNetInput {
  if (!isRecord(value)) return false;

  const allowed = new Set<string>([
    ...PROVENANCED_FIELDS,
    "conditionTier",
    "mortgagePayoffMode",
    "isHecm",
    "section121Status",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;

  for (const key of PROVENANCED_FIELDS) {
    if (!(key in value) || !isProvenancedNumber(value[key])) return false;
  }

  if (
    typeof value.conditionTier !== "string" ||
    !(CONDITION_TIERS as readonly string[]).includes(value.conditionTier)
  ) {
    return false;
  }
  if (
    typeof value.mortgagePayoffMode !== "string" ||
    !(MORTGAGE_PAYOFF_MODES as readonly string[]).includes(
      value.mortgagePayoffMode,
    )
  ) {
    return false;
  }
  if (typeof value.isHecm !== "boolean") return false;
  if (
    typeof value.section121Status !== "string" ||
    !(SECTION_121_STATUSES as readonly string[]).includes(
      value.section121Status,
    )
  ) {
    return false;
  }

  return true;
}

/** True when a value looks like a canonical SellerNetResult. */
function isSellerNetResult(value: unknown): value is SellerNetResult {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.output) &&
    typeof value.inputHash === "string" &&
    typeof value.calculatorVersion === "string"
  );
}

/** Read the provenance state of every provenanced field in an input. */
function provenanceOf(input: SellerNetInput): Record<string, ProvenanceState> {
  const result: Record<string, ProvenanceState> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isRecord(value) && "provenance" in value) {
      const state = value.provenance;
      if (typeof state === "string") {
        result[key] = state as ProvenanceState;
      }
    }
  }
  return result;
}

/** Professional review domains required for a canonical output. */
function reviewDomainsOf(
  result: SellerNetResult,
): readonly ProfessionalReviewDomain[] {
  return result.output.professionalReviewDomains;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class McpServiceImpl implements McpService {
  private readonly store: RunRecordStore;
  private readonly now: () => number;
  private readonly newRequestId: () => string;

  constructor(options: McpServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => Date.now());
    this.newRequestId =
      options.newRequestId ??
      (() => `req_${Math.random().toString(36).slice(2, 10)}`);
  }

  toolDescriptors(): McpToolDescriptor[] {
    return TOOL_DESCRIPTORS.map((descriptor) => ({ ...descriptor }));
  }

  async capabilities(
    _ctx: McpAuthContext,
    requestId?: string,
  ): Promise<McpToolEnvelope<CapabilitiesResult>> {
    return this.run("seller_net.capabilities", requestId, () => ({
      serverName: MCP_SERVER_NAME,
      serverVersion: MCP_SERVER_VERSION,
      schemaVersion: MCP_SCHEMA_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      calculatorVersion: CALCULATOR_VERSION,
      supportedProfessionalReviewDomains: MCP_PROFESSIONAL_REVIEW_DOMAINS,
      tools: this.toolDescriptors(),
      resources: RESOURCE_DESCRIPTORS.map((resource) => ({ ...resource })),
    }));
  }

  async getConfig(
    _ctx: McpAuthContext,
    requestId?: string,
  ): Promise<McpToolEnvelope<GetConfigResult>> {
    return this.run("seller_net.get_config", requestId, () => ({
      config: SELLER_NET_CONFIG,
      calculatorVersion: CALCULATOR_VERSION,
      schemaVersion: MCP_SCHEMA_VERSION,
    }));
  }

  async validate(
    _ctx: McpAuthContext,
    params: ValidateParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<ValidateResult>> {
    return this.run("seller_net.validate", requestId, () => {
      const input = this.requireInput(params);
      return {
        validation: validateInput(input),
        calculatorVersion: CALCULATOR_VERSION,
      };
    });
  }

  async calculate(
    _ctx: McpAuthContext,
    params: CalculateParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<CalculateResult>> {
    return this.run("seller_net.calculate", requestId, () => {
      const input = this.requireInput(params);
      const result = this.runCalculator(input);
      return {
        result,
        provenance: provenanceOf(input),
        professionalReviewDomains: reviewDomainsOf(result),
      };
    });
  }

  async compareScenarios(
    _ctx: McpAuthContext,
    params: CompareScenariosParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<CompareScenariosResult>> {
    return this.run("seller_net.compare_scenarios", requestId, () => {
      const input = this.requireInput(params);
      const spread = this.resolveSpread(params);
      const current = this.runCalculator(input);
      const comparison =
        params.targets !== undefined
          ? computeScenariosAtTargets(
              input,
              params.targets as [number, number, number],
            )
          : computeScenarios(input, current, spread);
      return { comparison, calculatorVersion: CALCULATOR_VERSION };
    });
  }

  async createRun(
    ctx: McpAuthContext,
    params: CreateRunParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<CreateRunResult>> {
    return this.run("seller_net.create_run", requestId, async () => {
      this.requireScope(ctx, SCOPE_RUNS);
      if (!isRecord(params)) {
        throw mcpError(
          "INVALID_PARAMS",
          "create_run params must be an object.",
        );
      }
      const { runId, propertyId } = params;
      if (!isBoundedText(runId)) {
        throw mcpError(
          "INVALID_PARAMS",
          `runId must be a non-empty string of at most ${MCP_LIMITS.maxTextLength} characters.`,
        );
      }
      if (!isBoundedText(propertyId)) {
        throw mcpError(
          "INVALID_PARAMS",
          `propertyId must be a non-empty string of at most ${MCP_LIMITS.maxTextLength} characters.`,
        );
      }
      const input = this.requireInput(params);

      // The exact effective inputs the calculator used, plus its canonical
      // outputs. No financial value is recomputed here.
      const result = this.runCalculator(input);
      const record: RunRecordPayload = {
        runId,
        calculatorVersion: result.calculatorVersion,
        propertyId,
        effectiveInputs: input,
        inputProvenance: provenanceOf(input),
        inputHash: result.inputHash,
        outputs: result.output,
        createdAt: new Date(this.now()).toISOString(),
      };

      const saved = await this.store.save(ctx.principal.id, record);
      if (!saved.ok) {
        throw mcpError(
          saved.code,
          saved.code === "DUPLICATE_RUN"
            ? "A run record with that identifier already exists."
            : "The run record could not be persisted.",
        );
      }

      return {
        runId,
        inputHash: result.inputHash,
        calculatorVersion: result.calculatorVersion,
        createdAt: record.createdAt,
      };
    });
  }

  async getRun(
    ctx: McpAuthContext,
    params: GetRunParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<GetRunResult>> {
    return this.run("seller_net.get_run", requestId, async () => {
      this.requireScope(ctx, SCOPE_RUNS);
      const runId = this.requireRunId(params);
      const record = await this.store.get(ctx.principal.id, runId);
      if (!record) {
        throw mcpError("NOT_FOUND", "No run record exists for that id.");
      }
      return { record };
    });
  }

  async listRuns(
    ctx: McpAuthContext,
    params: ListRunsParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<ListRunsResult>> {
    return this.run("seller_net.list_runs", requestId, async () => {
      this.requireScope(ctx, SCOPE_RUNS);
      const { limit, offset } = this.resolvePagination(params);
      const all = await this.store.list(ctx.principal.id);
      const records = all.slice(offset, offset + limit);
      return { records, total: all.length, limit, offset };
    });
  }

  async explainResult(
    _ctx: McpAuthContext,
    params: ExplainResultParams,
    requestId?: string,
  ): Promise<McpToolEnvelope<ExplainResultResult>> {
    return this.run("seller_net.explain_result", requestId, async () => {
      if (!isRecord(params)) {
        throw mcpError(
          "INVALID_PARAMS",
          "explain_result params must be an object.",
        );
      }
      let result: SellerNetResult;
      if (params.result !== undefined) {
        if (!isSellerNetResult(params.result)) {
          throw mcpError(
            "INVALID_PARAMS",
            "result is not a canonical calculator result.",
          );
        }
        result = params.result;
      } else if (params.runId !== undefined) {
        this.requireScope(_ctx, SCOPE_RUNS);
        const runId = this.requireRunId(params);
        const record = await this.store.get(_ctx.principal.id, runId);
        if (!record) {
          throw mcpError("NOT_FOUND", "No run record exists for that id.");
        }
        result = {
          output: record.outputs,
          inputHash: record.inputHash,
          calculatorVersion: record.calculatorVersion,
        };
      } else {
        throw mcpError(
          "INVALID_PARAMS",
          "explain_result requires either `result` or `runId`.",
        );
      }

      return {
        lines: buildExplanationLines(result),
        professionalReviewDomains: reviewDomainsOf(result),
        calculatorVersion: result.calculatorVersion,
      };
    });
  }

  async health(
    _ctx: McpAuthContext,
    requestId?: string,
  ): Promise<McpToolEnvelope<HealthResult>> {
    return this.run("seller_net.health", requestId, async () => {
      const calculatorAvailable = this.calculatorAvailable();
      const persistenceAvailable = await this.persistenceAvailable();
      return {
        status: calculatorAvailable ? "ok" : "degraded",
        schemaVersion: MCP_SCHEMA_VERSION,
        calculatorVersion: CALCULATOR_VERSION,
        calculatorAvailable,
        persistenceAvailable,
      };
    });
  }

  async readResource(
    _ctx: McpAuthContext,
    uri: string,
  ): Promise<McpResourceContent | null> {
    switch (uri) {
      case MCP_RESOURCE_URIS.schema:
        return {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            schemaVersion: MCP_SCHEMA_VERSION,
            supportedProfessionalReviewDomains: MCP_PROFESSIONAL_REVIEW_DOMAINS,
            tools: this.toolDescriptors(),
          }),
        };
      case MCP_RESOURCE_URIS.config:
        return {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(SELLER_NET_CONFIG),
        };
      case MCP_RESOURCE_URIS.calculator:
        return {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            calculatorVersion: CALCULATOR_VERSION,
            config: SELLER_NET_CONFIG,
          }),
        };
      case MCP_RESOURCE_URIS.provenance:
        return {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ states: PROVENANCE_STATES }),
        };
      default:
        return null;
    }
  }

  async dispatch(
    ctx: McpAuthContext,
    toolName: McpToolName,
    params: unknown,
    requestId?: string,
  ): Promise<McpToolEnvelope<unknown>> {
    if (!isToolName(toolName)) {
      return this.failure(
        typeof toolName === "string" ? toolName : "unknown",
        requestId,
        mcpError("UNKNOWN_TOOL", `Unknown tool: ${String(toolName)}`),
      );
    }

    const requiredScope = TOOL_SCOPES[toolName];
    if (requiredScope !== null && !hasScope(ctx, requiredScope)) {
      return this.failure(
        toolName,
        requestId,
        mcpError(
          ctx.principal.anonymous ? "UNAUTHORIZED" : "FORBIDDEN",
          `Tool ${toolName} requires scope ${requiredScope}.`,
        ),
      );
    }

    const args = isRecord(params) ? params : {};
    switch (toolName) {
      case "seller_net.capabilities":
        return this.capabilities(ctx, requestId);
      case "seller_net.get_config":
        return this.getConfig(ctx, requestId);
      case "seller_net.validate":
        return this.validate(ctx, args as unknown as ValidateParams, requestId);
      case "seller_net.calculate":
        return this.calculate(
          ctx,
          args as unknown as CalculateParams,
          requestId,
        );
      case "seller_net.compare_scenarios":
        return this.compareScenarios(
          ctx,
          args as unknown as CompareScenariosParams,
          requestId,
        );
      case "seller_net.create_run":
        return this.createRun(
          ctx,
          args as unknown as CreateRunParams,
          requestId,
        );
      case "seller_net.get_run":
        return this.getRun(ctx, args as unknown as GetRunParams, requestId);
      case "seller_net.list_runs":
        return this.listRuns(ctx, args as unknown as ListRunsParams, requestId);
      case "seller_net.explain_result":
        return this.explainResult(
          ctx,
          args as unknown as ExplainResultParams,
          requestId,
        );
      case "seller_net.health":
        return this.health(ctx, requestId);
      default:
        return this.failure(
          toolName,
          requestId,
          mcpError("UNKNOWN_TOOL", `Unknown tool: ${toolName}`),
        );
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Run a tool body, wrapping the result or error in a uniform envelope. */
  private async run<T>(
    toolName: string,
    requestId: string | undefined,
    body: () => T | Promise<T>,
  ): Promise<McpToolEnvelope<T>> {
    const startedAt = this.now();
    const id = requestId ?? this.newRequestId();
    try {
      const result = await body();
      return {
        ok: true,
        result,
        audit: this.audit(toolName, id, "success", startedAt),
      };
    } catch (error) {
      return {
        ok: false,
        error: toMcpError(error),
        audit: this.audit(toolName, id, "failure", startedAt),
      };
    }
  }

  /** Build a failure envelope for a pre-dispatch rejection. */
  private failure(
    toolName: string,
    requestId: string | undefined,
    error: McpError,
  ): McpToolEnvelope<never> {
    const startedAt = this.now();
    const id = requestId ?? this.newRequestId();
    return {
      ok: false,
      error,
      audit: this.audit(toolName, id, "failure", startedAt),
    };
  }

  private audit(
    toolName: string,
    requestId: string,
    outcome: "success" | "failure",
    startedAt: number,
  ): McpAuditMetadata {
    const completedAt = this.now();
    return {
      requestId,
      toolName,
      calculatorVersion: CALCULATOR_VERSION,
      schemaVersion: MCP_SCHEMA_VERSION,
      outcome,
      durationMs: Math.max(0, completedAt - startedAt),
      completedAt: new Date(completedAt).toISOString(),
    };
  }

  private requireScope(ctx: McpAuthContext, scope: string): void {
    if (!hasScope(ctx, scope)) {
      throw mcpError(
        ctx.principal.anonymous ? "UNAUTHORIZED" : "FORBIDDEN",
        `This tool requires scope ${scope}.`,
      );
    }
  }

  private requireInput(params: unknown): SellerNetInput {
    if (!isRecord(params) || !("input" in params)) {
      throw mcpError(
        "INVALID_PARAMS",
        "A canonical `input` object is required.",
      );
    }
    const input = params.input;
    if (!isSellerNetInput(input)) {
      throw mcpError(
        "INVALID_PARAMS",
        "`input` is not a structurally valid SellerNetInput.",
      );
    }
    if (!isBoundedJson(input)) {
      throw mcpError(
        "OUT_OF_RANGE",
        `Serialized input exceeds ${MCP_LIMITS.maxJsonBytes} bytes.`,
      );
    }
    return input;
  }

  private requireRunId(params: unknown): string {
    if (!isRecord(params) || !isBoundedText(params.runId)) {
      throw mcpError(
        "INVALID_PARAMS",
        `runId must be a non-empty string of at most ${MCP_LIMITS.maxTextLength} characters.`,
      );
    }
    return params.runId;
  }

  private resolveSpread(params: CompareScenariosParams): number {
    if (params.targets !== undefined) {
      if (!Array.isArray(params.targets)) {
        throw mcpError(
          "INVALID_PARAMS",
          "`targets` must be an array of numbers.",
        );
      }
      if (params.targets.length > MCP_LIMITS.maxScenarios) {
        throw mcpError(
          "TOO_MANY_SCENARIOS",
          `At most ${MCP_LIMITS.maxScenarios} scenarios are supported.`,
        );
      }
      if (params.targets.length !== 3) {
        throw mcpError(
          "INVALID_PARAMS",
          "`targets` must contain exactly three prices: downside, current, and upside.",
        );
      }
      for (const target of params.targets) {
        if (!inRange(target, 0, MCP_LIMITS.maxMoney)) {
          throw mcpError(
            "OUT_OF_RANGE",
            `Each target must be between 0 and ${MCP_LIMITS.maxMoney}.`,
          );
        }
      }
    }
    if (params.spread === undefined) return SCENARIO_DEFAULT_SPREAD;
    if (!inRange(params.spread, 0, MCP_LIMITS.maxMoney)) {
      throw mcpError(
        "OUT_OF_RANGE",
        `spread must be between 0 and ${MCP_LIMITS.maxMoney}.`,
      );
    }
    return params.spread;
  }

  private resolvePagination(params: ListRunsParams): {
    limit: number;
    offset: number;
  } {
    const limit = params.limit ?? MCP_LIMITS.defaultPageSize;
    const offset = params.offset ?? 0;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MCP_LIMITS.maxPageSize
    ) {
      throw mcpError(
        "PAGINATION_OUT_OF_BOUNDS",
        `limit must be an integer between 1 and ${MCP_LIMITS.maxPageSize}.`,
      );
    }
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > MCP_LIMITS.maxOffset
    ) {
      throw mcpError(
        "PAGINATION_OUT_OF_BOUNDS",
        `offset must be an integer between 0 and ${MCP_LIMITS.maxOffset}.`,
      );
    }
    return { limit, offset };
  }

  /** Delegate to the canonical calculator; never reimplement a formula. */
  private runCalculator(input: SellerNetInput): SellerNetResult {
    const validation = validateInput(input);
    if (!validation.valid) {
      throw mcpError(
        "VALIDATION_FAILED",
        "The canonical calculator rejected the input.",
        validation,
      );
    }
    let result: SellerNetResult;
    try {
      result = calculateSellerNetWaterfall(input);
    } catch {
      throw mcpError(
        "CALCULATION_FAILED",
        "The calculator could not produce a result.",
      );
    }
    for (const value of Object.values(result.output)) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw mcpError(
          "CALCULATION_FAILED",
          "The calculator produced a non-finite result.",
        );
      }
    }
    return result;
  }

  private calculatorAvailable(): boolean {
    try {
      return typeof calculateSellerNetWaterfall === "function";
    } catch {
      return false;
    }
  }

  private async persistenceAvailable(): Promise<boolean> {
    try {
      await this.store.list("__health_probe__");
      return true;
    } catch {
      return false;
    }
  }
}

/** Normalize any thrown value into a structured McpError. */
function toMcpError(error: unknown): McpError {
  if (
    isRecord(error) &&
    typeof error.code === "string" &&
    "jsonRpcCode" in error
  ) {
    return error as unknown as McpError;
  }
  return mcpError("INTERNAL_ERROR", "An unexpected internal error occurred.");
}

/**
 * Structure an existing canonical result into labeled lines. This reads values
 * verbatim from the calculator output and performs no arithmetic.
 */
function buildExplanationLines(result: SellerNetResult): ExplanationLine[] {
  const output = result.output;
  const lines: ExplanationLine[] = [
    {
      field: "grossPrice",
      value: output.grossPrice,
      label: "Gross sale price",
    },
    {
      field: "totalCommissions",
      value: output.totalCommissions,
      label: "Total commissions",
    },
    {
      field: "totalClosingCosts",
      value: output.totalClosingCosts,
      label: "Total closing costs",
    },
    {
      field: "totalEncumbrances",
      value: output.totalEncumbrances,
      label: "Total encumbrances",
    },
    {
      field: "totalDeductions",
      value: output.totalDeductions,
      label: "Total deductions",
    },
    {
      field: "estimatedNetProceeds",
      value: output.estimatedNetProceeds,
      label: "Estimated net proceeds",
    },
    {
      field: "estimatedSellerShortfall",
      value: output.estimatedSellerShortfall,
      label: "Estimated seller shortfall",
    },
  ];

  if (output.hecmAccruedPayoff !== null) {
    lines.push({
      field: "hecmAccruedPayoff",
      value: output.hecmAccruedPayoff,
      label: "HECM accrued payoff (estimate)",
    });
  }
  if (output.taxActive) {
    lines.push({
      field: "estimatedTaxOwed",
      value: output.estimatedTaxOwed,
      label: "Estimated capital-gains tax",
    });
  }
  if (output.frictionActive) {
    lines.push({
      field: "probabilisticTrueNet",
      value: output.probabilisticTrueNet,
      label: "Probabilistic true net (friction-adjusted)",
    });
  }

  return lines;
}

/** Construct the provider-neutral MCP service. */
export function createMcpService(options: McpServiceOptions): McpService {
  return new McpServiceImpl(options);
}

/** Re-exported for consumers that build their own descriptors. */
export { TOOL_DESCRIPTORS as MCP_TOOL_DESCRIPTORS };
export { RESOURCE_DESCRIPTORS as MCP_RESOURCE_DESCRIPTORS };
export { PROFESSIONAL_REVIEW_DOMAINS };
