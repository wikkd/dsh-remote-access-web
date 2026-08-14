/** The package's node half: an empty host body and an explained empty invariant companion. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as RemoteAuthInvariant from '@deepseek-ai/dsh-client-ui-remote-auth/invariant'

describe('invariant companion', () => {
  it('reserves package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })

    await expect(ctx.plugin(RemoteAuthInvariant).await()).resolves.toBeDefined()
  })

  it('has an empty node half', async () => {
    const { apply } = await import('@deepseek-ai/dsh-client-ui-remote-auth')

    apply()

    expect(typeof apply).toBe('function')
  })

  it('exposes the empty node apply from source', async () => {
    const { apply } = await import('../src/index.ts')

    apply()

    expect(typeof apply).toBe('function')
  })
})
