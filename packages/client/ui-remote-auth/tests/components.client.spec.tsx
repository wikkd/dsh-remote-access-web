// @vitest-environment jsdom
/**
 * The remote-access settings section: status line on mount, a generated
 * pairing link to copy, and a confirmed revoke.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { RemoteAuthSection } from '../src/client/RemoteAuthSection.tsx'
import type { RemoteAuthSectionProps } from '../src/client/RemoteAuthSection.tsx'
import type { RemoteAuthState } from '../src/client/remote-auth-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const STATE_PAIRED: RemoteAuthState = {
  status: 'ready',
  error: null,
  paired: true,
  sessionTtlSeconds: 7200,
  pendingTtlSeconds: 24 * 60 * 60,
  tunnelAddress: '',
  link: null,
  pairing: false,
  revoking: false,
  confirmingRevoke: false,
}

const URL = 'https://tunnel.example.com:5953/__remote/pair?code=abcd'

function makeActions() {
  return {
    load: vi.fn(() => Promise.resolve()),
    pair: vi.fn(() => Promise.resolve()),
    setTtlSeconds: vi.fn(),
    setTunnelAddress: vi.fn(),
    dismissLink: vi.fn(),
    confirmRevoke: vi.fn(),
    revoke: vi.fn(() => Promise.resolve()),
  }
}

function renderSection(state: Partial<RemoteAuthState> = {}, actions = makeActions()) {
  const store = createSnapshotStore<RemoteAuthState>({ ...STATE_PAIRED, ...state })
  const view = render(<RemoteAuthSection {...({
    ...actions,
    close: () => {},
    useRemoteAuth: bindSnapshotSelector(store),
    t: (key: keyof typeof en) => en[key],
  } as unknown as RemoteAuthSectionProps)} />)
  return { actions, view, store }
}

describe('the remote-access section', () => {
  it('reads status once on mount and reports the paired session', async () => {
    const { actions } = renderSection()

    await waitFor(() => { expect(actions.load).toHaveBeenCalledTimes(1) })
    expect(screen.getByText(en.pairedStatus)).toBeTruthy()
    expect(screen.getByText(new RegExp(en.sessionTtl))).toBeTruthy()
  })

  it('reports no device paired when the host answers unpaired', () => {
    renderSection({ paired: false, sessionTtlSeconds: 0 })

    expect(screen.getByText(en.unpairedStatus)).toBeTruthy()
  })

  it('shows a loading line before status arrives', () => {
    renderSection({ status: 'idle' })

    expect(screen.getByText(en.loading)).toBeTruthy()
  })

  it('shows a failure with a retry control', () => {
    const { actions } = renderSection({ status: 'error', error: 'down' })

    expect(screen.getByRole('alert').textContent).toBe(`${en.error} down`)
    fireEvent.click(screen.getByText(en.retry))
    expect(actions.load).toHaveBeenCalledTimes(2)
  })

  it('mints a link through the pair action', async () => {
    const { actions } = renderSection({ link: null })

    fireEvent.click(screen.getByText(en.generate))

    await waitFor(() => { expect(actions.pair).toHaveBeenCalledTimes(1) })
  })

  it('disables the pair button while a pair is in flight', () => {
    renderSection({ pairing: true })

    expect(screen.getByText(en.generating)).toBeTruthy()
  })

  it('shows the generated link and copies it', () => {
    const write = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText: write } })
    renderSection({ link: { code: 'abcd', loginUrl: URL } })

    expect(screen.getByDisplayValue(URL)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.copy }))

    expect(write).toHaveBeenCalledWith(URL)
  })

  it('says it copied after a successful copy, then resets', async () => {
    vi.useFakeTimers()
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })
    renderSection({ link: { code: 'abcd', loginUrl: URL } })

    fireEvent.click(screen.getByRole('button', { name: en.copy }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('button', { name: en.copied })).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1600) })
    expect(screen.getByRole('button', { name: en.copy })).toBeTruthy()
  })

  it('stays quiet when the clipboard is unavailable', async () => {
    // jsdom exposes navigator but not navigator.clipboard unless stubbed.
    delete (navigator as { clipboard?: unknown }).clipboard
    renderSection({ link: { code: 'abcd', loginUrl: URL } })

    fireEvent.click(screen.getByRole('button', { name: en.copy }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('button', { name: en.copy })).toBeTruthy()
  })

  it('stays quiet when the copy rejects', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) } })
    renderSection({ link: { code: 'abcd', loginUrl: URL } })

    fireEvent.click(screen.getByRole('button', { name: en.copy }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('button', { name: en.copy })).toBeTruthy()
  })

  it('selects the whole link when it is focused', () => {
    renderSection({ link: { code: 'abcd', loginUrl: URL } })

    const area = screen.getByDisplayValue(URL) as HTMLTextAreaElement
    const select = vi.spyOn(area, 'select')
    fireEvent.focus(area)

    expect(select).toHaveBeenCalledTimes(1)
  })

  it('dismisses the link without revoking', () => {
    const { actions } = renderSection({ link: { code: 'abcd', loginUrl: URL } })

    fireEvent.click(screen.getByRole('button', { name: en.close }))

    expect(actions.dismissLink).toHaveBeenCalledTimes(1)
  })

  it('opens the revoke confirmation', () => {
    const { actions } = renderSection()

    fireEvent.click(screen.getByRole('button', { name: en.revoke }))

    expect(actions.confirmRevoke).toHaveBeenCalledWith(true)
  })

  it('confirms the revoke from the modal', () => {
    const { actions } = renderSection({ confirmingRevoke: true })

    fireEvent.click(screen.getByRole('button', { name: en.revokeConfirm }))

    expect(actions.revoke).toHaveBeenCalledTimes(1)
  })

  it('cancels the revoke confirmation', () => {
    const { actions } = renderSection({ confirmingRevoke: true })

    fireEvent.click(screen.getByRole('button', { name: en.cancel }))

    expect(actions.confirmRevoke).toHaveBeenCalledWith(false)
  })

  it('dismisses the revoke confirmation on Escape', () => {
    const { actions } = renderSection({ confirmingRevoke: true })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.confirmRevoke).toHaveBeenCalledWith(false)
  })

  it('disables the revoke confirm while a revoke is in flight', () => {
    renderSection({ confirmingRevoke: true, revoking: true })

    expect(screen.getByRole('button', { name: en.revoking })).toBeTruthy()
  })
})

describe('the custom session-lifetime control', () => {
  it('shows the lifetime input and its display unit before a link is minted', () => {
    renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    expect(screen.getByText(en.ttlLabel)).toBeTruthy()
    expect(screen.getByText(en.ttlHint)).toBeTruthy()
    // 24 hours under the hour unit → amount 24.
    expect(screen.getByDisplayValue('24')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.unitHour })).toBeTruthy()
  })

  it('commits a typed amount on blur, clamped to the server bounds', () => {
    const { actions } = renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    const input = screen.getByDisplayValue('24')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.blur(input)

    expect(actions.setTtlSeconds).toHaveBeenLastCalledWith(8 * 60 * 60)
    expect(screen.getByDisplayValue('8')).toBeTruthy()
  })

  it('clamps a below-floor amount up to the 1-minute minimum', () => {
    const { actions } = renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    const input = screen.getByDisplayValue('24')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.blur(input)

    expect(actions.setTtlSeconds).toHaveBeenLastCalledWith(60)
  })

  it('switches the display unit and rebases the amount', () => {
    const { actions } = renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    fireEvent.click(screen.getByRole('button', { name: en.unitHour }))
    fireEvent.click(screen.getByRole('menuitem', { name: en.unitDay }))

    expect(actions.setTtlSeconds).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: en.unitDay })).toBeTruthy()
    // 24 hours = 1 day under the day unit.
    expect(screen.getByDisplayValue('1')).toBeTruthy()
  })

  it('shows the minute unit and its amount for a sub-hour lifetime', () => {
    renderSection({ link: null, pendingTtlSeconds: 30 * 60 })

    expect(screen.getByRole('button', { name: en.unitMinute })).toBeTruthy()
    expect(screen.getByDisplayValue('30')).toBeTruthy()
  })

  it('shows the day unit and its amount for a multi-day lifetime', () => {
    renderSection({ link: null, pendingTtlSeconds: 10 * 24 * 60 * 60 })

    expect(screen.getByRole('button', { name: en.unitDay })).toBeTruthy()
    expect(screen.getByDisplayValue('10')).toBeTruthy()
  })

  it('clamps an emptied draft up to the 1-minute minimum on blur', () => {
    const { actions } = renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    const input = screen.getByDisplayValue('24')
    // A type=number input turns letters into an empty value → Number('') is 0.
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(actions.setTtlSeconds).toHaveBeenLastCalledWith(60)
  })

  it('commits the draft when Enter is pressed', () => {
    const { actions } = renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    const input = screen.getByDisplayValue('24')
    fireEvent.change(input, { target: { value: '4' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(actions.setTtlSeconds).toHaveBeenLastCalledWith(4 * 60 * 60)
  })

  it('ignores a non-Enter key in the lifetime input', () => {
    const { actions } = renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    const input = screen.getByDisplayValue('24')
    fireEvent.change(input, { target: { value: '4' } })
    fireEvent.keyDown(input, { key: 'Tab' })

    expect(actions.setTtlSeconds).not.toHaveBeenCalled()
  })

  it('closes the unit menu on Escape', () => {
    renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    fireEvent.click(screen.getByRole('button', { name: en.unitHour }))
    expect(screen.getByRole('menuitem', { name: en.unitMinute })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menuitem', { name: en.unitMinute })).toBeNull()
  })

  it('keeps the current lifetime when switching unit after clearing the draft', () => {
    const { actions } = renderSection({ link: null, pendingTtlSeconds: 24 * 60 * 60 })

    const input = screen.getByDisplayValue('24')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: en.unitHour }))
    fireEvent.click(screen.getByRole('menuitem', { name: en.unitMinute }))

    // The empty draft falls back to the stored 24h, rebased into minutes.
    expect(actions.setTtlSeconds).toHaveBeenLastCalledWith(24 * 60 * 60)
    expect(screen.getByDisplayValue('1440')).toBeTruthy()
  })
})

describe('the tunnel-address (内网穿透地址) field', () => {
  it('shows the field with the current address before a link is minted', () => {
    renderSection({ link: null, tunnelAddress: 'https://tunnel.example.com:5953' })

    expect(screen.getByText(en.tunnelLabel)).toBeTruthy()
    expect(screen.getByDisplayValue('https://tunnel.example.com:5953')).toBeTruthy()
  })

  it('writes an edited address back to the store', () => {
    const { actions } = renderSection({ link: null, tunnelAddress: '' })

    const input = screen.getByPlaceholderText(en.tunnelPlaceholder)
    fireEvent.change(input, { target: { value: 'https://my-tunnel.example:9999' } })

    expect(actions.setTunnelAddress).toHaveBeenLastCalledWith('https://my-tunnel.example:9999')
  })

  it('hides the field once a link is shown', () => {
    renderSection({ link: { code: 'abcd', loginUrl: URL } })

    expect(screen.queryByText(en.tunnelLabel)).toBeNull()
  })
})
