# @deepseek-ai/dsh-remote-auth

English | [中文](README.zh.md)

Remote-access authentication host plugin: a seed token plus a one-time device-pairing flow that issues short-lived session cookies, gating the harness `/api` surface for non-loopback clients.

The harness `/api` browser-trust fence (`@deepseek-ai/dsh-client-connection`) is a DNS-rebinding and cross-site defense, explicitly not authentication — it asks whether a request's Host is one the deployment serves, never whether the caller is the person who owns the machine. A phone reached through a public tunnel therefore passes the fence once `--trusted-host` whitelists the tunnel authority, and it then reaches the whole surface: sessions, bash, and — with `--allow-remote-privileged` — settings, credentials, and native dialogs. This plugin closes that gap by making a non-loopback caller prove identity first.

## Lifecycle

At boot the plugin loads or generates a 32-byte seed token at `<harness home>/remote-auth.seed` (owner-only `0600`, atomic rename). A configured `seedPath` overrides that location. The seed never leaves the host and is never written to the session log or any model-visible surface.

Pairing is a two-step exchange:

1. The deployment mints a one-time pairing code derived from the seed and a fresh random nonce (`derivePairingCode`), and surfaces it to the operator (for example, on the startup URL line). A `pair()` caller may request a custom session lifetime, clamped to the deployment bounds (60 seconds to 30 days) and applied to the session issued on redemption; omitted requests use the configured `sessionTtlMs`.
2. The remote device submits that code to `/__remote/login` or `/__remote/pair?code=…`. A correct code is consumed — it can never be used again — and the server responds with a `302` to `/` that sets an `HttpOnly; SameSite=Lax` session cookie, recording the device's `sec-ch-ua-platform`/`user-agent` fingerprint as the single active remote device.

Every later non-loopback `/api` request is admitted only when it carries a valid, unexpired session cookie whose device matches the paired device. Loopback requests are never forced through authentication, so local `dsh web` use is unchanged.

`revoke()` invalidates every issued session and clears the pairing; `status()` reports whether a device is paired and the **actual remaining** lifetime of the live session.

The service is consumed by two surfaces:
- **The `/api` gate** (`dsh-client-connection`) reads a structural `verify()` to admit or 401 a request.
- **The management surface** (`remoteAuth.*` RPC domain + the `@deepseek-ai/dsh-client-ui-remote-auth` settings page) calls `pair()` to mint a one-time pairing code and `loginUrl(code)` to build the absolute login URL a phone opens to pair in one tap, reads `status()`, and calls `revoke()` to kick the device offline.

`loginUrl(code, origin?)` prefers an explicitly supplied origin — such as the user-provided 内网穿透地址 — over the configured `publicUrl`; both fall back to `https://localhost`. A bare origin missing a scheme is treated as `https`, and a trailing slash is stripped. `status()` additionally reports the effective `publicUrl` so a settings surface can pre-fill the tunnel-address field.

## Configuration

```ts
export interface Config {
  seedPath?: string   // absolute seed file path; defaults to <harness home>/remote-auth.seed
  dshHome?: string    // harness home when seedPath is omitted; defaults to ~/.dsh
  enabled?: boolean   // enforce authentication; defaults to false (inert mount)
  sessionTtlMs?: number // default session lifetime; defaults to 24 hours (a pair() may request a custom, clamped lifetime)
  publicUrl?: string   // public origin (scheme://host[:port]) for the pairing login URL
}
```

`enabled` defaults to `false` so a mounted row stays inert until a deployment opts in. When `false`, `verify()` authorizes every request — matching the pre-authentication behavior — and the pairing routes still register but never mint a session.

## Security properties

- The seed and session tokens are 32 bytes of `crypto.randomBytes` entropy, compared with `crypto.timingSafeEqual`.
- A pairing may request a custom session lifetime; the host clamps any request to 60 seconds – 30 days so a caller cannot mint a never-expiring or sub-minute session. The deployment-configured `sessionTtlMs` passes through unclamped.
- Pairing codes are one-time and single-use by construction; a wrong code leaves the outstanding code in place so the operator can retry, while rate-limiting and device binding remain the gateway's concern.
- The session cookie is `HttpOnly`, `SameSite=Lax`, and short-lived; `Secure` is omitted because the tunnel is the TLS terminator and the harness answers the tunnel's plaintext forward on loopback.
- One active remote device: a new successful pair replaces the prior session.
- Authentication is layered *behind* the trust fence, not a replacement for it — both must pass.

## Model Experience

None, as a host-side network-boundary service: the plugin produces no session events and no model-visible text; the model's context is unchanged whether authentication is enabled or not.

#### KV Cache effect

None; the plugin changes no model request content and contributes no token to any request.

## Known Limitations and Deferred Work

- **Single device** — pairing a new device replaces the prior one; concurrent remote devices are out of scope.
- **No rate limiting here** — brute-forcing the pairing code is mitigated by the code's 96-bit effective entropy and one-time use, but request throttling is left to a fronting layer.
- **`Secure` is not set on the cookie** — the tunnel terminates TLS before reaching the harness's loopback listener, so the cookie transits plaintext only on the machine-local hop. A deployment that exposes the harness's all-interfaces bind directly must add `Secure` and its own TLS termination.
- **No login UI** — the pairing page is a minimal HTML form; a polished mobile login surface is a later phase.
