# @deepseek-ai/dsh-remote-access

[English](README.md) | 中文

远程访问 host 插件：管理并保活一个出站反向隧道子进程，使远程设备能访问 harness web 服务。该插件持有单个 Sakura Frp（a tunnel provider）隧道进程，并对外发布隧道的可达性状态。

插件范围是**仅建立连接**——它负责建立并维持一个隧道，**不**在 harness web 服务前添加认证层。一旦 `--trusted-host` 把隧道权威值加入白名单，远程设备就能通过 `/api` 浏览器信任围栏；配对认证（[`@deepseek-ai/dsh-remote-auth`](../remote-auth/README.md)）才是证明调用者身份的独立一层。插件**在未配置真实隧道凭据时保持惰性**：其 `provider` 默认为 `none`，未配置的挂载不会启动任何东西。

## 生命周期

插件构造 `frpc -f <fast-start>` 的 `SubprocessSpawnSpec`，并通过 `ctx.subprocess`（共享执行世界的进程半）运行。keepalive 阶梯在子进程突然崩溃时以指数退避（上限 60 秒）重启；干净的零退出（刻意自停）会终止循环。`ctx.remoteAccess.status()` 报告当前可达性，`on(listener)` 订阅隧道生命周期事件（重新以 `remote-access/event` Cordis 事件发出）。销毁通过所属 fiber 的 effect disposer 处理。

`trustedAuthority()` 把配置的 `publicUrl` 规范化为 `dsh --profile web --trusted-host` 严格接受的 `<host[:port]>` 形式，使"通告公网 URL 的配置面"也能产生匹配的围栏条目。无法规范化为裸权威值的已配置公网 URL 会响亮失败，而非静默地把隧道遗留在围栏之后。

## 配置

```ts
export interface Config {
  provider: 'none' | 'frp'        // 'none' keeps the plugin inert
  frpcPath?: string               // absolute path to frpc (or compatible); required when provider is 'frp'
  frpArgs?: string                // Sakura fast-start value for -f, i.e. <访问密钥>:<隧道ID>
  cwd?: string                    // working directory for the tunnel child; defaults to the process cwd
  graceMs: number                 // grace period (ms) for terminate escalation; defaults to 5000
  publicUrl?: string              // public URL surfaced once the tunnel is up
}
```

当 `provider` 为 `frp` 但 `frpcPath`/`frpArgs` 缺失时，插件会响亮拒绝激活，而非静默地在无隧道下运行。部署层面的可变值（frpc 路径、快速启动密钥、公网 URL）经 Config 传入——绝不写死——因而可从 `cordis.patch.yml` 或环境变量更改。

## Model Experience

间接地，通过渲染隧道可达性的消费方界面生效：插件自身不注册任何 prompt、工具 schema 或结果。

#### KV Cache effect

无直接影响；插件的生命周期事件不会进入任何模型请求。

## Known Limitations and Deferred Work

- **仅连接、无认证**——插件开通隧道，但不限定谁能通过它访问 harness。配对认证（`@deepseek-ai/dsh-remote-access`）或可信隧道须另行叠加。
- **可信权威值必须在启动时传入**——`/api` 信任围栏只采样一次 `--trusted-host`；隧道的公网权威值必须是启动 flag，无法从本插件运行时补加。
- **单隧道子进程**——插件仅管理一个 Sakura 隧道；多隧道并发与非 Sakura provider 的支持超出本期范围。
