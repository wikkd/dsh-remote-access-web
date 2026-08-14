/**
 * Remote-access controller: the one page that reads pairing/session status,
 * mints a pairing link, and revokes every session. The host is the single
 * fact source — every mutation writes through the `remoteAuth` wire domain
 * and the page re-reads status afterwards, because revoking changes more than
 * the button that asked for it.
 */

import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The host's snapshot of pairing and session state. */
export interface RemoteAuthStatusView {
  /** Whether a device is currently paired with a live session. */
  paired: boolean
  /** Nominal remaining session lifetime in seconds (0 when none paired). */
  sessionTtlSeconds: number
  /** The effective public origin pairing login URLs use, when one is derived. */
  publicUrl?: string
}

/** The freshly minted pairing code and the login URL a phone opens. */
export interface RemoteAuthPairView {
  /** One-time pairing code (single-use). */
  code: string
  /** Absolute login URL carrying the code. */
  loginUrl: string
}

/** Server-side bounds on a requested session lifetime, in seconds. */
export const MIN_TTL_SECONDS = 60
export const MAX_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Human text for a rejected wire call. A transport failure rejects with an
 * Error; a host or a runtime can reject with anything, and the page still has
 * to say something.
 * @param error - the rejection value.
 * @returns the message to show.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Page snapshot. */
export interface RemoteAuthState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-load failure text; cleared by the next read. */
  error: string | null
  /** Pairing/session state the host reported, absent before first read. */
  paired: boolean
  /** Remaining session lifetime in seconds; 0 when no device is paired. */
  sessionTtlSeconds: number
  /**
   * The requested session lifetime (seconds) the next generated pairing link
   * applies to the session it issues. Defaults to 24 hours; clamped to
   * {@link MIN_TTL_SECONDS}–{@link MAX_TTL_SECONDS} before sending.
   */
  pendingTtlSeconds: number
  /**
   * The user-provided 内网穿透地址 (public origin) the next pairing link targets,
   * or `''` to fall back to the host-derived address. Seeded from the host's
   * effective `publicUrl` on load.
   */
  tunnelAddress: string
  /** The freshly minted link awaiting a phone, or null while none is offered. */
  link: RemoteAuthPairView | null
  /** Whether a pairing link is being minted. */
  pairing: boolean
  /** Whether a revoke is in flight. */
  revoking: boolean
  /** Set while the revoke confirmation is open. */
  confirmingRevoke: boolean
}

const INITIAL: RemoteAuthState = {
  status: 'idle',
  error: null,
  paired: false,
  sessionTtlSeconds: 0,
  pendingTtlSeconds: 24 * 60 * 60,
  tunnelAddress: '',
  link: null,
  pairing: false,
  revoking: false,
  confirmingRevoke: false,
}

/** Reads and mutates the remote-access authentication state. */
export class RemoteAuthController {
  /** Page snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<RemoteAuthState> = createSnapshotStore(INITIAL)

  constructor(private readonly api: Pick<IApiClient, 'remoteAuth'>) {}

  private set(patch: Partial<RemoteAuthState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /**
   * Load pairing/session status. A read already in flight is not stacked.
   * @returns once the snapshot reflects the host.
   */
  async load(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status === 'loading') return
    this.set({ status: 'loading', error: null })
    let response
    try {
      response = await this.api.remoteAuth.status({})
    } catch (error) {
      this.set({ status: 'error', error: messageOf(error) })
      return
    }
    if (!response.result.ok) {
      this.set({ status: 'error', error: response.result.error.message })
      return
    }
    this.set({
      status: 'ready',
      error: null,
      paired: response.result.value.paired,
      sessionTtlSeconds: response.result.value.sessionTtlSeconds,
      // Seed the 内网穿透地址 field from the host's effective origin, unless
      // the operator already typed their own value.
      ...response.result.value.publicUrl !== undefined && this.store.getSnapshot().tunnelAddress.length === 0
        ? { tunnelAddress: response.result.value.publicUrl }
        : {},
    })
  }

  /**
   * Mint a one-time pairing code and show its login URL. The currently chosen
   * {@link RemoteAuthState.pendingTtlSeconds} applies to the session issued on
   * redemption. Minting replaces any outstanding link: a code is single-use
   * and superseded by the next.
   * @returns the minted link, or undefined when the mint failed (failure lands
   *   on the page error so the caller need not branch).
   */
  async pair(): Promise<RemoteAuthPairView | undefined> {
    const before = this.store.getSnapshot()
    if (before.pairing) return undefined
    this.set({ pairing: true, error: null })
    let response
    try {
      const tunnel = before.tunnelAddress.trim()
      response = await this.api.remoteAuth.pair({
        ttlSeconds: before.pendingTtlSeconds,
        ...tunnel.length > 0 ? { publicUrl: tunnel } : {},
      })
    } catch (error) {
      this.set({ pairing: false, error: messageOf(error) })
      return undefined
    }
    if (!response.result.ok) {
      this.set({ pairing: false, error: response.result.error.message })
      return undefined
    }
    this.set({ pairing: false, link: response.result.value })
    return response.result.value
  }

  /**
   * Set the requested session lifetime for the next generated pairing link,
   * clamped to the server-side bounds so the field never sends out-of-range
   * values.
   * @param seconds - the desired session lifetime in seconds.
   */
  setTtlSeconds(seconds: number): void {
    if (!Number.isFinite(seconds)) return
    const clamped = Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.round(seconds)))
    this.set({ pendingTtlSeconds: clamped })
  }

  /**
   * Set the user-provided 内网穿透地址 used for the next generated pairing
   * link. A trailing slash is normalized at send time; an empty value falls
   * back to the host-derived origin.
   * @param address - the public tunnel origin, e.g. `https://tunnel.example.com:5953`.
   */
  setTunnelAddress(address: string): void {
    this.set({ tunnelAddress: address })
  }

  /** Dismiss the pairing link without revoking anything. */
  dismissLink(): void {
    this.set({ link: null })
  }

  /** Open or close the revoke confirmation, ignored while a revoke is flying. */
  confirmRevoke(open: boolean): void {
    if (this.store.getSnapshot().revoking) return
    this.set({ confirmingRevoke: open })
  }

  /**
   * Revoke every session, then re-read status so the page reflects the host.
   * @returns once the revoke settled and status was re-read.
   */
  async revoke(): Promise<void> {
    const before = this.store.getSnapshot()
    if (!before.confirmingRevoke || before.revoking) return
    this.set({ revoking: true, error: null })
    let response
    try {
      response = await this.api.remoteAuth.revoke({})
    } catch (error) {
      this.set({ revoking: false, confirmingRevoke: false, error: messageOf(error) })
      return
    }
    if (!response.result.ok) {
      this.set({ revoking: false, confirmingRevoke: false, error: response.result.error.message })
      return
    }
    this.set({ revoking: false, confirmingRevoke: false, link: null })
    await this.load()
  }
}
