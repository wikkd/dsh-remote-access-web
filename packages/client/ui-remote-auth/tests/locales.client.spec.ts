/** Web-localized copy for the remote-access section, plus ttl formatting. */

import { describe, expect, it } from 'vitest'
import { en, formatTtl, zh } from '../src/client/locales.ts'

describe('remote-access copy', () => {
  it('keeps Chinese and English bundles in lockstep', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('ships the localized navigation label', () => {
    expect(zh.nav).toBe('远程访问')
    expect(en.nav).toBe('Remote access')
  })
})

describe('ttl formatting', () => {
  it('formats zero and pure seconds', () => {
    expect(formatTtl(0)).toBe('0 秒')
    expect(formatTtl(45)).toBe('45 秒')
  })

  it('formats minutes with leftover seconds', () => {
    expect(formatTtl(125)).toBe('2 分钟 5 秒')
  })

  it('formats hours with minutes', () => {
    expect(formatTtl(7200)).toBe('2 小时 0 分钟')
    expect(formatTtl(7383)).toBe('2 小时 3 分钟')
  })
})
