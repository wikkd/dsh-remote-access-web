# dsh-remote-access-web

[English](README.md) | 中文

DeepSeek Harness **远程访问插件族**的源码/发布仓库。本仓库托管两个包，让远程设备能通过一条受管理的反向隧道访问 `dsh --profile web` 部署。隧道后端由可配置的 `provider` 决定；随附的驱动是 **frp** provider，运行一个兼容 `frpc` 的客户端。

## 包含的包

| 包 | 作用 |
|---|---|
| [`@froststarinquire/dsh-remote-access`](packages/remote-access/remote-access/README.md) | 反向隧道 host 插件（`ctx.remoteAccess`）：管理并保活已配置 provider 的出站隧道子进程 |
| [`@froststarinquire/dsh-remote-access-web`](packages/bundle/remote-access-web/README.md) | 可安装的 profile bundle，在 `dsh-web-app` 之上挂载隧道行 |

## 上游

`dsh-remote-access` host 插件改编自 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 源码里的 **`@deepseek-ai/dsh-remote-access`**（MIT）。本仓库以 `@froststarinquire` scope 发布它，目标是与官方 harness 同款的 `@deepseek-ai/*` peer 包。`remote-auth` 配对插件及其设置界面不在本仓库重新发布——它们随官方 `dsh-web-app` 表层一起发布。

## 状态

源码与发布就绪。两个包都能独立构建（`pnpm install` 后 `pnpm pack`）。它们以 peer 依赖已发布的 `@deepseek-ai/*` harness 包（`cordis`、`dsh-subprocess`、`dsh-invariants`）。

## 远程工作区目录选择

可安装的 bundle 把目录选择器固定为 **`-browse`** 交互。`dsh-web-app` 默认用自适应选择器，只有在 loopback 绑定下才提供原生 OS 对话框；通过反向隧道时这个对话框不可用，远程操作者就没有办法添加工作区。该 bundle 禁用它，改挂应用内浏览对话框（host 后端 + 客户端界面）。

## 安装 bundle

在 DeepSeek Harness 主安装中执行：

```sh
dsh plugin --profile web add @froststarinquire/dsh-remote-access-web
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

本仓库由 AI 辅助开发。本处的代码、文档与列表文案由语言模型撰写或改写，再由人类维护者审阅。`dsh-remote-access` 逻辑本身源自上游 MIT 代码。部署到不受信任的环境前请先审阅源码。
