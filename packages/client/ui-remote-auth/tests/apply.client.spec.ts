/**
 * Registration: the remote-access settings section comes from one apply, and
 * defers until the `settings.section` slot it fills has been declared.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-remote-auth/client'
import { RemoteAuthSection } from '../src/client/RemoteAuthSection.tsx'
import type { RemoteAuthSectionInjected } from '../src/client/RemoteAuthSection.tsx'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  new TestRemote(ctx)
  const calls: string[] = []
  ctx.provide('connection', {
    api: {
      remoteAuth: {
        status: () => { calls.push('status'); return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { paired: true, sessionTtlSeconds: 7200 } } }) },
        pair: () => { calls.push('pair'); return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { code: 'abcd', loginUrl: 'https://x/__remote/pair?code=abcd' } } }) },
        revoke: () => { calls.push('revoke'); return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: {} } }) },
      },
    },
  } as never)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, calls }
}

function declareRoot(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-remote-auth apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the remote-access settings section', async () => {
    const { ctx, slots } = await bench()
    declareRoot(slots)

    await ctx.plugin({ inject: [...inject], apply }).await()

    const section = slots.entries('settings.section')[0]!
    expect(section.component).toBe(RemoteAuthSection)
    expect(section.options).toMatchObject({ id: 'remote-auth', order: 30 })
    expect(resolveSlotLabel(section.options.label)).toBe('远程访问')
  })

  it('registers into a declaration that arrives after apply', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()

    declareRoot(slots)

    await vi.waitFor(() => { expect(slots.entries('settings.section')).toHaveLength(1) })
  })

  it('routes the section actions to one controller', async () => {
    const { ctx, slots, calls } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()

    const section = (slots.entries('settings.section')[0]!.inject as unknown as () => RemoteAuthSectionInjected)()

    await section.load()
    section.setTtlSeconds(3600)
    section.setTunnelAddress('https://my-tunnel.example:9999')
    await section.pair()
    section.dismissLink()
    section.confirmRevoke(true)
    await section.revoke()

    expect(calls).toEqual(['status', 'pair', 'revoke', 'status'])
    expect(section.hooks.remoteAuth.getSnapshot().paired).toBe(true)
    expect(section.hooks.remoteAuth.getSnapshot().pendingTtlSeconds).toBe(3600)
    expect(section.hooks.remoteAuth.getSnapshot().tunnelAddress).toBe('https://my-tunnel.example:9999')
  })

  it('removes the section when the plugin fiber disposes', async () => {
    const { ctx, slots } = await bench()
    declareRoot(slots)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    await fiber.dispose()

    expect(slots.entries('settings.section')).toHaveLength(0)
  })
})
