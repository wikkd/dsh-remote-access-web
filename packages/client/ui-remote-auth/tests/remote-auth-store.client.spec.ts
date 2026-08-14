/**
 * The remote-access controller: status read on mount, a one-time pairing link
 * minted on demand, and a confirmed revoke that re-reads status. Every
 * mutation writes through the `remoteAuth` wire domain; the host stays the
 * single fact source.
 */

import { describe, expect, it } from 'vitest'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { messageOf, RemoteAuthController } from '../src/client/remote-auth-store.ts'
import type { RemoteAuthState } from '../src/client/remote-auth-store.ts'

interface FakeOptions {
  /** Reject `status` with this message. */
  failStatus?: string
  /** Reject `pair` with this message. */
  failPair?: string
  /** Reject `revoke` with this message. */
  failRevoke?: string
  /** Throw from `status` rather than answering, as a dead transport does. */
  throwStatus?: boolean
  /** Throw from `pair`, as a dead transport does. */
  throwPair?: boolean
  /** Throw from `revoke`, as a dead transport does. */
  throwRevoke?: boolean
  /** Record every call the controller made, in order. */
  calls?: string[]
  /** Capture the `ttlSeconds` each `pair` request carried. */
  pairTtls?: (number | undefined)[]
  /** Capture the `publicUrl` each `pair` request carried. */
  pairUrls?: (string | undefined)[]
  /** The `publicUrl` the status answer reports, to seed the tunnel field. */
  statusPublicUrl?: string
}

const ok = (value: unknown) => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value } })
const fail = (message: string) =>
  Promise.resolve({ rpcId: 'r', result: { ok: false as const, error: { code: 'internal', message, details: {} } } })

function fakeApi(options: FakeOptions = {}): Pick<IApiClient, 'remoteAuth'> {
  const record = (method: string): void => { options.calls?.push(method) }
  return {
    remoteAuth: {
      status: () => {
        record('status')
        if (options.throwStatus === true) return Promise.reject(new Error('socket closed'))
        if (options.failStatus !== undefined) return fail(options.failStatus)
        return ok({
          paired: true,
          sessionTtlSeconds: 7200,
          ...options.statusPublicUrl !== undefined ? { publicUrl: options.statusPublicUrl } : {},
        })
      },
      pair: ({ ttlSeconds, publicUrl }: { ttlSeconds?: number; publicUrl?: string }) => {
        record('pair')
        options.pairTtls?.push(ttlSeconds)
        options.pairUrls?.push(publicUrl)
        if (options.throwPair === true) return Promise.reject(new Error('socket closed'))
        if (options.failPair !== undefined) return fail(options.failPair)
        return ok({ code: 'abcd', loginUrl: 'https://tunnel.example.com:5953/__remote/pair?code=abcd' })
      },
      revoke: () => {
        record('revoke')
        if (options.throwRevoke === true) return Promise.reject(new Error('socket closed'))
        if (options.failRevoke !== undefined) return fail(options.failRevoke)
        return ok({})
      },
    },
  } as unknown as Pick<IApiClient, 'remoteAuth'>
}

function harness(options: FakeOptions = {}) {
  const calls: string[] = []
  const controller = new RemoteAuthController(fakeApi({ ...options, calls }))
  return { controller, calls }
}

describe('loading status', () => {
  it('reads status and reports the paired session', async () => {
    const { controller, calls } = harness()

    await controller.load()

    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.paired).toBe(true)
    expect(state.sessionTtlSeconds).toBe(7200)
    expect(calls).toEqual(['status'])
  })

  it('keeps one load in flight rather than stacking reads', async () => {
    const { controller, calls } = harness()

    await Promise.all([controller.load(), controller.load()])

    expect(calls.filter(call => call === 'status')).toHaveLength(1)
  })

  it('surfaces a refusal as the page error', async () => {
    const { controller } = harness({ failStatus: 'not for you' })

    await controller.load()

    const state = controller.store.getSnapshot()
    expect(state.status).toBe('error')
    expect(state.error).toBe('not for you')
  })

  it('folds a dead transport into the same error surface', async () => {
    const { controller } = harness({ throwStatus: true })

    await controller.load()

    expect(controller.store.getSnapshot().status).toBe('error')
    expect(controller.store.getSnapshot().error).toContain('socket closed')
  })

  it('reads a non-Error rejection as its string form', async () => {
    const controller = new RemoteAuthController({
      remoteAuth: {
        status: () => Promise.reject('service down'),
        pair: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: { code: 'c', loginUrl: 'u' } } }),
        revoke: () => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value: {} } }),
      },
    } as unknown as Pick<IApiClient, 'remoteAuth'>)

    await controller.load()

    expect(controller.store.getSnapshot().error).toBe('service down')
  })
})

describe('messageOf', () => {
  it('keeps an Error message and stringifies anything else', () => {
    expect(messageOf(new Error('boom'))).toBe('boom')
    expect(messageOf('plain')).toBe('plain')
    expect(messageOf({ code: 1 })).toBe('[object Object]')
  })
})

describe('pairing', () => {
  it('mints a link and shows it', async () => {
    const { controller } = harness()
    await controller.load()

    const link = await controller.pair()

    expect(link).toEqual({
      code: 'abcd',
      loginUrl: 'https://tunnel.example.com:5953/__remote/pair?code=abcd',
    })
    expect(controller.store.getSnapshot().link?.loginUrl)
      .toBe('https://tunnel.example.com:5953/__remote/pair?code=abcd')
  })

  it('does not stack a second pair while one is in flight', async () => {
    const { controller, calls } = harness()
    await controller.load()
    const first = controller.pair()

    await controller.pair()
    await first

    expect(calls.filter(call => call === 'pair')).toHaveLength(1)
  })

  it('puts a pair refusal on the page and keeps no link', async () => {
    const { controller } = harness({ failPair: 'gate busy' })

    const link = await controller.pair()

    expect(link).toBeUndefined()
    expect(controller.store.getSnapshot().link).toBeNull()
    expect(controller.store.getSnapshot().error).toBe('gate busy')
  })

  it('folds a dead transport into the pair error', async () => {
    const { controller } = harness({ throwPair: true })

    await controller.pair()

    expect(controller.store.getSnapshot().error).toContain('socket closed')
  })

  it('dismisses the link without revoking', async () => {
    const { controller } = harness()
    await controller.pair()

    controller.dismissLink()

    expect(controller.store.getSnapshot().link).toBeNull()
    expect(controller.store.getSnapshot().paired).toBe(false)
  })
})

describe('revoking', () => {
  it('asks first, revokes, and re-reads status', async () => {
    const { controller, calls } = harness()
    await controller.load()

    controller.confirmRevoke(true)
    expect(controller.store.getSnapshot().confirmingRevoke).toBe(true)

    await controller.revoke()

    const state = controller.store.getSnapshot()
    expect(state.confirmingRevoke).toBe(false)
    expect(state.revoking).toBe(false)
    // status read in load + re-read after revoke.
    expect(calls).toEqual(['status', 'revoke', 'status'])
  })

  it('dismisses the confirmation without revoking', async () => {
    const { controller, calls } = harness()
    await controller.load()
    controller.confirmRevoke(true)

    controller.confirmRevoke(false)
    await controller.revoke()

    expect(calls.some(call => call === 'revoke')).toBe(false)
  })

  it('ignores the revoke while no confirmation is open', async () => {
    const { controller, calls } = harness()
    await controller.load()

    await controller.revoke()

    expect(calls.some(call => call === 'revoke')).toBe(false)
  })

  it('ignores a confirm while a revoke is already in flight', async () => {
    const { controller, calls } = harness()
    await controller.load()
    controller.confirmRevoke(true)
    const revoking = controller.revoke()

    // A second confirmation while the first flies is refused.
    controller.confirmRevoke(false)
    controller.confirmRevoke(true)

    await revoking

    expect(calls.filter(call => call === 'revoke')).toHaveLength(1)
  })

  it('surfaces a revoke refusal and closes the confirmation', async () => {
    const { controller } = harness({ failRevoke: 'no right' })
    await controller.load()
    controller.confirmRevoke(true)

    await controller.revoke()

    const state = controller.store.getSnapshot()
    expect(state.error).toBe('no right')
    expect(state.confirmingRevoke).toBe(false)
    expect(state.revoking).toBe(false)
  })

  it('folds a dead transport into the revoke error', async () => {
    const { controller } = harness({ throwRevoke: true })
    await controller.load()
    controller.confirmRevoke(true)

    await controller.revoke()

    expect(controller.store.getSnapshot().error).toContain('socket closed')
  })

  it('clears a shown link when a revoke lands', async () => {
    const { controller } = harness()
    await controller.load()
    await controller.pair()
    controller.confirmRevoke(true)

    await controller.revoke()

    expect(controller.store.getSnapshot().link).toBeNull()
  })
})

describe('initial snapshot', () => {
  it('starts idle and unpaired', () => {
    const { controller } = harness()

    const state: RemoteAuthState = controller.store.getSnapshot()
    expect(state.status).toBe('idle')
    expect(state.paired).toBe(false)
    expect(state.sessionTtlSeconds).toBe(0)
    expect(state.link).toBeNull()
    expect(state.confirmingRevoke).toBe(false)
  })
})

describe('custom session lifetime', () => {
  it('defaults the requested TTL to 24 hours', () => {
    const { controller } = harness()
    expect(controller.store.getSnapshot().pendingTtlSeconds).toBe(24 * 60 * 60)
  })

  it('sets a requested lifetime clamped to the server bounds', () => {
    const { controller } = harness()

    controller.setTtlSeconds(7200)
    expect(controller.store.getSnapshot().pendingTtlSeconds).toBe(7200)

    // Below the 1-minute floor clamps up.
    controller.setTtlSeconds(10)
    expect(controller.store.getSnapshot().pendingTtlSeconds).toBe(60)

    // Above the 30-day ceiling clamps down.
    controller.setTtlSeconds(99 * 24 * 60 * 60)
    expect(controller.store.getSnapshot().pendingTtlSeconds).toBe(30 * 24 * 60 * 60)
  })

  it('ignores a non-finite requested lifetime', () => {
    const { controller } = harness()
    const before = controller.store.getSnapshot().pendingTtlSeconds

    controller.setTtlSeconds(Number.NaN)

    expect(controller.store.getSnapshot().pendingTtlSeconds).toBe(before)
  })

  it('sends the chosen TTL when a pairing link is minted', async () => {
    const pairTtls: (number | undefined)[] = []
    const { controller } = harness({ pairTtls })
    controller.setTtlSeconds(3600)

    await controller.pair()

    expect(pairTtls).toEqual([3600])
  })
})

describe('custom tunnel address (内网穿透地址)', () => {
  it('starts with an empty tunnel address field', () => {
    const { controller } = harness()
    expect(controller.store.getSnapshot().tunnelAddress).toBe('')
  })

  it('seeds the field from the host-derived publicUrl on load', async () => {
    const { controller } = harness({ statusPublicUrl: 'https://tunnel.example.com:5953' })

    await controller.load()

    expect(controller.store.getSnapshot().tunnelAddress).toBe('https://tunnel.example.com:5953')
  })

  it('does not overwrite an operator-typed address on a later load', async () => {
    const { controller } = harness({ statusPublicUrl: 'https://tunnel.example.com:5953' })
    await controller.load()
    controller.setTunnelAddress('https://my-tunnel.example:9999')

    await controller.load()

    expect(controller.store.getSnapshot().tunnelAddress).toBe('https://my-tunnel.example:9999')
  })

  it('sets a custom address', () => {
    const { controller } = harness()
    controller.setTunnelAddress('https://my-tunnel.example:9999')
    expect(controller.store.getSnapshot().tunnelAddress).toBe('https://my-tunnel.example:9999')
  })

  it('omits publicUrl when the tunnel address is blank', async () => {
    const pairUrls: (string | undefined)[] = []
    const { controller } = harness({ pairUrls })

    await controller.pair()

    expect(pairUrls).toEqual([undefined])
  })

  it('sends the custom tunnel address when a pairing link is minted', async () => {
    const pairUrls: (string | undefined)[] = []
    const { controller } = harness({ pairUrls })
    controller.setTunnelAddress('https://my-tunnel.example:9999')

    await controller.pair()

    expect(pairUrls).toEqual(['https://my-tunnel.example:9999'])
  })
})
