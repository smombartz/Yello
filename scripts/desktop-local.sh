#!/usr/bin/env bash
# Run the desktop app against a local server instead of the hosted site, to try
# changes before deploying:
#   1. builds the frontend (the local backend serves frontend/dist)
#   2. starts the backend on port 3456, or reuses one that's already running
#   3. opens the desktop app pointed at it
# Quitting the desktop app stops the backend this script started.
#
# Usage: scripts/desktop-local.sh [--skip-build]     (or: npm run electron:local)
# PORT=4000 scripts/desktop-local.sh uses another port.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3456}"
URL="http://localhost:$PORT"
SKIP_BUILD=false
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=true

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }
server_up() { curl -sf -o /dev/null --max-time 2 "$URL/health"; }

if $SKIP_BUILD; then
  say "Skipping the frontend build"
else
  say "Building the frontend"
  (cd "$ROOT/frontend" && npm run build)
fi

BACKEND_PID=""
stop_backend() {
  if [[ -n "$BACKEND_PID" ]]; then
    say "Stopping the backend"
    # The backend runs in its own process group (set -m), so this also stops tsx's child process
    kill -TERM -- "-$BACKEND_PID" 2>/dev/null || true
  fi
}
trap stop_backend EXIT
trap 'exit 130' INT TERM

if server_up; then
  say "Using the server already running at $URL"
else
  say "Starting the backend at $URL"
  set -m
  (cd "$ROOT/backend" && PORT="$PORT" exec npm run dev) &
  BACKEND_PID=$!
  set +m
  for _ in $(seq 1 60); do
    server_up && break
    kill -0 "$BACKEND_PID" 2>/dev/null || { echo "The backend exited before it was ready." >&2; exit 1; }
    sleep 1
  done
  server_up || { echo "The backend didn't answer at $URL/health within 60 seconds." >&2; exit 1; }
fi

# A server started before frontend/dist existed doesn't serve the app
if ! curl -sf --max-time 2 "$URL/" | grep -qi '<html'; then
  echo "Warning: $URL/ doesn't return the app. If that server was already running, restart it so it serves frontend/dist." >&2
fi

say "Opening the desktop app against $URL"
(cd "$ROOT/electron" && YELLO_URL="$URL" npm run dev)
