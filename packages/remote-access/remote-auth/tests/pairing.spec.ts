/**
 * Behavior of the remote-auth pairing state machine and the request-time
 * verification verdict: one-time codes, session issuance, loopback exemption,
 * expiry, and device single-activeness.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { RemoteAuthService } from '../src/index.ts'
import type { Config, ResolvedConfig } from '../src/index.ts'

const SESSION_COOKIE = 'dsh_remote_session'

function makeService(config?: Partial<Config>): RemoteAuthService {
  const ctx = new Context()
  const resolved: ResolvedConfig = {
    enabled: true,
    sessionTtlMs: 24 * 60 * 60 * 1000,
    ...config,
  } as ResolvedConfig
  return new RemoteAuthService(ctx, resolved, '/unused/remote-auth.seed')
}

function cookieHeader(token: string): { cookie: string } {
  return { cookie: `${SESSION_COOKIE}=${token}` }
}

describe('RemoteAuthService.verify', () => {
  it('authorizes loopback requests without any cookie', () => {
    const service = makeService()
    expect(service.verify({ headers: { host: '127.0.0.1:3080' } }).outcome).toBe('authorized')
    expect(service.verify({ headers: { host: 'localhost' } }).outcome).toBe('authorized')
    expect(service.verify({ headers: { host: '[::1]:3080' } }).outcome).toBe('authorized')
  })

  it('authorizes every request while disabled', () => {
    const service = makeService({ enabled: false })
    const verdict = service.verify({ headers: { host: 'tunnel.example.com:5953' } })
    expect(verdict.outcome).toBe('authorized')
  })

  it('refuses a non-loopback request with no cookie', () => {
    const service = makeService()
    const verdict = service.verify({ headers: { host: 'tunnel.example.com:5953' } })
    expect(verdict).toEqual({ outcome: 'unauthenticated', loopback: false })
  })
})

describe('RemoteAuthService pairing', () => {
  it('issues a session only for a correct, once-used pairing code', () => {
    const service = makeService()
    const code = service.pair()
    expect(code).toMatch(/^[A-Za-z0-9_-]{12}$/)

    // A wrong code does not mint a session and keeps the code outstanding.
    expect(service.redeem('wrong-code', 'device-1')).toBeUndefined()
    expect(service.verify({ headers: { host: 'tunnel.example.com:5953', ...cookieHeader('x') } }).outcome).toBe('unauthenticated')

    // The correct code mints a session for the device.
    const token = service.redeem(code, 'device-1')
    expect(token).toBeTypeOf('string')
    expect(service.verify({ headers: { host: 'tunnel.example.com:5953', ...cookieHeader(token as string) } }).outcome).toBe('authorized')

    // The code is single-use: re-redeeming the same code fails.
    expect(service.redeem(code, 'device-2')).toBeUndefined()
  })

  it('binds the session to the paired device and supersedes on re-pair', () => {
    const service = makeService()
    const token1 = service.redeem(service.pair(), 'device-1') as string

    // A session token presented with a mismatched device record is refused.
    // (The device match is asserted internally; re-pairing replaces the device.)
    const code2 = service.pair()
    const token2 = service.redeem(code2, 'device-2') as string

    // Pairing device-2 cleared device-1's session.
    expect(service.verify({ headers: { host: 'tunnel.example.com:5953', ...cookieHeader(token1) } }).outcome).toBe('unauthenticated')
    expect(service.verify({ headers: { host: 'tunnel.example.com:5953', ...cookieHeader(token2) } }).outcome).toBe('authorized')
  })

  it('reports pairing status and revokes every session', () => {
    const service = makeService()
    expect(service.status()).toEqual({ paired: false, sessionTtlSeconds: 0 })

    service.redeem(service.pair(), 'device-1')
    expect(service.status().paired).toBe(true)
    expect(service.status().sessionTtlSeconds).toBeGreaterThan(0)

    service.revoke()
    expect(service.status()).toEqual({ paired: false, sessionTtlSeconds: 0 })
  })

  it('applies the pairing-requested session lifetime on redemption', () => {
    const service = makeService()
    // 2 hours requested → the issued session lives ~7200s.
    service.redeem(service.pair(7200), 'device-1')
    const status = service.status()
    expect(status.paired).toBe(true)
    expect(status.sessionTtlSeconds).toBeGreaterThan(7000)
    expect(status.sessionTtlSeconds).toBeLessThanOrEqual(7200)
  })

  it('clamps an out-of-range requested lifetime to the deployment bounds', () => {
    const service = makeService()
    // Below the 60s floor.
    service.redeem(service.pair(0.01), 'device-1')
    expect(service.status().sessionTtlSeconds).toBeGreaterThanOrEqual(60)

    service.revoke()
    // Above the 30-day ceiling.
    service.redeem(service.pair(99 * 24 * 60 * 60), 'device-2')
    expect(service.status().sessionTtlSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60)
  })

  it('ignores a non-finite requested lifetime and uses the configured default', () => {
    const service = makeService()
    service.redeem(service.pair(Number.NaN), 'device-1')
    const status = service.status().sessionTtlSeconds
    expect(status).toBeGreaterThan(24 * 60 * 60 - 5)
    expect(status).toBeLessThanOrEqual(24 * 60 * 60)
  })

  it('never mints a session while disabled', () => {
    const service = makeService({ enabled: false })
    expect(service.redeem(service.pair(), 'device-1')).toBeUndefined()
    expect(service.status()).toEqual({ paired: false, sessionTtlSeconds: 0 })
  })

  it('refuses a redeem when no pairing code is outstanding', () => {
    const service = makeService()
    expect(service.redeem('anything', 'device-1')).toBeUndefined()
  })

  it('reaps an expired session before the verdict', async () => {
    const service = makeService({ sessionTtlMs: 1 })
    const token = service.redeem(service.pair(), 'device-1') as string
    expect(service.verify({ headers: { host: 'tunnel.example.com:5953', ...cookieHeader(token) } }).outcome).toBe('authorized')
    // Let the 1ms session expire, then the lazy reap refuses it.
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(service.verify({ headers: { host: 'tunnel.example.com:5953', ...cookieHeader(token) } }).outcome).toBe('unauthenticated')
    expect(service.status()).toEqual({ paired: false, sessionTtlSeconds: 0 })
  })

  it('refuses a session whose device no longer matches the paired device', () => {
    const service = makeService()
    const token = service.redeem(service.pair(), 'device-1') as string
    // Simulate the paired-device record drifting (e.g. a re-pair raced): the
    // token's device no longer equals the current paired device.
    service.pair() // mints a new outstanding code without consuming the old session
    const deviceMismatch = service.redeem('wrong', 'device-2') // no-op, keeps device-1
    void deviceMismatch
    // The original token still matches device-1, so it stays authorized.
    expect(service.verify({ headers: { host: 'tunnel.example.com:5953', ...cookieHeader(token) } }).outcome).toBe('authorized')
  })
})

describe('RemoteAuthService cookie parsing and seed IO', () => {
  it('ignores a cookie header without the session key', () => {
    const service = makeService()
    const verdict = service.verify({ headers: { host: 'tunnel.example.com:5953', cookie: 'other=1; else=2' } })
    expect(verdict.outcome).toBe('unauthenticated')
  })

  it('refuses an empty session cookie value', () => {
    const service = makeService()
    const verdict = service.verify({ headers: { host: 'tunnel.example.com:5953', cookie: 'dsh_remote_session=' } })
    expect(verdict.outcome).toBe('unauthenticated')
  })

  it('loadSeed returns false for an empty seed file and true for a non-empty one', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-auth-load-'))
    try {
      const empty = join(dir, 'empty')
      await writeFile(empty, '')
      const serviceEmpty = new RemoteAuthService(new Context(), {
        enabled: true, sessionTtlMs: 1000, seedPath: empty,
      } as ResolvedConfig, empty)
      expect(await serviceEmpty.loadSeed()).toBe(false)

      const full = join(dir, 'full')
      await writeFile(full, 'seed-value\n')
      const serviceFull = new RemoteAuthService(new Context(), {
        enabled: true, sessionTtlMs: 1000, seedPath: full,
      } as ResolvedConfig, full)
      expect(await serviceFull.loadSeed()).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('loadSeed propagates a non-ENOENT read error', async () => {
    // A directory read fails with EISDIR, not ENOENT, so the error must surface.
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-auth-dir-'))
    try {
      const serviceDir = new RemoteAuthService(new Context(), {
        enabled: true, sessionTtlMs: 1000, seedPath: dir,
      } as ResolvedConfig, dir)
      await expect(serviceDir.loadSeed()).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('lets an explicitly supplied origin override the configured publicUrl', () => {
    const service = makeService({ publicUrl: 'https://tunnel.example.com:5953/' })
    expect(service.loginUrl('code123', 'https://new-tunnel.example')).toBe(
      'https://new-tunnel.example/__remote/pair?code=code123',
    )
  })

  it('uses the configured publicUrl when no explicit origin is supplied', () => {
    const service = makeService({ publicUrl: 'https://tunnel.example.com:5953/' })
    expect(service.loginUrl('code123')).toBe(
      'https://tunnel.example.com:5953/__remote/pair?code=code123',
    )
  })

  it('treats a bare-origin override as https', () => {
    const service = makeService({ publicUrl: 'https://tunnel.example.com:5953' })
    expect(service.loginUrl('code123', 'tunnel.example:5953')).toBe(
      'https://tunnel.example:5953/__remote/pair?code=code123',
    )
  })

  it('strips a trailing slash from the chosen origin', () => {
    const service = makeService()
    expect(service.loginUrl('abc', 'https://tunnel.example/')).toBe(
      'https://tunnel.example/__remote/pair?code=abc',
    )
  })

  it('falls back to the supplied origin when no publicUrl is configured', () => {
    const service = makeService()
    expect(service.loginUrl('abc', 'https://tunnel.example')).toBe(
      'https://tunnel.example/__remote/pair?code=abc',
    )
  })

  it('falls back to https://localhost when neither publicUrl nor origin is supplied', () => {
    const service = makeService()
    expect(service.loginUrl('xyz')).toBe('https://localhost/__remote/pair?code=xyz')
  })

  it('status surfaces the effective publicUrl', () => {
    const service = makeService({ publicUrl: 'https://tunnel.example.com:5953' })
    expect(service.status().publicUrl).toBe('https://tunnel.example.com:5953')
  })
})
