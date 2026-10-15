#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HOMEFRAME_DIR:-$HOME/homeframe}"
PORT="${HOMEFRAME_PORT:-3000}"
LOG_FILE="$APP_DIR/homeframe.log"

cd "$APP_DIR"

if [[ ! -f .env.local ]]; then
  echo "Missing $APP_DIR/.env.local"
  echo "Copy .env.example to .env.local and add the private credentials first."
  exit 1
fi

if [[ ! -f dist/server/wrangler.json ]]; then
  npm run build
fi

node --env-file=.env.local ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --port "$PORT" --ip 127.0.0.1 >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
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

BROWSER="$(command -v chromium-browser || command -v chromium || true)"
if [[ -z "$BROWSER" ]]; then
  echo "Chromium is not installed. HomeFrame is running at http://127.0.0.1:$PORT/"
  wait "$SERVER_PID"
  exit 0
fi

"$BROWSER" --kiosk --app="http://127.0.0.1:$PORT/" --noerrdialogs --disable-infobars
