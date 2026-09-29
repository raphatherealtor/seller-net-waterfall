/**
 * MCP integration layer — bearer-token-ready auth abstraction.
 *
 * The service never reads a secret from source. It receives an `McpAuthContext`
 * from the transport, which is responsible for extracting credentials. The
 * default `anonymousAuthContext` grants read-only access to the pure tools and
 * denies run-record access. A real transport supplies a verifier that resolves a
 * bearer token to a principal; no token value is ever hard-coded here.
 */

/** The authenticated identity a tool call runs as. */
export interface McpPrincipal {
  /** Stable principal identifier (e.g. an Internet Computer principal text). */
  id: string;
  /** True when the caller presented no verifiable credentials. */
  anonymous: boolean;
  /** Optional granted scopes, e.g. ["seller_net:read", "seller_net:runs"]. */
  scopes: readonly string[];
}

/** The auth context passed into every service call. */
export interface McpAuthContext {
  /** The resolved principal for this call. */
  principal: McpPrincipal;
  /** Raw bearer token, if the transport extracted one. Never logged. */
  bearerToken?: string;
}

/** Resolves a bearer token to a principal. Implemented by the transport. */
export interface McpTokenVerifier {
  /**
   * Verify a bearer token. Returns the resolved principal, or `null` when the
   * token is absent, malformed, or expired. Implementations must not throw for
   * an invalid token — return `null` instead.
   */
  verify(token: string): Promise<McpPrincipal | null>;
}

/** Scope required to read calculator data (capabilities, config, calculate). */
export const SCOPE_READ = "seller_net:read";

/** Scope required to create, read, list, or replay run records. */
export const SCOPE_RUNS = "seller_net:runs";

/** The anonymous context: no credentials, no scopes. */
export const anonymousAuthContext: McpAuthContext = {
  principal: { id: "anonymous", anonymous: true, scopes: [] },
};

/**
 * Build an auth context from an optional bearer token using a verifier. When no
 * token is present or verification fails, returns the anonymous context.
 */
export async function resolveAuthContext(
  token: string | undefined,
  verifier: McpTokenVerifier,
): Promise<McpAuthContext> {
  if (!token) return anonymousAuthContext;
  let principal: McpPrincipal | null;
  try {
    principal = await verifier.verify(token);
  } catch {
    // A verifier that throws is treated exactly like one that returns null:
    // the caller falls back to the anonymous context rather than propagating.
    return anonymousAuthContext;
  }
  if (!principal) return anonymousAuthContext;
  return { principal, bearerToken: token };
}

/** True when the principal holds the given scope. */
export function hasScope(ctx: McpAuthContext, scope: string): boolean {
  return ctx.principal.scopes.includes(scope);
}
