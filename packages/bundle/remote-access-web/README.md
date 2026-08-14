# `@froststarinquire/dsh-remote-access-web`

English | [中文](README.zh.md)

The dsh browser-surface remote-access bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over the official `dsh-web-app` surface: it inserts the `@froststarinquire/dsh-remote-access` host row, which manages an outbound reverse tunnel so a remote device can reach the harness web service. The tunnel backend is selected by the `provider` config; the shipped driver is the **frp** provider (`provider: 'frp'`), running an `frpc`-compatible client. The browser surface (phone drawer layout, remote-auth pair gate) is carried by `dsh-web-app`; this bundle only adds tunnel management and the launch contract that admits the tunnel through the `/api` browser-trust fence.

The host plugin is adapted from `@deepseek-ai/dsh-remote-access` in the [DeepSeek Harness](https://github.com/deepseek-ai/dsh) source (MIT), published here under the `@froststarinquire` scope.

A profile installs this bundle after `dsh-web-app` in `dsh.profile.bundles`. Because a bundle patch replaces a whole row's `config`, the inserted row reads every value from the deployment environment (`DSH_REMOTE_ACCESS_*`), never literal config. An unconfigured install stays inert: the plugin's `provider` default is `none`, so a profile that adds this bundle before owning a tunnel spawns nothing.

The patch also pins the directory picker to the in-app **`-browse`** interaction. Through a reverse tunnel the native OS dialog is unavailable, so `dsh-web-app`'s adaptive chooser would leave the remote operator with no way to add a workspace. This bundle disables that chooser and mounts `dsh-host-directory-picker-browse` plus its `dsh-client-ui-directory-picker-browse` surface.

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

The tunnel's connection address is **yours to supply** — the plugin never ships a default endpoint. Set the env above to your own provider's public host (`DSH_REMOTE_ACCESS_PUBLIC_URL`) and launch credential (`DSH_REMOTE_ACCESS_FRP_ARGS`); without them, an install stays inert.

## Launch contract

The tunnel's public authority must reach the `/api` browser-trust fence **at boot** — the fence samples trust once when `dsh-web-app` provides `webRuntime`, so a runtime plugin cannot retrofit it. Put your own tunnel authority in place of `<your-tunnel-host>` and launch (and open the remote surface as desired):

```sh
dsh --profile web \
  --trusted-host <your-tunnel-host:port> \
  --allow-remote-privileged \
  --remote-auth
```

`--allow-remote-privileged` lets the loopback-pinned methods (`settings`, `credentials`, native dialogs) accept the trusted authority; `--remote-auth` enforces the paired-session gate on non-loopback `/api`. Some tunnel providers (including typical frp edges) are HTTPS-only and return 501 on `http://`, so open the phone on the `https://` public URL.

## Known Limitations and Deferred Work

- **The remote surface is not authenticated by this bundle** — `--remote-auth` enables the pairing gate in `dsh-web-app`; without it, the tunnel exposes the harness to anyone who can reach the public authority. Only run on a tunnel you trust.
- **The trust fence is a boot-time snapshot** — the tunnel authority must be passed via `--trusted-host` at launch; it cannot be added after boot from this bundle's runtime.
