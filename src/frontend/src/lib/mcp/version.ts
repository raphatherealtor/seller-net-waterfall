/**
 * MCP integration layer — versioning constants.
 *
 * Schema versioning is deliberately SEPARATE from the calculator version. The
 * calculator version (`CALCULATOR_VERSION`, e.g. "SELLER_NET_WATERFALL v1.3.0")
 * tracks financial formula changes. The MCP schema version tracks the shape of
 * the tool contracts, error codes, audit metadata, and resource descriptors.
 * A schema change never implies a calculator change, and vice versa.
 */

/** Version of the MCP tool/contract schema. Bump on any contract shape change. */
export const MCP_SCHEMA_VERSION = "seller_net.mcp.v1";

/** Version of the MCP protocol surface this layer targets (JSON-RPC 2.0). */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

/** Stable identifier for the provider-neutral server implementation. */
export const MCP_SERVER_NAME = "seller-net-mcp";

/** Server implementation version (independent of schema and calculator). */
export const MCP_SERVER_VERSION = "1.0.0";
