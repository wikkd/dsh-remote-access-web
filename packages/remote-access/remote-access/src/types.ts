/**
 * @module @froststarinquire/dsh-remote-access/types
 *
 * The `ctx.remoteAccess` service contract: tunnel reachability state and a
 * lifecycle event stream. Type-only — carries no runtime code.
 * @packageDocumentation
 */

/** Tunnel reachability as reported to outside consumers. */
export interface TunnelStatus {
  /** `connecting` while a tunnel child is live; `down` when none is. */
  state: 'connecting' | 'down'
  /** True when the last restart was not the first attempt (i.e. the child has crashed before). */
  retrying?: boolean
  /** The configured public URL of the tunnel, surfaced as configured. */
  publicUrl?: string
}

/**
 * One tunnel lifecycle event body, broadcast on `ctx.remoteAccess.$on` and
 * re-emitted as a Cordis event for any listener.
 */
export type TunnelEvent =
  | { kind: 'tunnel'; status: 'connecting' }
  | { kind: 'tunnel'; status: 'down'; detail?: string }

/**
 * The Remote-access service. Declared on the context as `ctx.remoteAccess`.
 * Consumers read reachability and subscribe to lifecycle events; they do not
 * control the child directly (the owning plugin holds that).
 */
export interface RemoteAccess {
  /** Current tunnel reachability. */
  status(): TunnelStatus
  /**
   * The canonical `<host[:port]>` authority the configured public URL resolves
   * to, exactly the shape `dsh --profile web --trusted-host` accepts so the
   * `/api` browser-trust fence admits the tunnel. `undefined` when no public
   * URL is configured.
   */
  trustedAuthority(): string | undefined
  /** Subscribe to {@link TunnelEvent}s; returns the disposer. */
  on(listener: (event: TunnelEvent) => void): () => void
}
