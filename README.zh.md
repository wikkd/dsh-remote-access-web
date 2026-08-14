# dsh-remote-access-web

[English](README.md) | 中文

DeepSeek Harness **远程访问插件族**的独立源码/发布仓库。本仓库托管这些包：让远程设备能通过一条受管理的反向隧道访问 `dsh --profile web` 部署，外加认证配对门禁及其浏览器设置界面。隧道后端由可配置的 `provider` 决定；随附的驱动是 **frp** provider，运行一个兼容 `frpc` 的客户端。

## 包含的包

| 包 | 作用 |
|---|---|
| [`@deepseek-ai/dsh-remote-access`](packages/remote-access/remote-access/README.md) | 反向隧道 host 插件（`ctx.remoteAccess`）：管理并保活已配置 provider 的出站隧道子进程 |
| [`@deepseek-ai/dsh-remote-auth`](packages/remote-access/remote-auth/README.md) | 配对认证 host 插件：种子令牌 + 一次性设备配对，门禁非 loopback 的 `/api` |
| [`@deepseek-ai/dsh-client-ui-remote-auth`](packages/client/ui-remote-auth/README.md) | 配对 seam 的浏览器设置界面 |
| [`@deepseek-ai/dsh-remote-access-web`](packages/bundle/remote-access-web/README.md) | 可安装的 profile bundle，在 `dsh-web-app` 之上挂载隧道行 |

## 状态

源码与发布就绪。这些包**以 peer 依赖**已发布的 `@deepseek-ai/*` harness 包（`cordis`、`dsh-subprocess`、`dsh-client-*` web 栈、`web-react`、React）。这些 peer 随 DeepSeek Harness 发布一起上 npm；本仓库要做独立的 `pnpm install`/构建，需要它们在 `0.1.0` 线发布。在那之前，本仓库承载的是源码与 CI 就绪结构，而非自包含的构建产物。

## 远程工作区目录选择

可安装的 bundle 把目录选择 seam 固定为应用内 **`-browse`** 交互。`dsh-web-app` 挂载自适应选择器，一旦 harness 只绑定 loopback（恰恰是反向隧道看到的情形），它就会解析为原生 OS 对话框，远程操作者因此无法弹出本地对话框，**Add workspace** 入口也不会渲染。该 bundle 禁用那行选择器，改挂应用内目录对话框（host 后端 + 客户端界面），让远程操作者可以添加工作区。

## 安装 bundle

在 DeepSeek Harness 主安装中执行：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-remote-access-web
```

然后在启动时用它把你自己的隧道权威值加入白名单（把 `<your-tunnel-host:port>` 换成你的公网地址）：

```sh
dsh --profile web \
  --trusted-host <your-tunnel-host:port> \
  --allow-remote-privileged \
  --remote-auth
```

完整启动契约见 bundle 的 [`README`](packages/bundle/remote-access-web/README.md)。

## AIGC 声明

本仓库由 AI 辅助开发。代码、文档与列表描述均由大语言模型在人类维护者的协作下生成或改写。部署到不受信任的环境前请先审阅源码。
