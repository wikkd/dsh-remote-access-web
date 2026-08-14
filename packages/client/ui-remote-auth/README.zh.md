# @deepseek-ai/dsh-client-ui-remote-auth

[English](README.md) | 中文

远程访问认证接缝的浏览器设置界面：展示当前配对/会话状态、提供可复制的一次性配对链接，并提供确认后的会话全部撤销。该 section 通过 `@deepseek-ai/dsh-client-connection` 网关与 `remoteAuth.*` RPC 域通信；实际的认证行为位于 host 插件 [`@deepseek-ai/dsh-remote-auth`](../../remote-access/remote-auth/README.md)。

该 section 注册进 `settings.section` slot，与 `@deepseek-ai/dsh-client-locale` 合并提供中/英文本，使用 `token: settings.remoteAuth` 作为 settings 命名空间。其控制器（`RemoteAuthController`）读取 `status()`、调用 `pair()` 铸造一次性配对码并从传入 origin 或配置的 `publicUrl` 构造绝对配对 URL，确认后调用 `revoke()`。

该 section 仅在远程 surface 相关时可见：手机经隧道完成配对。本地场景下 loopback 请求从不被强制认证，所以即使显示"未配对"也不影响本地 `dsh web` 使用。

## Model Experience

无，作为一个浏览器设置行：该 section 经连接网关驱动 host `remoteAuth.*` 变更并渲染结果，自身不贡献任何 prompt 或工具 schema。

#### KV Cache effect

无；该 section 不改变任何模型请求内容。

## Known Limitations and Deferred Work

- **只读状态、粗略控制**——该 section 仅呈现配对/撤销；按设备管理与细粒度会话控制超出范围。
- **无内联配对表单**——配对仍通过一键配对 URL 或 host 的最小 HTML 表单完成；面向移动端的精致内联流程是后续阶段。
