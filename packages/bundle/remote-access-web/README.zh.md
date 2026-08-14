# `@deepseek-ai/dsh-remote-access-web`

[English](README.md) | 中文

dsh 浏览器 surface 的远程访问 bundle。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-web-app`](../web-app/README.md) 之上：它插入 `@deepseek-ai/dsh-remote-access` host 行（位于 `packages/remote-access/remote-access`），由该插件管理一条出站反向隧道，使远程设备能访问 harness web 服务。隧道后端由 `provider` 配置决定；随附的驱动是 **frp** provider（`provider: 'frp'`），运行一个兼容 `frpc` 的客户端。已托管的浏览器 surface（含手机抽屉布局与 remote-auth 配对门禁）仍由 `dsh-web-app` 承载；本 bundle 只负责隧道管理，并说明把隧道准入 `/api` browser-trust 围栏的启动契约。

profile 在 `dsh.profile.bundles` 列表里把本 bundle 放在 `dsh-web-app` 之后。因为 bundle patch 替换整行的 `config`，插入的行全部从部署环境（`DSH_REMOTE_ACCESS_*`）读取，绝不写死字面量。未配置的安装保持惰性：插件的 `provider` 默认为 `none`，所以一个还没有隧道凭据就添加本 bundle 的 profile 不会启动任何子进程。

本 patch 还会把**目录选择 seam 固定为应用内 `-browse` 交互**。`dsh-web-app` 挂载的是自适应 `dsh-host-directory-picker-auto` 选择器，一旦 harness 只绑定 loopback（恰恰是反向隧道看到的情形），它就会解析为原生 OS 对话框，远程操作者因此无法弹出本地对话框，**Add workspace** 入口也不会渲染。本 bundle 禁用该行，改挂 `dsh-host-directory-picker-browse` 及其 `dsh-client-ui-directory-picker-browse` 表层，让远程操作者使用基于 host 的 `listDirectory`/`createDirectory` 原语的应用内 Miller 列目录对话框。

## 配置

该行遵循部署环境变量（全部可选；`provider` 默认为 `none`）：

| 环境变量 | 含义 |
|---|---|
| `DSH_REMOTE_ACCESS_PROVIDER` | 隧道后端；`frp` 通过兼容 frpc 的客户端挂载隧道，缺省保持 schema 默认 `none`（惰性）。该字段为部署可配置，便于后续接入其它后端 |
| `DSH_REMOTE_ACCESS_FRPC_PATH` | `frpc`（或兼容程序）的绝对路径；`provider` 为 `frp` 时必填 |
| `DSH_REMOTE_ACCESS_FRP_ARGS` | 传给 `-f` 的 frp 快速启动值，即 `<访问密钥>:<隧道ID>` |
| `DSH_REMOTE_ACCESS_CWD` | 隧道子进程的工作目录；缺省为进程 cwd |
| `DSH_REMOTE_ACCESS_PUBLIC_URL` | 隧道就绪后对用户展示的公网 URL；插件的 `trustedAuthority()` 会将其规范化为信任围栏所需的权威值 |

当 `provider` 为 `frp` 但 `frpcPath`/`frpArgs` 缺失时，所属插件会响亮拒绝激活，而非静默地在没有隧道的情况下运行。

## 启动契约

隧道的公网权威值必须**在启动时**进入 `/api` browser-trust 围栏——围栏只在 `dsh-web-app` 提供 `webRuntime` 时采样一次，运行期插件无法事后补挂。请用隧道权威值作为可信 host 启动（并按需开启远程 facade）：

```sh
dsh --profile web \
  --trusted-host tunnel.example.com:5953 \
  --allow-remote-privileged \
  --remote-auth
```

`--allow-remote-privileged` 让 loopback 锁定的方法（`settings`、`credentials`、原生对话框）也接受该可信权威值；`--remote-auth` 在非 loopback 的 `/api` 上强制配对会话门禁。使用 frp provider 时，Sakura Frp 边缘仅支持 HTTPS（对 `http://` 返回 501），因此手机应通过 `https://` 公网 URL 访问。

## Model Experience

间接地，通过插入的行生效：本 bundle 选择 web-app 表层所依赖的反向隧道 host 行，并固定浏览器目录组合，自身不贡献任何模型可见文本。

#### KV Cache effect

无直接影响；每条被插入的行由其所属包持有各自的影响。

## Known Limitations and Deferred Work

- **本 bundle 不对远程 surface 做认证**——`--remote-auth` 在 `dsh-web-app` 中启用配对门禁；若不启用，隧道会把 harness 暴露给任何能访问公网权威值的人。只应在你信任的隧道上运行。
- **信任围栏是启动时快照**——隧道权威值必须通过启动时的 `--trusted-host` 传入；本 bundle 无法在启动后从运行时补加。
