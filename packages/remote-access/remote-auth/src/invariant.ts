/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-remote-auth`.
 * @module @deepseek-ai/dsh-remote-auth/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-remote-auth'

/** Cordis companion plugin name. */
export const name = 'remote-auth-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: remote authentication state (the seed, issued
 * sessions, and the paired device) is an in-memory network-boundary fact that
 * is deliberately excluded from the session log and has no event stream to
 * assert against; its token and pairing algebra is enforced by unit tests.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
