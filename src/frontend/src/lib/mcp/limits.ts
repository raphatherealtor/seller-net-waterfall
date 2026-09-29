/**
 * MCP integration layer — safe limits.
 *
 * Every bound the service enforces on untrusted input lives here. These are
 * transport-independent: a JSON-RPC endpoint, an HTTP endpoint, or an in-process
 * caller all pass through the same guards.
 */

export interface McpLimits {
  /** Maximum scenarios accepted by seller_net.compare_scenarios. */
  maxScenarios: number;
  /** Default page size for seller_net.list_runs when `limit` is omitted. */
  defaultPageSize: number;
  /** Maximum page size for seller_net.list_runs. */
  maxPageSize: number;
  /** Maximum accepted pagination offset. */
  maxOffset: number;
  /** Maximum accepted absolute dollar amount for any money field. */
  maxMoney: number;
  /** Maximum accepted basis-point rate (100% = 10000 bps). */
  maxBps: number;
  /** Maximum accepted decimal fraction (1 = 100%). */
  maxFraction: number;
  /** Maximum accepted whole months for accrual fields. */
  maxMonths: number;
  /** Maximum accepted days for the property-tax proration. */
  maxDays: number;
  /** Maximum accepted length of any free-text identifier (runId, propertyId). */
  maxTextLength: number;
  /** Maximum accepted byte length of a serialized JSON payload. */
  maxJsonBytes: number;
}

/** The single canonical limits object. */
export const MCP_LIMITS: McpLimits = {
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
};
