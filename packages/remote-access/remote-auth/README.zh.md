# @deepseek-ai/dsh-remote-auth

[English](README.md) | 中文

远程访问认证 host 插件：种子令牌 + 一次性设备配对流程，发放短期会话 Cookie，为 loopback 以外的客户端把关 harness `/api` 界面。

harness `/api` 浏览器信任围栏（`@deepseek-ai/dsh-client-connection`）是 DNS-rebinding 与跨站防御，明确不是认证——它只问请求的 Host 是否是部署所服务的，从不问调用者是不是拥有这台机器的人。因此，一旦 `--trusted-host` 把隧道权威值加入白名单，经公网隧道到达的手机就通过围栏，并能访问整个界面：会话、bash，以及在 `--allow-remote-privileged` 下的 settings、credentials 与原生对话框。本插件通过让非 loopback 调用者先证明身份来弥合这个缺口。

## 生命周期

启动时插件在 `<harness home>/remote-auth.seed` 加载或生成 32 字节种子令牌（仅属主 `0600`，原子重命名）。配置的 `seedPath` 会覆盖该位置。种子永不离机，也绝不写入会话日志或任何模型可见界面。

配对是两步交换：

1. 部署方从种子与新随机 nonce 派生一次性配对码（`derivePairingCode`），并在启动 URL 行等处将其表面化。`pair()` 调用者可请求自定义会话时长，宿主钳制到部署边界（60 秒至 30 天），并在兑换时应用于签发的会话；省略请求使用配置的 `sessionTtlMs`。
2. 远程设备向 `/__remote/login` 或 `/__remote/pair?code=…` 提交该码。正确码被一次性消费（绝不可复用），服务器以 `302` 跳转 `/` 并设置 `HttpOnly; SameSite=Lax` 会话 Cookie，把设备的 `sec-ch-ua-platform`/`user-agent` 指纹记为唯一的活动远程设备。

此后，只有携带有效、未过期且设备匹配的会话 Cookie 的非 loopback `/api` 请求才会被放行。loopback 请求从不被强制认证，本地 `dsh web` 使用不受影响。

`revoke()` 使所有已签发会话失效并清除配对；`status()` 报告是否已配对以及活动会话的**实际剩余**时长。

服务被两个界面消费：
- **`/api` 门禁**（`dsh-client-connection`）读取结构化的 `verify()` 以放行或 401。
- **管理界面**（`remoteAuth.*` RPC 域 + `@deepseek-ai/dsh-client-ui-remote-auth` 设置页）调用 `pair()` 铸造一次性配对码、用 `loginUrl(code)` 构造手机一键配对的绝对 URL、读取 `status()`，并调用 `revoke()` 强制设备下线。

`loginUrl(code, origin?)` 优先使用显式提供的 origin——例如用户填写的内网穿透地址——其次使用配置的 `publicUrl`；两者都回退到 `https://localhost`。缺少 scheme 的裸 origin 视为 `https`，并去除尾部斜杠。`status()` 额外报告生效的 `publicUrl`，使设置界面可预填隧道地址字段。

## 配置

```ts
export interface Config {
  seedPath?: string   // absolute seed file path; defaults to <harness home>/remote-auth.seed
  dshHome?: string    // harness home when seedPath is omitted; defaults to ~/.dsh
  enabled?: boolean   // enforce authentication; defaults to false (inert mount)
  sessionTtlMs?: number // default session lifetime; defaults to 24 hours (a pair() may request a custom, clamped lifetime)
  publicUrl?: string   // public origin (scheme://host[:port]) for the pairing login URL
}
```

`enabled` 默认 `false`，使已挂载行在部署显式选择前保持惰性。为 `false` 时 `verify()` 放行所有请求——与认证前行为一致——配对路由仍会注册但不会签发任何会话。

## 安全属性

- 种子与会话令牌为 `crypto.randomBytes` 生成的 32 字节熵，用 `crypto.timingSafeEqual` 比较。
- 配对可请求自定义会话时长；宿主把任意请求钳制到 60 秒 – 30 天，调用者无法铸造永不过期或亚分钟的会话。部署配置的 `sessionTtlMs` 原样通过。
- 配对码一次性、单次使用；错误码保留余码以便操作者重试，而限流与设备绑定留给网关考虑。
- 会话 Cookie 为 `HttpOnly`、`SameSite=Lax`、短期；省略 `Secure` 是因为隧道是 TLS 终结者、harness 在 loopback 回答隧道的明文转发。
- 一个活动远程设备：新的成功配对替换旧会话。
- 认证分层置于信任围栏**之后**、而非替代它——两者都必须通过。

## Model Experience

None, as 一个 host 侧网络边界服务：插件不产生任何会话事件与模型可见文本；无论认证是否启用，模型上下文都不变。

#### KV Cache effect

None；插件不改变任何模型请求内容，也不向任何请求贡献 token。

## Known Limitations and Deferred Work

- **单设备**——配对新设备会替换旧设备；并发远程设备超出范围。
- **此处无数率限制**——暴力破解配对码由码的 96 位有效熵与一次性使用缓解，但请求节流留给前置层。
- **Cookie 未设置 `Secure`**——隧道在到达 harness 的 loopback 监听前终结 TLS，因此 Cookie 仅在机器本地一跳上以明文传输。直接暴露 harness 全接口绑定的部署必须自行添加 `Secure` 与 TLS 终结。
- **无登录 UI**——配对页是最小 HTML 表单；精致的移动登录界面属于后续阶段。
