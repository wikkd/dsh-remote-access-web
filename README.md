# dsh-remote-access-web

English | [中文](README.zh.md)

Source and publishing repository for the DeepSeek Harness remote-access plugin family. It hosts two packages that let a remote device reach a `dsh --profile web` deployment through a managed reverse tunnel. The tunnel backend is selected by a configurable `provider`; the shipped driver is the **frp** provider running an `frpc`-compatible client.

## Packages

| Package | Role |
|---|---|
| [`@froststarinquire/dsh-remote-access`](packages/remote-access/remote-access/README.md) | Reverse-tunnel host plugin (`ctx.remoteAccess`): manages and keeps alive the outbound tunnel child for the configured provider |
| [`@froststarinquire/dsh-remote-access-web`](packages/bundle/remote-access-web/README.md) | Installable profile bundle mounting the tunnel row over `dsh-web-app` |

## Upstream

The `dsh-remote-access` host plugin is adapted from the **`@deepseek-ai/dsh-remote-access`** plugin in the [DeepSeek Harness](https://github.com/deepseek-ai/dsh) source (MIT). This repository publishes it under the `@froststarinquire` scope; it targets the same `@deepseek-ai/*` peer packages that the official harness ships. The `remote-auth` pairing plugin and its settings UI are not republished here — they ship with the official `dsh-web-app` surface.

## Status

Both packages are published to npm: `@froststarinquire/dsh-remote-access` (host plugin) and `@froststarinquire/dsh-remote-access-web` (bundle). They depend as peers on the released `@deepseek-ai/*` harness packages (`cordis`, `dsh-subprocess`, `dsh-invariants`). See [`INSTALL.md`](INSTALL.md) for the one-command install and the `frpc` + environment setup the tunnel needs.

## Remote workspace picker

The installable bundle pins the directory-picker to the **`-browse`** interaction. `dsh-web-app` normally uses an adaptive chooser that only offers a native OS dialog on loopback; through a reverse tunnel that dialog is unavailable, so a remote operator would have no way to add a workspace. The bundle disables that chooser and mounts the in-app browse dialog (host backend + client surface) instead.

## Install the bundle

From the main DeepSeek Harness installation:

```sh
dsh plugin --profile web add @froststarinquire/dsh-remote-access-web
```

Then launch the web surface, replacing `<your-tunnel-host:port>` with your own tunnel's public authority:

```sh
dsh --profile web \
  --trusted-host <your-tunnel-host:port> \
  --allow-remote-privileged \
  --remote-auth
```

See the bundle [`README`](packages/bundle/remote-access-web/README.md) for the full launch contract.

## AIGC Disclosure

Developed with AI assistance. The code, documentation, and listing copy here were written or revised with a language model, then reviewed by a human maintainer. The `dsh-remote-access` logic itself derives from upstream MIT code. Review the source before deploying it to an untrusted environment.
