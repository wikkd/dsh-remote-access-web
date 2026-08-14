/**
 * Behavior of the canonical-authority derivation from a configured public URL.
 *
 * The derived authority must be byte-for-byte what `dsh --profile web
 * --trusted-host` would feed to the /api browser-trust fence, so a config
 * surface that advertises a public URL can also produce the matching fence
 * entry. Any value that cannot resolve to a bare `<host>` or `<host:port>`
 * authority must be refused, because such a URL could never reach the wire
 * Host header the fence compares.
 */

import { describe, expect, it } from 'vitest'
import { canonicalAuthorityFromPublicUrl } from '../src/index.ts'

describe('canonicalAuthorityFromPublicUrl', () => {
  it('resolves a full http URL to its bare authority, keeping the explicit port', () => {
    expect(canonicalAuthorityFromPublicUrl('http://tunnel.example.com:5953')).toBe('tunnel.example.com:5953')
    expect(canonicalAuthorityFromPublicUrl('http://tunnel.example.com')).toBe('tunnel.example.com')
  })

  it('accepts a bare authority with or without a port', () => {
    expect(canonicalAuthorityFromPublicUrl('tunnel.example.com:5953')).toBe('tunnel.example.com:5953')
    expect(canonicalAuthorityFromPublicUrl('tunnel.example.com')).toBe('tunnel.example.com')
  })

  it('normalizes case through WHATWG parsing, collapsing scheme-default ports exactly as the fence does', () => {
    expect(canonicalAuthorityFromPublicUrl('FRP-BOX.com:5953')).toBe('tunnel.example.com:5953')
    // A scheme-default port (:80 for http, :443 for https) is the WHATWG
    // "no port" form; the fence's canonicalAuthority treats it as port-less,
    // which port-less entries match on any port. Keep that identical contract.
    expect(canonicalAuthorityFromPublicUrl('http://tunnel.example.com:80')).toBe('tunnel.example.com')
    expect(canonicalAuthorityFromPublicUrl('https://tunnel.example.com:443')).toBe('tunnel.example.com')
    // A real tunnel port is never a scheme default, so it is always preserved.
    expect(canonicalAuthorityFromPublicUrl('https://tunnel.example.com:5953')).toBe('tunnel.example.com:5953')
  })

  it('refuses values that carry non-authority URL parts, which could never reach the Host header', () => {
    expect(canonicalAuthorityFromPublicUrl('http://tunnel.example.com:5953/path')).toBeUndefined()
    expect(canonicalAuthorityFromPublicUrl('http://tunnel.example.com:5953?token=1')).toBeUndefined()
    expect(canonicalAuthorityFromPublicUrl('http://user@tunnel.example.com:5953')).toBeUndefined()
  })

  it('refuses unparsable and empty values', () => {
    expect(canonicalAuthorityFromPublicUrl('')).toBeUndefined()
    expect(canonicalAuthorityFromPublicUrl('not a url with spaces')).toBeUndefined()
  })
})
