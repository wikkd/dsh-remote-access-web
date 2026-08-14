/**
 * @module @deepseek-ai/dsh-remote-auth/token
 *
 * Pure token primitives for the remote-access authentication layer: URL-safe
 * random generation, constant-time comparison, and seed-derived pairing codes.
 * No filesystem, no state — these functions are the leaf crypto the plugin
 * composes around.
 * @packageDocumentation
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Byte length of the seed token. */
const SEED_BYTES = 32

/** Byte length of an issued session token. */
const SESSION_BYTES = 32

/**
 * Generate a fresh URL-safe random token of the given byte length, expressed
 * as base64url.
 * @param bytes - entropy length in bytes.
 * @returns the base64url token string.
 */
export function generateToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

/** Generate a fresh seed token (32 bytes of entropy). */
export function generateSeed(): string {
  return generateToken(SEED_BYTES)
}

/** Generate a fresh session token (32 bytes of entropy). */
export function generateSessionToken(): string {
  return generateToken(SESSION_BYTES)
}

/**
 * Derive a deterministic pairing code from the seed and a per-process rotation
 * nonce. Codes are short, URL-safe, and one-time: a code is consumed by the
 * pairing state machine, never re-usable, and the seed never leaves the host.
 * @param seed - the base64url seed token.
 * @param nonce - a per-process random value that changes which code the seed yields.
 * @returns a short (checked-duration) code string.
 */
export function derivePairingCode(seed: string, nonce: string): string {
  return createHmac('sha256', seed).update(nonce).digest('base64url').slice(0, 12)
}

/**
 * Constant-time equality for two same-length token strings. Both inputs are
 * compared as UTF-8 bytes, so equal content compares equal regardless of
 * spelling; unequal-length inputs compare unequal without leaking length.
 * @param a - one token.
 * @param b - the other token.
 * @returns true when the two tokens are byte-identical.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
