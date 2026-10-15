#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HOMEFRAME_DIR:-$HOME/homeframe}"
DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
DESKTOP_FILE="$DESKTOP_DIR/homeframe.desktop"
ICON_PATH="$APP_DIR/public/homeframe-icon.svg"
START_SCRIPT="$APP_DIR/scripts/start-homeframe.sh"

cd "$APP_DIR"
npm ci
npm run build

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo "Created $APP_DIR/.env.local. Add your credentials before launching HomeFrame."
fi

mkdir -p "$DESKTOP_DIR"
cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=HomeFrame
Comment=Home, commute, weather, transit, and calendar dashboard
Exec=$START_SCRIPT
Icon=$ICON_PATH
Terminal=false
Categories=Utility;
EOF

chmod +x "$START_SCRIPT" "$DESKTOP_FILE"
echo "Installed $DESKTOP_FILE"
echo "HomeFrame directory: $APP_DIR"
