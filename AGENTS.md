# Project Guidance

## User Preferences

- Never change calculator logic, formulas, validation, HECM, Section 121, friction, scenarios, snapshots, or provenance behavior
- Preserve the full regression suite; new work must not break existing tests
- The deterministic Seller Net calculator is the single financial source of truth; integration layers must never perform their own financial math
- Provider-neutral integration: no vendor-specific logic, identical contracts and results for any compatible client
- Structured JSON-compatible outputs, never formatted prose
- Keep transport separate from business logic
- No hard-coded secrets

## Verified Commands

- **typecheck**: `pnpm typecheck (from src/frontend/); mops check --fix (from src/backend/)`
- **fix**: `pnpm fix (from src/frontend/); mops check --fix (from src/backend/)`
- **build**: `pnpm build (from src/frontend/); mops build (from src/backend/)`

## Learnings

- The three chart components (components/charts/waterfall-chart.tsx, deduction-breakdown-chart.tsx, scenario-chart.tsx) are pure presentational: they read canonical SellerNetOutput fields and the computeScenarios() result, mapping values onto SVG/CSS geometry with no arithmetic beyond clamped scale fractions; never recompute a financial figure in a chart.
- WaterfallChart and DeductionBreakdownChart consume useSellerNet() directly; ScenarioChart takes scenarios as a prop, so only the latter needs the spread passed through.
- The waterfall chart renders a full stepped SVG from sm upward and collapses to a compact proportional rail below sm, keeping mobile labels readable.
- SectionIcon (components/ui/section-icon.tsx) accepts either a semantic section key (canonical SECTION_ICONS map) or an explicit icon name, plus size 'sm'|'lg' and an optional label; omitting label renders it aria-hidden so decorative badges never add noise to the accessible name.
- The .icon-badge utility carries the dimensional treatment (faint teal gradient fill, hairline border, inset top highlight, subtle drop shadow) and sizes its child svg, so SectionIcon only renders the lucide glyph inside the span.
- Chart color tokens are consumed as oklch(var(--chart-N)) via the chartColor() helper rather than Tailwind classes, because the token names are dynamic per slice.
- Chart bars use the .chart-bar utility (width/height CSS transitions) so values animate smoothly on every input change; friction-adjusted scenario markers are absolutely positioned ticks on the same scale.
- The right results column order is KpiRow, charts card (WaterfallChart then DeductionBreakdownChart), Waterfall, ScenarioComparison, Disclaimer; ScenarioComparison embeds ScenarioChart internally.
- Brownfield OKLCH extension: add raw L C H token triplets to both :root and .dark, then surface them via tailwind.config.js oklch(var(--token)); never rewrite existing color/borderRadius/fontFamily blocks.
- The elevation ladder (.surface-1/2/3) plus .icon-badge gives restrained layered depth via inset top highlight and a 1-2px soft shadow; the print block flattens them to #fff with box-shadow:none.
- The dimensional badge depth lives entirely in the .icon-badge CSS (145deg face gradient, inset bevel/shade layers, cast shadow, ::after recess well) plus a child .icon-badge-glyph recessed plate, so SectionIcon's public API and all call sites stay unchanged.
- One fixed upper-left light source is encoded as inset top/left bevel highlights and inset bottom/right edge-low shades; retune lighting via --badge-bevel/--badge-edge-lo in both themes without touching utilities.
- Badge size hierarchy: sm=36px for light ledger headers, lg=48px for dark results-panel headers; the print block must flatten .icon-badge-glyph separately from ::after or the recess gradient leaks into the printed sheet.
- The waterfall's stepped SVG uses a pixel-space viewBox (0 0 340 168) rather than the normalized 0 0 100 100 box, because preserveAspectRatio=none stretches SVG text; ChartFigure takes an optional viewBox prop for this.
- A financial waterfall's running balance is a cumulative sum of the canonical deduction amounts (presentation-only geometry), never a re-derived financial figure; the net column reads output.estimatedNetProceeds directly.
- The scenario chart's SVG columns and its legend rails must share one max (computed over estimatedNetProceeds and frictionNet) so a rail's length matches its column.
- pnpm test must be invoked as `pnpm test` (which supplies --environment jsdom); a bare `vitest run` fails every DOM test with 'document is not defined'.
- The MCP integration layer lives at src/frontend/src/lib/mcp as a framework-free module beside the canonical calculator; it is additive and not imported by any browser-app source, so the app is unaffected by MCP availability.
- The MCP layer declares MCP_PROFESSIONAL_REVIEW_DOMAINS = [ESCROW, TITLE, CPA_TAX, LENDER] as contract metadata surfaced via capabilities and the schema resource, while active domains are echoed verbatim from the canonical calculator (which currently activates only LENDER for HECM and CPA_TAX for tax).
- The MCP transport is created via createMcpTransport({ service, verifier }) and is isolated from business logic; createMcpService({ store }) takes a RunRecordStore port so tests inject an in-memory adapter while production wraps the backend bindings.
- The MCP layer performs no financial math: every tool delegates to calculateSellerNetWaterfall, computeScenarios, validateInput, SELLER_NET_CONFIG, and CALCULATOR_VERSION from @/lib/seller-net.
- MCP schema versioning (MCP_SCHEMA_VERSION='seller_net.mcp.v1') is tracked separately from calculator versioning (CALCULATOR_VERSION='SELLER_NET_WATERFALL v1.3.0'); both are echoed in every audit record and in seller_net.health.
- The MCP contract test suites are mcp-tools.test.ts, mcp-transport.test.ts, mcp-safety.test.ts, and mcp-contract-baseline.test.ts; the full frontend suite is 30 files / 457 tests.
- createMcpTransport, extractBearerToken, and McpHttpRequest are exported from @/lib/mcp/transport but not re-exported from @/lib/mcp/index.ts; import them from the transport module directly.
- Required SellerNetInput fields cannot be UNKNOWN and still calculate; to exercise UNKNOWN provenance in a calculable input, use an optional field such as manualAdjustedPrice.
