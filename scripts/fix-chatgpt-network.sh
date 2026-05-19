#!/usr/bin/env bash
set -euo pipefail

PROXY_HOST="${PROXY_HOST:-127.0.0.1}"
PROXY_PORT="${PROXY_PORT:-7890}"
TARGET_URL="${TARGET_URL:-https://chatgpt.com/backend-api/codex/responses}"

services=()
while IFS= read -r service; do
  [[ -z "$service" ]] && continue
  [[ "$service" == "An asterisk (*) denotes that a network service is disabled." ]] && continue
  [[ "$service" == \** ]] && continue
  services+=("$service")
done < <(networksetup -listallnetworkservices)

echo "== Applying stable proxy settings =="
for service in "${services[@]}"; do
  if networksetup -getinfo "$service" 2>/dev/null | grep -q '^IP address:'; then
    echo "Configuring: $service"
    networksetup -setwebproxy "$service" "$PROXY_HOST" "$PROXY_PORT" >/dev/null
    networksetup -setsecurewebproxy "$service" "$PROXY_HOST" "$PROXY_PORT" >/dev/null
    networksetup -setproxyautodiscovery "$service" off >/dev/null
    networksetup -setautoproxystate "$service" off >/dev/null 2>&1 || true
  fi
done

echo "== Flushing DNS cache =="
dscacheutil -flushcache >/dev/null 2>&1 || true
killall -HUP mDNSResponder >/dev/null 2>&1 || true

echo "== Current proxy summary =="
scutil --proxy | awk '
  /HTTPProxy|HTTPPort|HTTPSProxy|HTTPSPort|ProxyAutoConfigEnable|ProxyAutoDiscoveryEnable/ {
    print "  " $0
  }
'

echo "== Local proxy listener =="
if lsof -nP -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -nP -iTCP:"$PROXY_PORT" -sTCP:LISTEN
else
  echo "No process is listening on $PROXY_HOST:$PROXY_PORT"
  echo "Start MiaoSS/Shadowrocket, connect a node, then run this script again."
  exit 2
fi

echo "== ChatGPT proxy test =="
curl --proxy "http://$PROXY_HOST:$PROXY_PORT" \
  --connect-timeout 8 \
  --max-time 20 \
  -sS \
  -o /dev/null \
  -w '  code=%{http_code} connect=%{time_connect} tls=%{time_appconnect} start=%{time_starttransfer} total=%{time_total}\n' \
  "$TARGET_URL"

echo "Done. Restart ChatGPT/Codex if it was already open before the fix."
