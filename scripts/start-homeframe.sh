#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HOMEFRAME_DIR:-$HOME/homeframe}"
PORT="${HOMEFRAME_PORT:-3000}"
LOG_FILE="$APP_DIR/homeframe.log"
CLOSE_FILE="${XDG_RUNTIME_DIR:-/tmp}/homeframe-close-${UID:-$(id -u)}"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null
fi

if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 22 ]]; then
  echo "HomeFrame requires Node.js 22 or newer."
  echo "Install Node 22 with nvm, then launch HomeFrame again."
  exit 1
fi

rm -f "$CLOSE_FILE"
export HOMEFRAME_CLOSE_FILE="$CLOSE_FILE"

cd "$APP_DIR"

if [[ ! -f .env.local ]]; then
  echo "Missing $APP_DIR/.env.local"
  echo "Copy .env.example to .env.local and add the private credentials first."
  exit 1
fi

if [[ ! -f dist/server/wrangler.json ]]; then
  npm run build
fi

node ./scripts/configure-runtime.mjs
node ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --port "$PORT" --ip 127.0.0.1 >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
BROWSER_PID=""
WATCHDOG_PID=""

cleanup() {
  if [[ -n "$WATCHDOG_PID" ]]; then
    kill "$WATCHDOG_PID" 2>/dev/null || true
  fi
  if [[ -n "$BROWSER_PID" ]]; then
    kill "$BROWSER_PID" 2>/dev/null || true
  fi
  kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$CLOSE_FILE"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if curl --silent --fail "http://127.0.0.1:$PORT/" >/dev/null; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "HomeFrame stopped before becoming ready. See $LOG_FILE"
    exit 1
  fi
  sleep 1
done

if ! curl --silent --fail "http://127.0.0.1:$PORT/" >/dev/null; then
  echo "HomeFrame did not become ready. See $LOG_FILE"
  exit 1
fi

if [[ -x /usr/lib/chromium/chromium ]]; then
  BROWSER="/usr/lib/chromium/chromium"
else
  BROWSER="$(command -v chromium-browser || command -v chromium || true)"
fi
if [[ -z "$BROWSER" ]]; then
  echo "Chromium is not installed. HomeFrame is running at http://127.0.0.1:$PORT/"
  wait "$SERVER_PID"
  exit 0
fi

"$BROWSER" --kiosk --app="http://127.0.0.1:$PORT/" --user-data-dir="$APP_DIR/.chromium-profile" --noerrdialogs --disable-infobars &
BROWSER_PID=$!

(
  while kill -0 "$BROWSER_PID" 2>/dev/null && [[ ! -f "$CLOSE_FILE" ]]; do
    sleep 0.25
  done

  if [[ -f "$CLOSE_FILE" ]]; then
    kill "$BROWSER_PID" 2>/dev/null || true
  fi
) &
WATCHDOG_PID=$!

wait "$BROWSER_PID" 2>/dev/null || true
