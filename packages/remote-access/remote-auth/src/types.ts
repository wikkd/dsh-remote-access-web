/**
 * @module @deepseek-ai/dsh-remote-auth/types
 *
 * The `ctx.remoteAuth` service contract: device pairing, session issuance, and
 * the request-time authentication verdict it hands the `/api` gate. Type-only —
 * carries no runtime code.
 * @packageDocumentation
 */

/** A request the verifier reads only the wire headers of. */
export interface AuthRequest {
  /** Read request headers: `cookie` for the session, `host` for loopback. */
  headers: Readonly<Record<string, string | undefined>>
}

/** Result of the request-time authentication check. */
export interface AuthVerdict {
  /** `authorized` admits the request; `unauthenticated` must answer 401. */
  outcome: 'authorized' | 'unauthenticated'
  /**
   * Whether the request came from the loopback surface, which the gate must
   * never force through authentication. Present for diagnostics; the outcome
   * is authoritative.
   */
  loopback: boolean
}

/** Live state snapshot surfaced for a device-management UI. */
export interface AuthStatus {
  /** Whether a pairing device is active and a session is currently issued. */
  paired: boolean
  /** Nominal session lifetime in seconds (0 when no session is issued). */
  sessionTtlSeconds: number
  /**
   * The effective public origin (scheme://host[:port]) pairing login URLs are
   * built from — the configured `publicUrl` or a derived tunnel authority.
   * Absent when no origin can be derived.
   */
  publicUrl?: string
}

/**
 * The Remote-access authentication service. Declared as `ctx.remoteAuth` and
 * consumed by the `/api` gate. Consumers ask whether one request carries a
 * valid, unexpired session; they never mint a token themselves — the owning
 * plugin holds the seed, the pairing state machine, and the session table.
 */
export interface RemoteAuth {
  /**
   * Decide whether one request may reach the authenticated surface. Loopback
   * is always authorized; every other request needs a valid session cookie.
   * @param request - the request's headers.
   * @returns the verdict and its loopback diagnostic.
   */
  verify(request: AuthRequest): AuthVerdict
  /** Snapshot of pairing and session state for a device-management UI. */
  status(): AuthStatus
  /**
   * Invalidate every issued session immediately. A paired device must pair
   * again with a fresh one-time code.
   */
  revoke(): void
  /**
   * Mint a fresh one-time pairing code. A code is single-use and derived from
   * the seed plus a per-process nonce; minting a new code supersedes any
   * earlier outstanding one. The optional requested session lifetime, in
   * seconds, is captured at mint time and applied to the session issued when
   * the code is redeemed; when omitted the deployment default is used.
   * @param requestedTtlSeconds - optional requested session lifetime (seconds);
   *   on redemption the issued session uses this, clamped to the deployment
   *   config bounds, falling back to the configured default when omitted.
   * @returns the one-time pairing code.
   */
  pair(requestedTtlSeconds?: number): string
  /**
   * Build the absolute login URL that carries a freshly minted pairing code,
   * for a phone to open and pair in one tap.
   * @param code - the code returned by {@link pair}.
   * @param origin - optional external origin (scheme://host[:port]) the caller
   * was reached by; the configured `publicUrl` wins over this, and both fall
   * back to `https://localhost`.
   * @returns the absolute login URL.
   */
  loginUrl(code: string, origin?: string): string
}
