# dsh-remote-access-web

Independent source/publishing repository for the DeepSeek Harness **remote-access plugin family**. This repository hosts the packages that let a remote device reach a `dsh --profile web` deployment through a Sakura Frp reverse tunnel, plus the authentication pairing gate and its browser settings surface.

## Packages

| Package | Role |
|---|---|
| [`@deepseek-ai/dsh-remote-access`](packages/remote-access/remote-access/README.md) | Reverse-tunnel host plugin (`ctx.remoteAccess`): manages and keeps alive the outbound Sakura Frp child |
| [`@deepseek-ai/dsh-remote-auth`](packages/remote-access/remote-auth/README.md) | Pairing-auth host plugin: seed token + one-time device pairing gating non-loopback `/api` |
| [`@deepseek-ai/dsh-client-ui-remote-auth`](packages/client/ui-remote-auth/README.md) | Browser settings surface for the pairing seam |
| [`@deepseek-ai/dsh-remote-access-web`](packages/bundle/remote-access-web/README.md) | Installable profile bundle mounting the tunnel row over `dsh-web-app` |

## Status

Source and publishing-ready. The packages depend as **peers on the released `@deepseek-ai/*` harness packages** (`cordis`, `dsh-subprocess`, the `dsh-client-*` web stack, `web-react`, React). Those peers are published to npm as part of the DeepSeek Harness release; a standalone `pnpm install`/build in this repository requires them published under the `0.1.0` line. Until that publication, this repository holds the source and CI-ready structure rather than a self-contained build.

## Install the bundle

From the main DeepSeek Harness installation:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-remote-access-web
```

Then launch the web surface with the tunnel authority whitelisted at boot:

```sh
dsh --profile web \
  --trusted-host tunnel.example.com:5953 \
  --allow-remote-privileged \
  --remote-auth
```

See the bundle [`README`](packages/bundle/remote-access-web/README.md) for the full launch contract.
