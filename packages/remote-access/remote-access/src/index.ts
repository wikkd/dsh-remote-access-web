/**
 * @module @deepseek-ai/dsh-remote-access
 *
 * Remote-access host plugin (`ctx.remoteAccess`): manages an outbound
 * reverse-tunnel child process, keeps it alive with automatic restart, and
 * publishes the tunnel's reachability state.
 *
 * v1 scope is CONNECT ONLY — this plugin establishes and maintains a Sakura
 * Frp (a tunnel provider) tunnel from the harness machine to the provider's edge so
 * a remote device can reach the harness web service. It deliberately does NOT
 * add an authentication layer in front of the harness web service yet; that
 * is a later phase. Running this plugin with a live tunnel therefore exposes
 * the harness to the provider's public endpoint, so the plugin is inert
 * unless a real tunnel credential (`frpArgs`) is configured.
 *
 * The child is spawned through `ctx.subprocess` (the process half of the
 * shared execution world) with an explicit spec and a caller-owned keepalive
 * ladder, in the `dsh-shell` request/spec mold: no hidden defaults here.
 *
 * @packageDocumentation
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { RemoteAccess, TunnelEvent, TunnelStatus } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteAccess: RemoteAccess
  }
  interface Events {
    /**
     * A tunnel lifecycle event was broadcast (`connecting` when a child is up,
     * `down` when it ended or crashed); consumers may subscribe here or on the
     * service face.
     * @param event - the tunnel event body.
     * @mode emit
     */
    'remote-access/event'(event: TunnelEvent): void
  }
}

/**
 * Scheduling constants for the keepalive ladder. Protocol constants stay
 * fixed; deployment-varying values belong in Config.
 * @internal
 */
const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 60_000

/**
 * Tracks one tunnel child: its live handle, the current backoff, and whether
 * teardown has asked the keepalive loop to stop.
 * @internal
 */
class TunnelRunner {
  private handle: SubprocessHandle | undefined
  private backoff = INITIAL_BACKOFF_MS
  private stopped = false

  constructor(
    private readonly ctx: Context,
    private readonly spawnSpec: SubprocessSpawnSpec,
    private readonly emit: (event: TunnelEvent) => void,
  ) {}

  /** Spawn the child once; `done` resolves on close. */
  private async once(): Promise<void> {
    const handle = this.ctx.subprocess.spawn(this.spawnSpec)
    this.handle = handle
    this.emit({ kind: 'tunnel', status: 'connecting' })
    const outcome = await handle.done
    this.handle = undefined
    if (outcome.exitCode === 0) {
      // A clean zero exit (not a crash) is a deliberate stop signal for the
      // keepalive loop: the child ran and shut itself down, so do not restart.
      this.stopped = true
    }
  }

  /**
   * The keepalive loop: spawn, wait for exit, and on an abrupt crash restart
   * with exponential backoff capped at {@link MAX_BACKOFF_MS}. A manual stop
   * or a clean zero exit ends the loop.
   */
  async run(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.once()
      } catch (error) {
        this.handle = undefined
        this.emit({
          kind: 'tunnel',
          status: 'down',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() flips this flag while run() awaits
      if (this.stopped) return
      await delay(this.backoff)
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS)
    }
  }

  /** Gracefully stop the keepalive loop and terminate the child tree. */
  stop(): void {
    this.stopped = true
    const handle = this.handle
    this.handle = undefined
    // terminate may resolve synchronously (void) across handle variants, so
    // call without await; the child tree is owned by the subprocess layer.
    handle?.terminate()
  }

  /** Snapshot of current reachability for the public service. */
  status(): TunnelStatus {
    return this.handle
      ? { state: 'connecting', retrying: this.backoff > INITIAL_BACKOFF_MS }
      : { state: 'down' }
  }
}

/** Resolve after `ms`. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Parse a URL- or bare-authority string into a bare `<host>` or `<host:port>`
 * authority in canonical (WHATWG-normalized) form, matching the shape the
 * harness `/api` trust fence accepts via `--trusted-host`. Returns `undefined`
 * when the value does not resolve to a bare authority.
 *
 * The fence treats a port-less entry as "matches the hostname on any port", so
 * a public URL's explicit port is preserved. A path, query, scheme, or userinfo
 * is refused as a typo (the fence's `isTrustedApiRequest` compares Host
 * authority only, and such URL parts cannot reach the wire Host header).
 * @param value - the configured public URL or authority, verbatim.
 */
export function canonicalAuthorityFromPublicUrl(value: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(value.includes('//') ? value : `http://${value}`)
  } catch {
    return undefined
  }
  // http: is a WHATWG special scheme, so a successful parse yields a non-empty
  // host. A path, query, fragment, or userinfo means the value was never a bare
  // URL/authority to advertise to the fence.
  if (parsed.pathname !== '/' && parsed.pathname !== '') return undefined
  if (parsed.search !== '' || parsed.hash !== '') return undefined
  if (parsed.username !== '' || parsed.password !== '') return undefined
  const hostname = parsed.hostname.toLowerCase()
  const port = parsed.port
  return port === '' ? hostname : `${hostname}:${port}`
}

export interface Config {
  /** Tunnel provider. `none` keeps the plugin inert. */
  provider: 'none' | 'frp'
  /**
   * Absolute path to the frpc (or compatible) executable.
   * For Sakura Frp, download it from the control panel's Software page
   * (the link is generated per platform, no public static URL).
   */
  frpcPath?: string
  /**
   * Sakura Frp fast-start argument value passed to `-f`,
   * i.e. `<访问密钥>:<隧道ID>` (comma-joined for multiple tunnels).
   * This supersedes maintaining a local frp.ini — Sakura pulls it remotely.
   */
  frpArgs?: string
  /** Working directory for the tunnel child. */
  cwd?: string
  /** Grace period (ms) for terminate escalation on this child. */
  graceMs: number
  /** Public URL surfaced to the user once the tunnel is up. */
  publicUrl?: string
}

export const Config = {
  /** @internal */
  default: {
    provider: 'none',
    graceMs: 5000,
  } satisfies Partial<Config>,
}

class RemoteAccessService extends Service implements RemoteAccess {
  private runner: TunnelRunner | undefined
  private readonly listeners = new Set<(event: TunnelEvent) => void>()

  constructor(
    ctx: Context,
    private readonly config: Required<Pick<Config, 'provider'>> & Config,
  ) {
    super(ctx, 'remoteAccess')
  }

  /** Snapshot of current tunnel reachability. */
  status(): TunnelStatus {
    const status: TunnelStatus = this.runner?.status() ?? { state: 'down' }
    if (this.config.publicUrl !== undefined) status.publicUrl = this.config.publicUrl
    return status
  }

  /** Canonical fence authority derived from the configured public URL, if any. */
  trustedAuthority(): string | undefined {
    return this.config.publicUrl === undefined
      ? undefined
      : canonicalAuthorityFromPublicUrl(this.config.publicUrl)
  }

  /** Subscribe to tunnel lifecycle events; returns the disposer. */
  on(listener: (event: TunnelEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** @internal startup: build the spawn spec and start the keepalive loop. */
  start(): void {
    if (this.config.provider === 'none') return
    // A configured public URL that cannot yield a bare authority could never
    // be passed to `--trusted-host`, so it would silently leave the tunnel
    // orphaned behind the /api trust fence. Fail the surfaced value loudly.
    if (this.config.publicUrl !== undefined
      && canonicalAuthorityFromPublicUrl(this.config.publicUrl) === undefined) {
      throw new Error(
        `remote-access: publicUrl ${JSON.stringify(this.config.publicUrl)} does not resolve to a `
        + 'bare host[:port] authority that dsh --profile web --trusted-host accepts',
      )
    }
    this.runner = new TunnelRunner(this.ctx, this.buildSpawnSpec(), (event) => {
      for (const listener of this.listeners) listener(event)
      this.ctx.emit('remote-access/event', event)
    })
    void this.runner.run()
  }

  /** @internal teardown: stop the child and its loop. */
  stop(): void {
    this.runner?.stop()
    this.runner = undefined
    this.listeners.clear()
  }

  private buildSpawnSpec(): SubprocessSpawnSpec {
    const frpcPath = this.config.frpcPath
    const frpArgs = this.config.frpArgs
    if (this.config.provider === 'frp' && (!frpcPath || !frpArgs)) {
      throw new Error(
        'remote-access: provider is "frp" but frpcPath/frpArgs are not configured; refusing to activate',
      )
    }
    return {
      argv: [frpcPath as string, '-f', frpArgs as string],
      cwd: this.config.cwd ?? process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 256 * 1024 },
        stderr: { maxBytes: 256 * 1024 },
      },
      graceMs: this.config.graceMs,
    }
  }
}

export const name = 'remote-access'
export const inject = ['subprocess'] as const

export function apply(ctx: Context, config: Config) {
  config = { ...Config.default, ...config }
  const service = new RemoteAccessService(ctx, config)
  service.start()
  // Stop the tunnel loop and child through the effect disposer so teardown
  // rides the owning fiber's lifecycle (Cordis calls it on fiber disposal),
  // matching the repo's "registrations are effects" convention.
  ctx.effect(() => () => { service.stop() }, 'remote-access: tunnel teardown')
}

export default { name, inject, Config, apply }
