# `@deepseek-ai/dsh-remote-access-web`

English | [中文](README.zh.md)

The dsh browser-surface remote-access bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-web-app`](../web-app/README.md): it inserts the `@deepseek-ai/dsh-remote-access` host row (under `packages/remote-access/remote-access`), which manages an outbound reverse tunnel so a remote device can reach the harness web service. The tunnel backend is selected by the `provider` config; the shipped driver is the **frp** provider (`provider: 'frp'`), running an `frpc`-compatible client. The hosted/browser surface — including the phone drawer layout and the remote-auth pairing gate — is already carried by `dsh-web-app`; this bundle adds only tunnel management and documents the launch contract that admits the tunnel through the `/api` browser-trust fence.

A profile installs this bundle after `dsh-web-app` in its `dsh.profile.bundles` list. Because a bundle patch replaces a whole row's `config`, the inserted row reads every value from the deployment environment (`DSH_REMOTE_ACCESS_*`), never literal config. An unconfigured install stays inert: the plugin's `provider` default is `none`, so a profile that adds this bundle before owning a tunnel spawns nothing.

The patch also **pins the directory-picker seam to the in-app `-browse` interaction** for this deployment. `dsh-web-app` mounts the adaptive `dsh-host-directory-picker-auto` chooser, which resolves to the native OS dialog whenever the harness binds only loopback — precisely what a reverse tunnel sees, so a remote operator cannot open a local OS chooser and the **Add workspace** affordance stays unrendered. This bundle disables that row and mounts `dsh-host-directory-picker-browse` plus its `dsh-client-ui-directory-picker-browse` surface, giving the remote operator the in-app Miller-column directory dialog backed by the host's `listDirectory`/`createDirectory` primitives.

## Configuration

The row honors the deployment env (all optional; `provider` defaults to `none`):

| Env | Meaning |
|---|---|
| `DSH_REMOTE_ACCESS_PROVIDER` | Tunnel backend; `frp` mounts a tunnel through an frpc-compatible client, absent keeps the schema default `none` (inert). The field is deployment-configurable so other backends can be added |
| `DSH_REMOTE_ACCESS_FRPC_PATH` | absolute path to `frpc` (or compatible); required when `provider` is `frp` |
| `DSH_REMOTE_ACCESS_FRP_ARGS` | frp fast-start value for `-f`, i.e. `<access-secret>:<tunnel-id>` |
| `DSH_REMOTE_ACCESS_CWD` | working directory for the tunnel child; defaults to the process cwd |
| `DSH_REMOTE_ACCESS_PUBLIC_URL` | public URL surfaced once the tunnel is up; the plugin's `trustedAuthority()` canonicalizes it for the trust fence |

When `provider` is `frp` but `frpcPath`/`frpArgs` are absent, the owning plugin refuses to activate loud rather than silently running without a tunnel.

## Launch contract

The tunnel's public authority must reach the `/api` browser-trust fence **at boot** — the fence samples trust once when `dsh-web-app` provides `webRuntime`, so a runtime plugin cannot retrofit it. Launch with the tunnel authority as a trusted host (and open the remote surface as desired):

```sh
dsh --profile web \
  --trusted-host tunnel.example.com:5953 \
  --allow-remote-privileged \
  --remote-auth
```

`--allow-remote-privileged` lets the loopback-pinned methods (`settings`, `credentials`, native dialogs) accept the trusted authority; `--remote-auth` enforces the paired-session gate on non-loopback `/api`. With the frp provider, the Sakura Frp edge is HTTPS-only (it returns 501 on `http://`), so open the phone on the `https://` public URL.

## Model Experience

Indirectly, through the inserted rows: this bundle selects the reverse-tunnel host row that the web-app surface rides over and pins the browser-directory composition, and contributes no model-visible text of its own.

#### KV Cache effect

None directly; each inserted row's own package owns its effect.

## Known Limitations and Deferred Work

- **The remote surface is not authenticated by this bundle** — `--remote-auth` enables the pairing gate in `dsh-web-app`; without it, the tunnel exposes the harness to anyone who can reach the public authority. Only run on a tunnel you trust.
- **The trust fence is a boot-time snapshot** — the tunnel authority must be passed via `--trusted-host` at launch; it cannot be added after boot from this bundle's runtime.
