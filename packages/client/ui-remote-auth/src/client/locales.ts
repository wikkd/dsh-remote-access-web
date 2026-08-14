/** Locale bundles for the remote-access settings section. */

/** Locale keys this surface renders. */
export type RemoteAuthKey =
  | 'nav' | 'sectionIntro'
  | 'pairedStatus' | 'unpairedStatus' | 'sessionTtl'
  | 'ttlLabel' | 'unitMinute' | 'unitHour' | 'unitDay' | 'ttlHint'
  | 'tunnelLabel' | 'tunnelPlaceholder' | 'tunnelHint'
  | 'generate' | 'generating' | 'pairLinkLabel' | 'copy' | 'copied'
  | 'revoke' | 'revokeTitle' | 'revokeDescription' | 'revokeConfirm' | 'revoking'
  | 'cancel' | 'close' | 'retry' | 'error' | 'loading'

/** English copy. */
export const en: Record<RemoteAuthKey, string> = {
  nav: 'Remote access',
  sectionIntro:
    'Pair a phone to reach this deployment from outside its network. '
    + 'Choose how long the session lasts, generate a one-time link, open it on the device, and revoke sessions at any time.',
  pairedStatus: 'A device is paired.',
  unpairedStatus: 'No device is paired.',
  sessionTtl: 'Session remaining',
  ttlLabel: 'Session lifetime',
  unitMinute: 'minutes',
  unitHour: 'hours',
  unitDay: 'days',
  ttlHint: 'Applies to the next session issued when a device pairs.',
  tunnelLabel: 'Tunnel address',
  tunnelPlaceholder: 'https://tunnel.example.com:5953',
  tunnelHint: 'The public address the phone reaches this deployment through. Leave blank to use the derived address.',
  generate: 'Generate pairing link',
  generating: 'Generating…',
  pairLinkLabel: 'Pairing link',
  copy: 'Copy',
  copied: 'Copied',
  revoke: 'Revoke all sessions',
  revokeTitle: 'Revoke all remote sessions?',
  revokeDescription:
    'Every paired device is signed out and must pair again with a fresh code. This machine stays reachable locally.',
  revokeConfirm: 'Revoke',
  revoking: 'Revoking…',
  cancel: 'Cancel',
  close: 'Close',
  retry: 'Retry',
  error: 'Could not load remote access.',
  loading: 'Loading…',
}

/** Simplified Chinese copy. */
export const zh: Record<RemoteAuthKey, string> = {
  nav: '远程访问',
  sectionIntro: '让手机在外部网络访问此部署。选择会话时长，生成一次性链接，在目标设备上打开即可配对；可随时撤销所有会话。',
  pairedStatus: '已有一台设备配对。',
  unpairedStatus: '尚未配对任何设备。',
  sessionTtl: '会话剩余',
  ttlLabel: '会话时长',
  unitMinute: '分钟',
  unitHour: '小时',
  unitDay: '天',
  ttlHint: '设备配对后，新签发的会话按此时长生效。',
  tunnelLabel: '内网穿透地址',
  tunnelPlaceholder: 'https://tunnel.example.com:5953',
  tunnelHint: '手机访问此部署的公网地址。留空则使用自动派生的地址。',
  generate: '生成配对链接',
  generating: '正在生成…',
  pairLinkLabel: '配对链接',
  copy: '复制',
  copied: '已复制',
  revoke: '撤销所有会话',
  revokeTitle: '撤销所有远程会话？',
  revokeDescription: '所有已配对设备将被登出，需重新通过新链接配对。本机仍可在本地网络访问。',
  revokeConfirm: '撤销',
  revoking: '正在撤销…',
  cancel: '取消',
  close: '关闭',
  retry: '重试',
  error: '无法加载远程访问状态。',
  loading: '正在加载…',
}

/** Format a ttl in seconds as human copy like "2 小时 3 分钟". */
export function formatTtl(seconds: number): string {
  if (seconds <= 0) return '0 秒'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  if (minutes > 0) return `${minutes} 分钟 ${rest} 秒`
  return `${rest} 秒`
}
