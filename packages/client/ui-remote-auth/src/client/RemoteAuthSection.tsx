/**
 * Remote-access settings section: pairing/session status, a generated
 * one-time pairing link to copy, and a confirmed revoke. The host stays the
 * single fact source — status is read on mount, and every mutation re-reads
 * it so the page reflects what the gate actually holds.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconCopyOutline16, Input, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { MAX_TTL_SECONDS, MIN_TTL_SECONDS, type RemoteAuthState } from './remote-auth-store.ts'
import { formatTtl, type RemoteAuthKey } from './locales.ts'
import css from './RemoteAuthSection.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Remote-access section copy. */
    'settings.remoteAuth': RemoteAuthKey
  }
}

/** Registration-side business face for the remote-access section. */
export interface RemoteAuthSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useRemoteAuth. */
    remoteAuth: SnapshotStore<RemoteAuthState>
  }
  /** Read pairing/session status; called once when the section first renders. */
  load: () => Promise<void>
  /** Mint a pairing link and show it. */
  pair: () => Promise<void>
  /** Set the requested session lifetime (seconds) for the next pairing link. */
  setTtlSeconds: (seconds: number) => void
  /** Set the user-provided 内网穿透地址 for the next pairing link. */
  setTunnelAddress: (address: string) => void
  /** Dismiss the shown link without revoking. */
  dismissLink: () => void
  /** Open or close the revoke confirmation. */
  confirmRevoke: (open: boolean) => void
  /** Revoke every session and re-read status. */
  revoke: () => Promise<void>
}

/** Full component props. */
export type RemoteAuthSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.remoteAuth'>
  & InjectFace<RemoteAuthSectionInjected>

/** Copy the pairing link to the clipboard and report the outcome. */
function copyText(text: string): Promise<boolean> {
  /* v8 ignore next -- the client bundle always runs in a browser with a navigator */
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return Promise.resolve(false)
  return navigator.clipboard.writeText(text).then(() => true, () => false)
}

/** Session-lifetime display unit: one selectable bucket of seconds for the TTL control. */
type TtlUnitId = 'minute' | 'hour' | 'day'

interface TtlUnit {
  id: TtlUnitId
  seconds: number
  label: RemoteAuthKey
}

const TTL_UNITS: Record<TtlUnitId, TtlUnit> = {
  minute: { id: 'minute', seconds: 60, label: 'unitMinute' },
  hour: { id: 'hour', seconds: 3600, label: 'unitHour' },
  day: { id: 'day', seconds: 86400, label: 'unitDay' },
}

const TTL_UNITS_ORDER: readonly TtlUnitId[] = ['minute', 'hour', 'day']

/** Pick the display unit for a lifetime no longer than `seconds`. */
function unitForSeconds(seconds: number): TtlUnit {
  if (seconds <= 60 * 60) return TTL_UNITS.minute
  if (seconds <= 24 * 60 * 60) return TTL_UNITS.hour
  return TTL_UNITS.day
}

/** The whole-number amount a duration shows under a given unit. */
function amountFor(seconds: number, unit: TtlUnit): number {
  return seconds / unit.seconds
}

/** The clamped seconds a whole-number amount and its unit request. */
function clampSeconds(amount: number, unit: TtlUnit): number {
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.round(amount * unit.seconds)))
}

/**
 * Render the Remote access section.
 * @param props - composed slot props.
 * @returns the section content.
 */
export function RemoteAuthSection(props: RemoteAuthSectionProps): ReactNode {
  const { useRemoteAuth, t } = props
  const state = useRemoteAuth(snapshot => snapshot)
  const [copied, setCopied] = useState(false)
  // The session-lifetime control keeps its own display unit and text draft; the
  // store owns the clamped seconds, which the control reconciles on change/blur.
  const [unit, setUnit] = useState<TtlUnitId>(() => unitForSeconds(state.pendingTtlSeconds).id)
  const [draft, setDraft] = useState<string>(() => String(amountFor(state.pendingTtlSeconds, unitForSeconds(state.pendingTtlSeconds))))
  const [unitOpen, setUnitOpen] = useState(false)

  useEffect(() => {
    void props.load()
  }, [props.load])

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => { setCopied(false) }, 1600)
      return () => { clearTimeout(timer) }
    }
    return undefined
  }, [copied])

  const handleCopy = (): void => {
    /* v8 ignore next -- the copy button renders only while a link is shown */
    if (state.link === null) return
    void copyText(state.link.loginUrl).then(ok => { setCopied(ok) })
  }

  const activeUnit = TTL_UNITS[unit]

  /** Write the draft to the store (clamped) and pin it back as a clean amount. */
  const commitDraft = (): void => {
    // The store's setTtlSeconds is the enforcement point: a NaN drafts falls
    // through to it and is ignored there, so no guard is needed here.
    const parsed = Number(draft)
    const seconds = clampSeconds(parsed, activeUnit)
    props.setTtlSeconds(seconds)
    setDraft(String(amountFor(seconds, activeUnit)))
  }

  /** Switch the unit, keeping the requested duration until it is clamped. */
  const selectUnit = (id: string): void => {
    const next = TTL_UNITS[id as TtlUnitId]
    const currentSeconds = Number.isFinite(Number(draft)) && Number(draft) > 0
      ? clampSeconds(Number(draft), activeUnit)
      : state.pendingTtlSeconds
    setUnit(next.id)
    // Rebase the draft into the new unit so the duration reads consistently.
    setDraft(String(amountFor(currentSeconds, next)))
    setUnitOpen(false)
    props.setTtlSeconds(currentSeconds)
  }

  if (state.status === 'error') {
    /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
    const detail = state.error ?? ''
    return (
      <div className={css.section}>
        <p className={css.error} role="alert">{`${t('error')} ${detail}`}</p>
        <button type="button" className={css.secondaryButton} onClick={() => { void props.load() }}>
          {t('retry')}
        </button>
      </div>
    )
  }

  const statusLabel = state.status === 'ready'
    ? state.paired ? t('pairedStatus') : t('unpairedStatus')
    : t('loading')

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav')}</h2>
      <p className={css.intro}>{t('sectionIntro')}</p>

      <div className={css.statusRow}>
        <span className={state.paired ? css.dotPaired : css.dot} />
        <span>{statusLabel}</span>
        {state.paired ? <span className={css.ttl}>{`${t('sessionTtl')}: ${formatTtl(state.sessionTtlSeconds)}`}</span> : null}
      </div>

      {state.link === null
        ? (
          <div className={css.field}>
            <span className={css.fieldLabel}>{t('tunnelLabel')}</span>
            <Input
              aria-label={t('tunnelLabel')}
              className={css.tunnelInput as string}
              type="text"
              spellCheck={false}
              placeholder={t('tunnelPlaceholder')}
              value={state.tunnelAddress}
              onChange={(event) => { props.setTunnelAddress(event.currentTarget.value) }}
            />
            <span className={css.ttl}>{t('tunnelHint')}</span>
          </div>
        )
        : null}

      {state.link === null
        ? (
          <div className={css.field}>
            <span className={css.fieldLabel}>{t('ttlLabel')}</span>
            <div className={css.ttlControl}>
              <Input
                aria-label={t('ttlLabel')}
                className={css.ttlValue as string}
                type="number"
                min={1}
                spellCheck={false}
                value={draft}
                onChange={(event) => { setDraft(event.currentTarget.value) }}
                onBlur={commitDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitDraft()
                }}
              />
              <Menu
                open={unitOpen}
                anchor={(
                  <Button variant="outline" onClick={() => { setUnitOpen(true) }} className={css.ttlUnit}>
                    {t(activeUnit.label)}
                  </Button>
                )}
                items={TTL_UNITS_ORDER.map(id => {
                  const candidate = TTL_UNITS[id]
                  return { id: candidate.id, label: t(candidate.label) }
                })}
                selectedId={activeUnit.id}
                onSelect={selectUnit}
                onClose={() => { setUnitOpen(false) }}
              />
            </div>
            <span className={css.ttl}>{t('ttlHint')}</span>
          </div>
        )
        : null}

      {state.link === null
        ? (
          <Button disabled={state.pairing} onClick={() => { void props.pair() }}>
            {state.pairing ? t('generating') : t('generate')}
          </Button>
        )
        : (
          <div className={css.linkBlock}>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('pairLinkLabel')}</span>
              <textarea
                readOnly
                className={css.linkText}
                rows={2}
                value={state.link.loginUrl}
                spellCheck={false}
                onFocus={(event) => { event.currentTarget.select() }}
              />
            </label>
            <div className={css.linkActions}>
              <Button variant="outline" onClick={handleCopy}>
                <IconCopyOutline16 size={14} />
                {copied ? t('copied') : t('copy')}
              </Button>
              <Button variant="outline" onClick={() => { props.dismissLink() }}>
                {t('close')}
              </Button>
            </div>
          </div>
        )}

      <div className={css.revokeBlock}>
        <Button
          variant="outline"
          className={css.revokeButton}
          disabled={state.revoking}
          onClick={() => { props.confirmRevoke(true) }}
        >
          {t('revoke')}
        </Button>
      </div>

      <Modal
        open={state.confirmingRevoke}
        onClose={() => { props.confirmRevoke(false) }}
        title={t('revokeTitle')}
        closeLabel={t('close')}
        description={t('revokeDescription')}
        className={css.dialog as string}
        footer={(
          <>
            <Button
              variant="outline"
              autoFocus
              disabled={state.revoking}
              onClick={() => { props.confirmRevoke(false) }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="outline"
              className={css.revokeConfirm}
              disabled={state.revoking}
              onClick={() => { void props.revoke() }}
            >
              {state.revoking ? t('revoking') : t('revokeConfirm')}
            </Button>
          </>
        )}
      />
    </div>
  )
}
