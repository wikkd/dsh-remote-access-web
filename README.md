# dsh-remote-access-web

English | [中文](README.zh.md)

Independent source/publishing repository for the DeepSeek Harness **remote-access plugin family**. This repository hosts the packages that let a remote device reach a `dsh --profile web` deployment through a managed reverse tunnel, plus the authentication pairing gate and its browser settings surface. The tunnel backend is selected by a configurable `provider`; the shipped driver is the **frp** provider running an `frpc`-compatible client.

## Packages

| Package | Role |
|---|---|
| [`@deepseek-ai/dsh-remote-access`](packages/remote-access/remote-access/README.md) | Reverse-tunnel host plugin (`ctx.remoteAccess`): manages and keeps alive the outbound tunnel child for the configured provider |
| [`@deepseek-ai/dsh-remote-auth`](packages/remote-access/remote-auth/README.md) | Pairing-auth host plugin: seed token + one-time device pairing gating non-loopback `/api` |
| [`@deepseek-ai/dsh-client-ui-remote-auth`](packages/client/ui-remote-auth/README.md) | Browser settings surface for the pairing seam |
| [`@deepseek-ai/dsh-remote-access-web`](packages/bundle/remote-access-web/README.md) | Installable profile bundle mounting the tunnel row over `dsh-web-app` |

## Status

Source and publishing-ready. The packages depend as **peers on the released `@deepseek-ai/*` harness packages** (`cordis`, `dsh-subprocess`, the `dsh-client-*` web stack, `web-react`, React). Those peers are published to npm as part of the DeepSeek Harness release; a standalone `pnpm install`/build in this repository requires them published under the `0.1.0` line. Until that publication, this repository holds the source and CI-ready structure rather than a self-contained build.

## Remote workspace picker

The installable bundle pins the directory-picker seam to the in-app **`-browse`** interaction. `dsh-web-app` mounts the adaptive chooser, which resolves to the native OS dialog whenever the harness binds only loopback — exactly what a reverse tunnel sees, so a remote operator cannot open a local OS chooser and the **Add workspace** affordance stays unrendered. The bundle disables that chooser row and mounts the in-app directory dialog (host backend + client surface) so a remote operator can add workspaces.

## Install the bundle

From the main DeepSeek Harness installation:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-remote-access-web
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

This repository was developed with AI assistance. The code, documentation, and listing descriptions were generated or revised by a large language model in collaboration with a human maintainer. Review the source before deploying it to an untrusted environment.
