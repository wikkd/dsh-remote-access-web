# Install / 安装

This document is for end users who want to run the remote-access bundle. It covers
the prerequisites, the one-command install, and the post-install setup that makes
the tunnel actually work.

> 面向想使用本插件的最终用户。覆盖前置依赖、一键安装，以及让隧道真正工作的安装后配置。

## What this bundle does / 这个插件做什么

`@froststarinquire/dsh-remote-access-web` is a patch-layer bundle for the DSH
browser surface. When installed into a `web` profile it pulls in the
reverse-tunnel host plugin and pins the workspace directory picker to the
in-app browse dialog, so a remote device can reach the harness web service and
operate it from a browser.

> 这是 DSH 浏览器面的补丁型 bundle。安装进 `web` profile 后，它引入反向隧道 host 插件，
> 并把工作区目录选择器固定为应用内浏览对话框，使远程设备能访问并操作 harness web 服务。

## Prerequisites / 前置依赖

1. A working **DeepSeek Harness** installation (the `dsh` CLI). This bundle
   patches the official `dsh-web-app` surface, so the official harness must be
   installed first.
2. **Node.js ≥ 22.19** and **pnpm ≥ 11** (used by `dsh plugin` under the hood).
3. Network access to the npm registry.

> 1. 一份可用的 **DeepSeek Harness** 安装（`dsh` CLI）。本 bundle 补丁依赖官方 `dsh-web-app`
>    表层，因此必须先装官方 harness。
> 2. **Node.js ≥ 22.19** 与 **pnpm ≥ 11**（`dsh plugin` 底层依赖）。
> 3. 能访问 npm registry。

## Install the bundle / 安装 bundle

```sh
dsh plugin --profile web add @froststarinquire/dsh-remote-access-web
```

pnpm resolves and installs everything the bundle depends on, including the
scoped host plugin. If your profile is brand-new, `dsh plugin` initializes it
first.

> pnpm 会解析并安装 bundle 的全部依赖（含 scoped 的 host 插件）。若 profile 是全新的，
> `dsh plugin` 会先完成初始化。

## After install: supply the tunnel / 安装后：配置隧道

The plugin manages `frpc`, an `frpc`-compatible client. **It does not bundle
`frpc`**, and it never ships a default tunnel endpoint. You supply two things:
the `frpc` binary and your tunnel provider's credential.

> 插件负责管理 `frpc`（兼容 `frpc` 的客户端）。**它不内置 `frpc`，也从不自带默认隧道端点**。
> 你需要提供两样：`frpc` 可执行文件，以及你的隧道服务商凭据。

### 1. Get the `frpc` binary / 获取 `frpc` 可执行文件

Download `frpc` for your platform from [frp releases](https://github.com/fatedier/frp/releases)
(the project is MIT-licensed). For example, on macOS x64 it ships as
`frp_<version>_darwin_amd64.tar.gz`, containing `frpc`.

> 从 [frp releases](https://github.com/fatedier/frp/releases) 下载对应平台的 `frpc`。
> 例如 macOS x64 的包是 `frp_<version>_darwin_amd64.tar.gz`，内含 `frpc`。

Unpack it and note the absolute path to `frpc`.

> 解压后记下 `frpc` 的绝对路径。

### 2. Set the environment variables / 设置环境变量

The host plugin reads its config exclusively from the deployment environment —
never from literal config. Set these before launching `dsh`:

> host 插件只从部署环境读取配置，绝不使用写死的字面量。启动 `dsh` 前设置：

| Env / 变量 | Meaning / 含义 |
|---|---|
| `DSH_REMOTE_ACCESS_PROVIDER` | set to `frp` to enable the tunnel (`none` stays inert / 设为 `frp` 启用隧道，`none` 保持惰性) |
| `DSH_REMOTE_ACCESS_FRPC_PATH` | absolute path to your `frpc` binary / `frpc` 可执行文件的绝对路径 |
| `DSH_REMOTE_ACCESS_FRP_ARGS` | provider fast-start value for `-f`, i.e. `<access-secret>:<tunnel-id>` / `-f` 的快速启动值，形如 `<access-secret>:<tunnel-id>` |
| `DSH_REMOTE_ACCESS_PUBLIC_URL` | the public URL the tunnel exposes, e.g. `https://your-tunnel.example.com` / 隧道对外暴露的公网 URL |
| `DSH_REMOTE_ACCESS_CWD` | optional; working directory for the tunnel child / 可选；隧道子进程的工作目录 |

With `frp`, if `frpcPath` or `frpArgs` is missing the plugin refuses to
activate rather than silently running without a tunnel.

> 使用 `frp` 时，若缺少 `frpcPath` 或 `frpArgs`，插件会拒绝激活，而不是在无隧道的情况下静默运行。

### 3. Launch / 启动

Pass the tunnel authority to the `/api` trust fence **at boot** — the fence
samples it once. Replace `<your-tunnel-host:port>` with your own tunnel's
public authority:

> 隧道权威值必须在**启动时**传给 `/api` 信任围栏——围栏只采样一次。把以下
> `<your-tunnel-host:port>` 换成你自己的公网权威值：

```sh
DSH_REMOTE_ACCESS_PROVIDER=frp \
DSH_REMOTE_ACCESS_FRPC_PATH=/absolute/path/to/frpc \
DSH_REMOTE_ACCESS_FRP_ARGS='<access-secret>:<tunnel-id>' \
DSH_REMOTE_ACCESS_PUBLIC_URL=https://your-tunnel.example.com \
dsh --profile web \
  --trusted-host <your-tunnel-host:port> \
  --allow-remote-privileged \
  --remote-auth
```

`--trusted-host` admits the tunnel through the browser-trust fence;
`--allow-remote-privileged` lets the loopback-pinned methods (settings,
credentials) accept the trusted authority; `--remote-auth` enforces the
paired-session gate on non-loopback `/api`.

> `--trusted-host` 让隧道通过浏览器信任围栏；`--allow-remote-privileged` 让 loopback 锁定的
> 方法（settings、credentials）接受该可信权威值；`--remote-auth` 在非 loopback 的 `/api`
> 上强制配对会话门禁。

## Verify it works / 验证是否生效

Open the `DSH_REMOTE_ACCESS_PUBLIC_URL` in your remote browser. If you reach
the harness web UI, the tunnel is up. The phone drawer layout and the
remote-auth pairing flow come from the official `dsh-web-app` surface.

> 在远程浏览器打开 `DSH_REMOTE_ACCESS_PUBLIC_URL`。若能访问 harness web UI，
> 说明隧道已建立。手机抽屉布局与配对流程来自官方 `dsh-web-app` 表层。

## Troubleshooting / 常见问题

- **`dsh plugin add` fails to resolve `@froststarinquire/dsh-remote-access`** —
  you must publish the host plugin first (or install the repository locally).
- **Plugin stays inert (no tunnel spawns)** — `DSH_REMOTE_ACCESS_PROVIDER` is
  not `frp`, or `frpcPath`/`frpArgs` are unset. The plugin requires both under
  `frp`.
- **`frpc` not found at runtime** — `DSH_REMOTE_ACCESS_FRPC_PATH` is wrong.

> - **`dsh plugin add` 解析不到 `@froststarinquire/dsh-remote-access`** —— 需先发布 host
>   插件（或本地安装仓库）。
> - **插件保持惰性（无隧道子进程）** —— `DSH_REMOTE_ACCESS_PROVIDER` 未设为 `frp`，或
>   `frpcPath`/`frpArgs` 未设置。`frp` 模式下两者都必需。
> - **运行时找不到 `frpc`** —— `DSH_REMOTE_ACCESS_FRPC_PATH` 有误。
