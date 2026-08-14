#!/usr/bin/env bash
# Launch dsh web so the browser-trust fence admits the Sakura tunnel authority.
#
# The /api trust fence rejects any request whose Host is neither loopback nor
# a declared --trusted-host (HTTP 403 -> "transport failure ... HTTP 403" in
# the GUI, e.g. /api/agentPreset.list). The tunnel forwards the phone's Host
# ("tunnel.example.com:5953") verbatim, so every /api call 403s until the authority
# is whitelisted. Passing it here is the built-in, load-time fix (the fence
# captures the list once at boot; a runtime plugin cannot retrofit it).
#
# The settings/credentials/native-dialog methods are pinned to loopback even
# with --trusted-host; --allow-remote-privileged opts them into the trusted
# authority too, so the phone's "预设/权限/模型" page (settings.describe) stops
# 403ing. This exposes the configuration plane to anyone who can reach the
# tunnel, which has no authentication layer yet — enable it only on a tunnel
# you trust.
#
# https is required: the tunnel enforces TLS (http:// returns Sakura's 501
# "Not Implemented" page). Access the phone UI at the https URL below.
#
# Adjust TUNNEL_AUTHORITY to your public endpoint host[:port].
set -euo pipefail

PORT="${PORT:-3080}"
TUNNEL_AUTHORITY="${TUNNEL_AUTHORITY:-tunnel.example.com:5953}"
# 默认开启远程认证：非 loopback 客户端必须先配对拿到会话 Cookie，否则 /api 返回 401。
REMOTE_AUTH="${REMOTE_AUTH:-1}"
# 仅当远程认证开启时才把 loopback 锁定的特权方法（settings/credentials/原生对话框）开放给隧道。
ALLOW_REMOTE_PRIVILEGED="${ALLOW_REMOTE_PRIVILEGED:-$([ "$REMOTE_AUTH" = "1" ] && echo 1 || echo 0)}"

echo "dsh web on 127.0.0.1:${PORT}"
echo "phone URL : https://${TUNNEL_AUTHORITY}"
echo "trusted   : --trusted-host ${TUNNEL_AUTHORITY}"
echo "privileged: --allow-remote-privileged=${ALLOW_REMOTE_PRIVILEGED}"
echo "remote-auth: ${REMOTE_AUTH}"

exec dsh web \
  --port "${PORT}" \
  --trusted-host "${TUNNEL_AUTHORITY}" \
  "$([ "${ALLOW_REMOTE_PRIVILEGED}" = "1" ] && echo "--allow-remote-privileged")" \
  "$([ "${REMOTE_AUTH}" = "1" ] && echo "--remote-auth")"
