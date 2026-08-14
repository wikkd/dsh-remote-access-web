# @froststarinquire/dsh-remote-access

English | [中文](README.zh.md)

Remote-access host plugin: manages and keeps alive an outbound reverse-tunnel child so a remote device can reach the harness web service. The tunnel backend is chosen by the `provider` config; the shipped driver is the **frp** provider running an `frpc`-compatible client. The plugin publishes the tunnel's reachability state.

The plugin's scope is **connect only** — it establishes and maintains a tunnel, and deliberately does **not** add an authentication layer in front of the harness web service. A remote device that reaches the tunnel passes the `/api` browser-trust fence once `--trusted-host` whitelists the tunnel authority; pairing auth ([`@deepseek-ai/dsh-remote-auth`](../remote-auth/README.md)) is the separate layer that proves caller identity. The plugin is **inert unless a real tunnel credential is configured**: its `provider` defaults to `none`, so an unconfigured mount spawns nothing.

## Lifecycle

The plugin builds a `SubprocessSpawnSpec` for `frpc -f <fast-start>` and runs it through `ctx.subprocess` (the process half of the shared execution world). A keepalive ladder restarts the child on abrupt crash with exponential backoff capped at 60s; a clean zero exit (a deliberate self-shutdown) stops the loop. `ctx.remoteAccess.status()` reports the current reachability, and `on(listener)` subscribes to tunnel lifecycle events re-emitted as the `remote-access/event` Cordis event. Teardown rides the owning fiber's effect disposer.

`trustedAuthority()` canonicalizes the configured `publicUrl` into exactly the `<host[:port]>` form `dsh --profile web --trusted-host` accepts, so a config surface that advertises a public URL can also produce the matching fence entry. A configured public URL that cannot resolve to a bare authority fails the surfaced value loud rather than silently leaving the tunnel orphaned behind the fence.

## Configuration

```ts
export interface Config {
  provider: 'none' | 'frp'        // 'none' keeps the plugin inert
  frpcPath?: string               // absolute path to frpc (or compatible); required when provider is 'frp'
  frpArgs?: string                // frp fast-start value for -f, i.e. <access-secret>:<tunnel-id>
  cwd?: string                    // working directory for the tunnel child; defaults to the process cwd
  graceMs: number                 // grace period (ms) for terminate escalation; defaults to 5000
  publicUrl?: string              // public URL surfaced once the tunnel is up
}
```

When `provider` is `frp` but `frpcPath`/`frpArgs` are absent, the plugin refuses to activate loud rather than silently running without a tunnel. Deployment-varying values (the frpc path, fast-start secret, public URL) are passed through Config — never hardcoded — so they are changeable from `cordis.patch.yml` or env.

## Model Experience

Indirectly, through the consumer surfaces that render tunnel reachability: the plugin registers no prompt, tool schema, or result of its own.

#### KV Cache effect

None direct; the plugin's lifecycle events do not enter any model request.

## Known Limitations and Deferred Work

- **Connect only, no authentication** — the plugin opens a tunnel but does not gate who reaches the harness through it. Pair authentication (`@froststarinquire/dsh-remote-access`) or a trusted tunnel must be layered separately.
- **Trusted authority must be passed at boot** — the `/api` trust fence samples `--trusted-host` once; the tunnel's public authority must be a launch flag, not added from this plugin's runtime.
- **One tunnel child** — the plugin manages a single tunnel process; multiple-concurrent-tunnel and additional-provider support is out of scope for this phase.
