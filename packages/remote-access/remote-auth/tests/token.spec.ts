/**
 * Behavior of the remote-auth token primitives: URL-safe generation,
 * constant-time comparison, and seed-derived pairing codes.
 */

import { describe, expect, it } from 'vitest'
import {
  constantTimeEqual,
  derivePairingCode,
  generateSeed,
  generateSessionToken,
  generateToken,
} from '../src/token.ts'

describe('token primitives', () => {
  it('generates URL-safe tokens of the requested byte length', () => {
    expect(generateToken(32)).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(generateSeed()).not.toBe(generateSeed())
    expect(generateSessionToken()).not.toBe(generateSessionToken())
  })

  it('compares tokens in constant time, refusing unequal lengths', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })

  it('derives a short, deterministic pairing code from seed + nonce', () => {
    const seed = generateSeed()
    const nonce = 'nonce-1'
    const code = derivePairingCode(seed, nonce)
    expect(code).toMatch(/^[A-Za-z0-9_-]{12}$/)
    // Same seed + nonce is deterministic; a different nonce yields a different code.
    expect(derivePairingCode(seed, nonce)).toBe(code)
    expect(derivePairingCode(seed, 'nonce-2')).not.toBe(code)
    // A different seed with the same nonce yields a different code.
    expect(derivePairingCode(generateSeed(), nonce)).not.toBe(code)
  })
})
