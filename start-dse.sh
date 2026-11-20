#!/usr/bin/env bash
# Starts the web server if needed, then opens it; --no-browser (used at login) only starts it.
set -u
WEB="$HOME/Projects/dse/web"
URL="http://localhost:3000"
LOG_DIR="$HOME/.cache/dse-helper"
LOG="$LOG_DIR/server.log"

# A login session does not load the shell profile, so node from nvm is not on PATH yet.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null

if ! ss -ltn | grep -q ':3000 '; then
  mkdir -p "$LOG_DIR"
  cd "$WEB" || exit 1
  setsid nohup npx next dev -H 0.0.0.0 -p 3000 >"$LOG" 2>&1 </dev/null &
fi

[ "${1:-}" = "--no-browser" ] && exit 0

for _ in $(seq 1 90); do
  curl -s -o /dev/null --max-time 2 "$URL" && break
  sleep 2
done
xdg-open "$URL" >/dev/null 2>&1 &
