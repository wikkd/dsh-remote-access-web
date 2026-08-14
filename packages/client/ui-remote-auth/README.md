# @deepseek-ai/dsh-client-ui-remote-auth

English | [中文](README.zh.md)

Browser-side settings surface for the remote-access authentication seam: it displays the current pairing/session status, offers a one-time pairing link to copy, and provides a confirmed revoke of every issued session. The section talks to the `remoteAuth.*` RPC domain through the `@deepseek-ai/dsh-client-connection` gateway; the actual authentication behavior lives in the host plugin [`@deepseek-ai/dsh-remote-auth`](../../remote-access/remote-auth/README.md).

The section registers into the `settings.section` slot and pairs with the `@deepseek-ai/dsh-client-locale` merge for Chinese/English text, `token: settings.remoteAuth` for the settings namespace. Its controller (`RemoteAuthController`) reads `status()`, calls `pair()` to mint a one-time pairing code and builds the absolute login URL from the provided origin or configured `publicUrl`, and calls `revoke()` on confirmation.

The section is visible only when the remote surface is relevant: pairing a phone behind a tunnel. Locally, loopback requests are never forced through authentication, so the section may report "not paired" without affecting local `dsh web` use.

## Model Experience

None, as a browser-facing settings row: the section drives host `remoteAuth.*` mutations through the connection gateway and renders the result, contributing no prompt or tool schema of its own.

#### KV Cache effect

None; the section changes no model request content.

## Known Limitations and Deferred Work

- **Read-only status, coarse controls** — the section surfaces pairing/revoke only; per-device management and fine-grained session controls are out of scope.
- **No inline pairing form** — pairing still happens through the one-tap login URL or the host's minimal HTML form; a polished in-section mobile flow is a later phase.
