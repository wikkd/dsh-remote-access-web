/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-remote-access-web`.
 * @module @deepseek-ai/dsh-remote-access-web/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-remote-access-web'

/** Cordis companion plugin name. */
export const name = 'remote-access-web-bundle-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: the package is a static patch-list carrier (a YAML
// document of loader rows owned by other packages); it mounts no service, emits
// no events, and owns no mutable relation to check. The inserted tunnel row's
// own package (`@deepseek-ai/dsh-remote-access`) carries that row's invariant.
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
