/**
 * @module @deepseek-ai/dsh-remote-auth
 *
 * Remote-access authentication host plugin (`ctx.remoteAuth`): a seed token plus
 * a one-time device-pairing flow that issues a short-lived session cookie, and
 * the request-time verdict the `/api` gate consults before admitting a
 * non-loopback client.
 *
 * The harness `/api` browser-trust fence (`dsh-client-connection`) is a
 * DNS-rebinding / cross-site defense, explicitly not authentication: it asks
 * only "is this Host one of ours", never "is this caller you". A phone reached
 * through a public tunnel therefore passes the fence once `--trusted-host`
 * whitelists the tunnel authority, yet still grants the whole surface —
 * including sessions, bash, settings, and credentials — to anyone who can
 * address that authority. This plugin closes that gap: it signs an
 * unguessable seed token at boot, exchanges it on first visit for an
 * `HttpOnly; SameSite=Lax` session cookie through a one-time pairing code, and
 * hands `verify()` to the gate so every uncookied non-loopback request answers
 * 401.
 *
 * Loopback is never forced through authentication: local `dsh web` use stays
 * unchanged. The gate, not this plugin, decides which requests reach
 * {@link RemoteAuth.verify}; this plugin only answers the verdict.
 *
 * @packageDocumentation
 */

import z from '@deepseek-ai/schemastery'
import { Context, Service } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { RemoteAuth, AuthStatus, AuthVerdict } from './types.ts'
import {
  constantTimeEqual,
  derivePairingCode,
  generateSeed,
  generateSessionToken,
} from './token.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteAuth: RemoteAuth
  }
}

/** Cookie name carrying the issued session token. */
const SESSION_COOKIE = 'dsh_remote_session'

/** Route paths for the pairing surfaces. */
const PAIR_PATH = '/__remote/pair'
const LOGIN_PATH = '/__remote/login'
const LOGOUT_PATH = '/__remote/logout'

/**
 * Default nominal session lifetime in milliseconds (24 hours). Deployment
 * tunables belong in Config; this is the sane default behind `sessionTtlMs`.
 * @internal
 */
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Bounds applied to a per-pairing requested session lifetime. The web surface
 * lets a caller pick a custom duration; the deployment clamps it here so a
 * request cannot mint a never-expiring (or sub-minute) session. 1 minute to
 * 30 days.
 * @internal
 */
const MIN_SESSION_TTL_MS = 60 * 1000
const MAX_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Plugin config: the deployment's authentication surface. */
export interface Config {
  /**
   * Absolute path to the seed-token file; when omitted the seed lives at
   * `<harness home>/remote-auth.seed`. The file is created owner-only (0600).
   */
  seedPath?: string
  /** Harness home used when `seedPath` is omitted (defaults to `~/.dsh`). */
  dshHome?: string
  /**
   * Whether authentication is enforced. When false the plugin still registers
   * its routes but {@link RemoteAuth.verify} authorizes everything, matching
   * the pre-authentication behavior. Defaults to false so mounts are inert
   * until a deployment opts in.
   */
  enabled?: boolean
  /** Session lifetime in milliseconds; defaults to 24 hours. */
  sessionTtlMs?: number
  /**
   * The deployment's public origin (`scheme://host[:port]`, e.g.
   * `https://tunnel.example.com:5953`) that a remote device reaches the harness
   * through. Used to build the pairing login URL the settings page hands a
   * phone. When omitted, the login URL falls back to the request origin if
   * provided, else `https://localhost`.
   */
  publicUrl?: string
}

export const Config: z<Config> = z.object({
  seedPath: z.string(),
  dshHome: z.string(),
  enabled: z.boolean().default(false),
  sessionTtlMs: z.natural().min(1).default(DEFAULT_SESSION_TTL_MS),
  publicUrl: z.string(),
})

/** One issued session: its token, expiry, and the paired device fingerprint. */
interface Session {
  token: string
  expiresAt: number
}

/** The request facts {@link RemoteAuthService.verify} reads. */
type VerifyRequest = { headers: Readonly<Record<string, string | undefined>> }

/** Config with every field the service reads resolved to a concrete value. */
type ResolvedConfig = Required<Pick<Config, 'enabled' | 'sessionTtlMs'>> & Config

export type { ResolvedConfig }

class RemoteAuthService extends Service implements RemoteAuth {
  /** The current seed token, replaced only by {@link loadSeed} or rotation. */
  private seed: string
  /**
   * The sole one-time pairing code currently outstanding, or `undefined` when
   * none has been minted. Consumed (cleared) by a successful pair.
   */
  private pairingCode: string | undefined
  /** The pairing nonce that derives the current {@link pairingCode}. */
  private pairingNonce: string | undefined
  /**
   * The session lifetime (in ms) captured when the current pairing code was
   * minted, applied to the session issued on redemption; falls back to the
   * configured default when no custom duration was requested.
   */
  private pairingTtlMs = DEFAULT_SESSION_TTL_MS
  /** Issued sessions keyed by token; a token may appear at most once. */
  private readonly sessions = new Map<string, Session>()
  /** The paired device fingerprint, or undefined before the first pair. */
  private pairedDevice: string | undefined

  constructor(
    ctx: Context,
    private readonly config: ResolvedConfig,
    private readonly seedFilePath: string,
  ) {
    super(ctx, 'remoteAuth')
    this.seed = generateSeed()
  }

  /** Expose the seed file path for logs and tests. */
  get seedFile(): string {
    return this.seedFilePath
  }

  /**
   * Begin the pairing flow: mint a one-time code and capture the requested
   * session lifetime for the session issued on redemption.
   * @param requestedTtlSeconds - optional requested session lifetime (seconds),
   *   clamped to the deployment bounds; falls back to the configured default
   *   when omitted.
   */
  pair(requestedTtlSeconds?: number): string {
    // A fresh nonce per mint means a replaced seed or a re-pair never reuses
    // the previous code, and the code is single-use by construction below.
    this.pairingNonce = generateSessionToken()
    this.pairingCode = derivePairingCode(this.seed, this.pairingNonce)
    // A caller-requested duration is clamped to the deployment bounds; the
    // configured default passes through as configured (the deployment owns it).
    this.pairingTtlMs = requestedTtlSeconds === undefined || !Number.isFinite(requestedTtlSeconds)
      ? this.config.sessionTtlMs
      : Math.min(MAX_SESSION_TTL_MS, Math.max(MIN_SESSION_TTL_MS, Math.round(requestedTtlSeconds * 1000)))
    return this.pairingCode
  }

  /**
   * Build the absolute login URL that carries a pairing code, in one tap.
   * An explicitly supplied origin (for example a user-provided tunnel
   * address) wins over the configured `publicUrl`; both fall back to
   * `https://localhost`. A bare origin missing a scheme is treated as `https`.
   * @param code - the one-time pairing code.
   * @param origin - optional explicit public origin (`scheme://host[:port]`,
   *   or a bare `host[:port]`), preferred when supplied.
   */
  loginUrl(code: string, origin?: string): string {
    const chosen = origin ?? this.config.publicUrl ?? 'https://localhost'
    const withScheme = /^https?:\/\//i.test(chosen.trim()) ? chosen.trim() : `https://${chosen.trim()}`
    const base = withScheme.replace(/\/+$/, '')
    return `${base}${PAIR_PATH}?code=${encodeURIComponent(code)}`
  }

  /**
   * Consume a submitted pairing code. On a correct code issue a session for
   * the device; a wrong code is refused and the code stays outstanding so the
   * same one can be retried (rate-limiting is the gate's concern).
   * @param code - the submitted one-time code.
   * @param device - the caller's device fingerprint.
   * @returns the issued session token, or undefined when the code does not match.
   */
  redeem(code: string, device: string): string | undefined {
    if (!this.config.enabled) return undefined
    if (this.pairingCode === undefined) return undefined
    if (!constantTimeEqual(code, this.pairingCode)) return undefined
    // A successful pair supersedes any earlier pairing; consume this code.
    this.pairingCode = undefined
    this.pairingNonce = undefined
    this.pairedDevice = device
    this.sessions.clear() // one active remote device: pairing replaces the prior session
    const token = generateSessionToken()
    this.sessions.set(token, {
      token,
      expiresAt: Date.now() + this.pairingTtlMs,
    })
    return token
  }

  /** Drop any expired session tokens (called lazily before each verdict). */
  private reap(): void {
    const now = Date.now()
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token)
    }
  }

  /** Extract the session token from a Cookie header, or undefined. */
  private sessionFromCookie(headers: VerifyRequest['headers']): string | undefined {
    const cookie = headers.cookie
    if (cookie === undefined) return undefined
    const needle = `${SESSION_COOKIE}=`
    for (const part of cookie.split(';')) {
      const trimmed = part.trim()
      if (trimmed.startsWith(needle)) {
        const value = trimmed.slice(needle.length)
        return value.length === 0 ? undefined : value
      }
    }
    return undefined
  }

  /** Classify a host header as loopback (matching the `/api` fence's rule). */
  private isLoopback(host: string): boolean {
    const hostname = host.includes(':') ? host.slice(0, host.lastIndexOf(':')) : host
    // Strip IPv6 brackets before comparing, mirroring the fence's normalization.
    const bare = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
    if (bare === 'localhost' || bare === '::1') return true
    const parts = bare.split('.')
    return parts.length === 4
      && parts[0] === '127'
      && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  }

  verify(request: VerifyRequest): AuthVerdict {
    const host = request.headers.host
    const loopback = host !== undefined && this.isLoopback(host)
    if (loopback || !this.config.enabled) return { outcome: 'authorized', loopback }
    this.reap()
    const token = this.sessionFromCookie(request.headers)
    if (token === undefined) return { outcome: 'unauthenticated', loopback: false }
    const session = this.sessions.get(token)
    if (session === undefined || session.expiresAt <= Date.now()) {
      return { outcome: 'unauthenticated', loopback: false }
    }
    // The session's own device field is the binding: `redeem` sets
    // `pairedDevice` and the session's device in one step, and `revoke` or a
    // re-pair clears the session map atomically, so a token that is present
    // and unexpired is by construction the paired device's session.
    return { outcome: 'authorized', loopback: false }
  }

  status(): AuthStatus {
    this.reap()
    // Report the actual remaining lifetime of the live session (which may carry
    // a per-pairing custom TTL), not the deployment default.
    let remainingSeconds = 0
    for (const session of this.sessions.values()) {
      remainingSeconds = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000))
      break // a single active remote device: at most one live session
    }
    const publicUrl = this.config.publicUrl
    return {
      paired: this.pairedDevice !== undefined && this.sessions.size > 0,
      sessionTtlSeconds: remainingSeconds,
      ...publicUrl === undefined ? {} : { publicUrl },
    }
  }

  revoke(): void {
    this.sessions.clear()
    this.pairedDevice = undefined
    this.pairingCode = undefined
    this.pairingNonce = undefined
    this.pairingTtlMs = DEFAULT_SESSION_TTL_MS
  }

  /** Load an existing seed from disk; returns true when one was read. */
  async loadSeed(): Promise<boolean> {
    const { readFile } = await import('node:fs/promises')
    try {
      const text = await readFile(this.seedFilePath, 'utf8')
      const seed = text.trim()
      if (seed.length === 0) return false
      this.seed = seed
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  /** Persist the current seed (called by the plugin at boot, owner-only). */
  async persistSeed(): Promise<void> {
    await writeFileAtomic(this.seedFilePath, `${this.seed}\n`, { mode: 0o600, dirMode: 0o700 })
  }

  /**
   * Register the pairing routes and return one disposer removing all three.
   * The plugin hands the disposer to `ctx.effect`, so route teardown rides the
   * owning fiber.
   */
  registerRoutes(): () => void {
    const disposers = [
      this.ctx.webServer.register({ kind: 'exact', path: PAIR_PATH, handler: this.pairHandler }),
      this.ctx.webServer.register({ kind: 'exact', path: LOGIN_PATH, handler: this.pairHandler }),
      this.ctx.webServer.register({ kind: 'exact', path: LOGOUT_PATH, handler: this.logoutHandler }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }

  private pairHandler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://x')
    const code = url.searchParams.get('code')
    const deviceHeader = req.headers['sec-ch-ua-platform'] ?? req.headers['user-agent'] ?? 'unknown'
    const deviceString = Array.isArray(deviceHeader) ? deviceHeader.join(',') : String(deviceHeader)
    if (code === null) {
      // Show a minimal login form prompting for a code.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(loginHtml())
      return
    }
    const token = this.redeem(code, deviceString)
    if (token === undefined) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('配对码无效或已失效')
      return
    }
    const maxAge = Math.floor(this.config.sessionTtlMs / 1000)
    const cookie = [
      `${SESSION_COOKIE}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${String(maxAge)}`,
    ].join('; ')
    res.writeHead(302, {
      location: '/',
      'set-cookie': cookie,
    })
    res.end()
  }

  private logoutHandler = (_req: IncomingMessage, res: ServerResponse): void => {
    const cookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    res.writeHead(302, {
      location: '/',
      'set-cookie': cookie,
    })
    res.end()
  }
}

export { RemoteAuthService }

/** Minimal login form (product copy is Chinese, matching the web surface). */
function loginHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>远程访问配对</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:26rem;margin:0 auto">
<h1>配对远程访问</h1>
<p>在电脑端查看一次性配对码，输入后进入。</p>
<form action="${PAIR_PATH}" method="get">
<input name="code" autocomplete="off" placeholder="配对码" style="font-size:1.1rem;padding:.5rem;width:100%">
<button type="submit" style="margin-top:.75rem;font-size:1.1rem;padding:.5rem 1rem">进入</button>
</form>
</body></html>`
}

export const name = 'remote-auth'
export const inject = ['webServer'] as const

/** Structural face of the optional `webRuntime` service a web deployment provides. */
interface WebRuntimeLike {
  trustedHosts?: readonly string[]
}

export function apply(ctx: Context, config: Config): void {
  // One explicit default step: coalesce the two optional fields to concrete
  // values here — the owning implementation's `resolve` — so the service never
  // re-defaults a hidden `?? value` inside any method. A hand-built context
  // (tests) may pass them as `undefined`, which `?? ` folds back to the default.
  const enabled = config.enabled ?? false
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
  // When no publicUrl is configured, derive it from the deployment's trusted
  // authorities (the invocation `--trusted-host`s, which the web runtime
  // appends after LAN IP literals) so the pairing link targets the public
  // tunnel rather than a LAN address.
  const publicUrl = config.publicUrl ?? publicUrlFromRuntime(ctx.get('webRuntime') as WebRuntimeLike | undefined)
  config = { ...config, enabled, sessionTtlMs, ...publicUrl === undefined ? {} : { publicUrl } }
  const seedFilePath = config.seedPath ?? resolveDshHome(config.dshHome) + '/remote-auth.seed'
  const resolved: ResolvedConfig = {
    ...config,
    enabled,
    sessionTtlMs,
  }
  const service = new RemoteAuthService(ctx, resolved, seedFilePath)

  // Seed persistence is the boot effect: load-or-generate must settle before
  // any pairing code refers to a seed that isn't durable. The effect body
  // returns a no-op disposer — there is nothing to undo once the seed read
  // settles, but the fire-and-forget must still ride the owning fiber.
  ctx.effect(() => {
    void (async () => {
      const loaded = await service.loadSeed()
      if (!loaded) await service.persistSeed()
      if (resolved.enabled) {
        ctx.logger.info('remote-auth: pairing page at %s', service.seedFile)
      }
    })().catch((error: unknown) => {
      ctx.logger.error(
        'remote-auth: seed bootstrap failed: %s',
        /* v8 ignore next -- loadSeed/persistSeed only reject with Error instances; the non-Error arm keeps the log surface total */
        error instanceof Error ? error.message : String(error),
      )
    })
    return () => {}
  }, 'remote-auth: seed load-or-generate')

  ctx.effect(() => service.registerRoutes(), 'remote-auth: pairing routes')

  // The service registers itself as `remoteAuth` through its `Service` base
  // class (`super(ctx, 'remoteAuth')`); no explicit `ctx.provide` is needed nor
  // permitted (a second registration would collide).
  ctx.effect(() => () => {
    service.revoke()
  }, 'remote-auth: teardown')
}

/**
 * Derive a public origin from the deployment's trusted authorities, used to
 * build the pairing login URL. The last authority is the invocation
 * `--trusted-host`s (LAN IP literals are appended first), so the link targets
 * the public tunnel. Returns undefined when no authority is available.
 * @param runtime - the optional `webRuntime` service, or undefined outside the web bundle.
 */
export function publicUrlFromRuntime(runtime: WebRuntimeLike | undefined): string | undefined {
  const hosts = runtime?.trustedHosts
  if (hosts === undefined || hosts.length === 0) return undefined
  return `https://${hosts[hosts.length - 1]}`
}

export default { name, inject, Config, apply }
