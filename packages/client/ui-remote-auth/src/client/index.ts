/**
 * Remote-access surface plugin, browser half — one settings section that
 * manages the remote-access authentication seam: pairing/session status, a
 * one-time pairing link to copy, and a confirmed revoke of every session.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { RemoteAuthSection } from './RemoteAuthSection.tsx'
import type { RemoteAuthSectionInjected } from './RemoteAuthSection.tsx'
import { RemoteAuthController } from './remote-auth-store.ts'
import { en, zh } from './locales.ts'

export type { RemoteAuthSectionInjected, RemoteAuthSectionProps } from './RemoteAuthSection.tsx'
export type { RemoteAuthPairView, RemoteAuthState, RemoteAuthStatusView } from './remote-auth-store.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection']

/** Registration-side business face for the management section. */
export const REMOTE_AUTH_SETTINGS_NS = 'settings.remoteAuth'

/**
 * Mount the remote-access settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  const controller = new RemoteAuthController(api)

  ctx.effect(() => ctx.locale.register(REMOTE_AUTH_SETTINGS_NS, { zh, en }), 'ui-remote-auth: settings dictionaries')

  const sectionInjected = (): RemoteAuthSectionInjected => ({
    hooks: { remoteAuth: controller.store },
    load: () => controller.load(),
    pair: () => controller.pair().then(() => undefined),
    setTtlSeconds: (seconds: number) => { controller.setTtlSeconds(seconds) },
    setTunnelAddress: (address: string) => { controller.setTunnelAddress(address) },
    dismissLink: () => { controller.dismissLink() },
    confirmRevoke: (open: boolean) => { controller.confirmRevoke(open) },
    revoke: () => controller.revoke(),
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'remote-auth',
    order: 30,
    label: () => ctx.locale.bind(REMOTE_AUTH_SETTINGS_NS)('nav'),
    locale: REMOTE_AUTH_SETTINGS_NS,
    inject: sectionInjected,
  }, RemoteAuthSection))
}
