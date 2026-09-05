#!/usr/bin/env bash

set -u

PROJECT_DIR="/home/cport/Git/Storyboard_Lite"
export PATH="/home/cport/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"

# KDE may start a clicked shell script without a terminal. Reopen it in Konsole
# so startup messages and useful errors remain visible.
if [[ "${1:-}" != "--in-terminal" && ! -t 1 ]]; then
  exec /usr/bin/konsole --workdir "$PROJECT_DIR" -e /usr/bin/bash "$0" --in-terminal
fi

cd "$PROJECT_DIR" || {
  echo "Frameforge project folder was not found: $PROJECT_DIR"
  read -r -p "Press Enter to close..."
  exit 1
}

if [[ ! -d node_modules ]]; then
  echo "Installing Frameforge dependencies for the first run..."
  /usr/bin/npm install || {
    echo
    echo "Dependency installation failed. Check your internet connection and try again."
    read -r -p "Press Enter to close..."
    exit 1
  }
fi

echo "Starting Frameforge..."
if /usr/bin/curl -fsS --max-time 2 http://127.0.0.1:1420/ 2>/dev/null | /usr/bin/grep -q '<title>Frameforge</title>'; then
  echo "Using the existing Frameforge background server..."
  /usr/bin/npm run dev:electron
else
  /usr/bin/npm run dev
fi
status=$?

if (( status != 0 )); then
  echo
  echo "Frameforge stopped with an error (exit code $status)."
  read -r -p "Press Enter to close..."
fi

exit "$status"
