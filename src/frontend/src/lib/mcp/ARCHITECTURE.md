# MCP Integration Layer — Architecture

## Purpose

A **provider-neutral** MCP integration layer over the existing Seller Net
Waterfall calculator. Any MCP-compatible client receives the same contracts and
results. There is no OpenAI-, Claude-, Gemini-, Mistral-, or vendor-specific
logic anywhere in the layer.

## Layering

```
MCP Client
  → MCP transport / auth          (transport adapter — NOT in this layer)
  → MCP tool handlers             (src/lib/mcp/service.ts — dispatch + guards)
  → application service           (src/lib/mcp/service.ts — orchestration only)
  → canonical Seller Net calculator (src/lib/seller-net — THE source of truth)
  → deterministic output
```

The MCP layer **never performs its own financial math**. Every calculation
delegates to `calculateSellerNetWaterfall`, `computeScenarios`, `validateInput`,
and `SELLER_NET_CONFIG` from `@/lib/seller-net`. The layer only shapes inputs,
enforces limits, attaches audit metadata, and structures outputs.

## Where the service lives

The canonical calculator is a **frontend TypeScript module**
(`src/frontend/src/lib/seller-net`). The MCP service therefore lives beside it at
`src/frontend/src/lib/mcp/` as a pure, framework-free TypeScript module. This
keeps the calculator as the single source of financial truth with no
reimplementation and no cross-language drift.

## Implemented layering

`createMcpService(options)` (`src/lib/mcp/service.ts`) returns the concrete
`McpService`. Each tool method is a thin orchestration shell:

1. **Guard** — structural shape checks (`isSellerNetInput`, `isSellerNetResult`),
   scope checks (`requireScope`), and `MCP_LIMITS` bounds (pagination, spread,
   targets, text length, serialized JSON size).
2. **Delegate** — call the canonical calculator (`validateInput`,
   `calculateSellerNetWaterfall`, `computeScenarios`) or the `RunRecordStore`
   port. No formula is reimplemented anywhere in this layer.
3. **Envelope** — wrap the payload in `McpToolEnvelope<T>` with `ok`, `result`
   or `error`, and one `McpAuditMetadata` record.

`dispatch(ctx, toolName, params, requestId)` is the single entry point a
transport calls. It rejects unknown tool names with `UNKNOWN_TOOL`, enforces the
per-tool scope from `TOOL_SCOPES`, then routes to the typed method. Every path —
including pre-dispatch rejections — returns an envelope with audit metadata, so a
transport never has to synthesize one.

`explain_result` reads values verbatim from an existing `SellerNetResult` (or a
stored run record) and emits `ExplanationLine[]`; it performs no arithmetic.

`health` probes the calculator module and the store (`store.list` on a sentinel
owner) and reports `ok` / `degraded` without throwing.

## Run-record persistence reuse

`create_run` / `get_run` / `list_runs` reuse the **existing backend canister**
run-record persistence (`saveRunRecord`, `getRunRecord`, `listRunRecords` in
`src/backend/mixins/run-records-api.mo`). The service talks to it through the
`RunRecordStore` port (`src/lib/mcp/service.ts`):

- Production adapter: wraps the generated backend bindings
  (`src/frontend/src/backend.ts`) and maps `RunRecordView` ⇄ `RunRecordPayload`.
- Test adapter: in-memory implementation.

The backend stores opaque snapshot JSON verbatim and performs no financial
computation, so replay reproduces outputs exactly: the run record stores the
**exact effective inputs** the calculator used, plus the input hash and the
calculator version.

## Transport boundary

`McpService` (`src/lib/mcp/service.ts`) is transport-independent. A JSON-RPC MCP
endpoint calls `dispatch(ctx, toolName, params, requestId)`; an in-process caller
calls the typed methods directly. Transport concerns — HTTP framing, JSON-RPC
envelopes, bearer extraction — live outside this interface.

The transport adapter lives in `src/lib/mcp/transport.ts` and the pure JSON-RPC
framing in `src/lib/mcp/jsonrpc.ts`. The adapter is the **only** module that
knows about wire framing and credentials, and it calls **only** the `McpService`
interface — never the calculator, never the backend, never a vendor SDK.

```
HTTP request (POST /mcp)
  → extractBearerToken(headers)          (transport.ts)
  → resolveAuthContext(token, verifier)  (auth.ts)
  → handleJsonRpcRequest(request, ctx)   (transport.ts)
      → service.dispatch(ctx, tool, params)   (service.ts — business logic)
  → JSON-RPC 2.0 response                (jsonrpc.ts)
```

`createMcpTransport({ service, verifier })` returns an `McpTransport` with two
entry points:

- `handle(request)` — adapts a minimal `{ method, headers, body }` HTTP request
  into a `{ status, headers, body }` HTTP response. Non-POST requests get `405`;
  malformed bodies get a JSON-RPC parse error with a `null` id.
- `handleJsonRpcRequest(request, ctx)` — the pure JSON-RPC entry point a
  different transport (stdio, in-process, a real HTTP server) can call directly
  without re-implementing framing.

Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`,
`resources/list`, `resources/read`. `tools/call` dispatches through
`service.dispatch` and returns the tool result as both `structuredContent` and a
JSON-serialized `content[0].text` block — structured JSON, never formatted prose.
Unknown methods return `-32601`; unknown tools return the structured
`UNKNOWN_TOOL` code.

### Platform limitation

The Caffeine platform does not expose a true MCP transport endpoint (no
long-lived SSE/streamable-HTTP MCP server). This layer therefore ships the
**provider-neutral service, schemas, handlers, transport adapter, and tests**,
and documents the limitation. Attaching a true MCP transport later requires only
a thin host that:

1. routes `POST /mcp` to `transport.handle(request)`;
2. supplies a real `McpTokenVerifier` (no secret is read from source — the
   verifier is injected by the host);
3. returns the adapter's `{ status, headers, body }` verbatim.

No business logic changes are needed to attach a transport: the adapter already
extracts the bearer token, resolves the auth context, dispatches through the
service, and serializes the JSON-RPC response.

## Auth approach

`McpAuthContext` + `McpTokenVerifier` (`src/lib/mcp/auth.ts`) provide a
bearer-token-ready abstraction with **no hard-coded secrets**. The transport
resolves a token to an `McpPrincipal`; the service enforces scopes:

- `seller_net:read` — capabilities, get_config, validate, calculate,
  compare_scenarios, explain_result, health, resources.
- `seller_net:runs` — create_run, get_run, list_runs.

Anonymous callers receive `UNAUTHORIZED` on run-record tools.

## Schema / version strategy

Schema versioning is **separate** from calculator versioning
(`src/lib/mcp/version.ts`):

- `MCP_SCHEMA_VERSION = "seller_net.mcp.v1"` — tool/contract/error/audit shape.
- `CALCULATOR_VERSION = "SELLER_NET_WATERFALL v1.3.0"` — financial formulas.

A schema change never implies a calculator change, and vice versa. Both versions
are echoed in every audit record and in `seller_net.health`.

## Error codes

Stable structured codes in `src/lib/mcp/errors.ts`, each mapped to a JSON-RPC
numeric code: `MALFORMED_REQUEST`, `INVALID_PARAMS`, `OUT_OF_RANGE`,
`TOO_MANY_SCENARIOS`, `PAGINATION_OUT_OF_BOUNDS`, `UNKNOWN_TOOL`, `UNAUTHORIZED`,
`FORBIDDEN`, `NOT_FOUND`, `DUPLICATE_RUN`, `VALIDATION_FAILED`,
`CALCULATION_FAILED`, `INTERNAL_ERROR`.

## Safe limits

`MCP_LIMITS` (`src/lib/mcp/limits.ts`): max 10 scenarios, page size 1–100
(default 20), offset ≤ 10 000, money ≤ 1e9, bps ≤ 10 000, fraction ≤ 1, months
≤ 1 200, days ≤ 365, text ≤ 256 chars, JSON ≤ 1 MB.

## Read-only resources

Four resources (`MCP_RESOURCE_URIS`): `seller_net://schema`,
`seller_net://config`, `seller_net://calculator`, `seller_net://provenance`.

## Preservation guarantees

- UNKNOWN vs explicit 0 preserved: `ProvenancedNumber.value === null` with
  provenance `UNKNOWN` is never coerced to 0.
- Provenance preserved: `USER_PROVIDED`, `DEFAULT_ASSUMPTION`, `ESTIMATE`,
  `VERIFIED_PAYOFF`, `UNKNOWN`.
- Professional review domains preserved: `LENDER` (HECM active), `CPA_TAX` (tax
  active), plus `ESCROW` / `TITLE` where the calculator reports them.
- `explain_result` only structures existing calculator outputs; it performs no
  new calculations.
- The existing browser app is unaffected: the MCP layer is additive and the app
  continues to work if MCP is unavailable.

## Professional review domain vocabulary

The MCP layer declares the **full** professional review domain vocabulary in its
own contract via `MCP_PROFESSIONAL_REVIEW_DOMAINS`
(`src/lib/mcp/schemas.ts`):

```
["ESCROW", "TITLE", "CPA_TAX", "LENDER"]
```

This is contract metadata, discoverable by any MCP client through
`seller_net.capabilities` (`supportedProfessionalReviewDomains`), the
`seller_net.capabilities` output schema, and the `seller_net://schema` resource.

It is deliberately **wider** than the canonical calculator's frozen
`PROFESSIONAL_REVIEW_DOMAINS` (`["LENDER", "CPA_TAX"]`). The canonical
calculator currently activates only:

- `LENDER` — when HECM is active;
- `CPA_TAX` — when the capital-gains tax module is active.

`ESCROW` and `TITLE` are part of the declared MCP contract vocabulary but are
not currently produced as *active* domains by the canonical calculator.

The MCP layer never invents an active domain for a result: `calculate`,
`compare_scenarios`, and `explain_result` echo the canonical calculator's
`professionalReviewDomains` **verbatim**. Declaring the vocabulary and echoing
the active set are separate concerns — the former is discovery, the latter is
faithful passthrough.

## Defensive transport behavior

The transport is hardened against misbehaving adapters:

- `service.dispatch` is wrapped so a throwing service yields a structured
  JSON-RPC `INTERNAL_ERROR` (`-32603`) response instead of propagating.
- `service.capabilities` / `service.readResource` failures degrade to an empty
  resource list / `NOT_FOUND` rather than throwing.
- `resolveAuthContext` treats a throwing `McpTokenVerifier` exactly like one
  that returns `null`: the caller falls back to the anonymous context.

The real `McpService` never throws (every path returns an envelope), so these
guards are unreachable in production; they exist so any future service
implementation cannot break the endpoint.
