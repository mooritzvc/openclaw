#!/usr/bin/env bash
set -euo pipefail

# Safe gateway-only restart path for local patch validation.
# This intentionally avoids scripts/restart-mac.sh (full app rebuild).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENTRY="dist/index.js"
if [[ ! -f "$ENTRY" ]]; then
  echo "ERROR: $ENTRY not found. Run 'pnpm build' first."
  exit 1
fi

echo "==> Stopping existing gateway (safe if already stopped)"
node "$ENTRY" gateway stop >/dev/null 2>&1 || true

echo "==> Ensuring gateway LaunchAgent is installed"
node "$ENTRY" daemon install --force --runtime node >/dev/null

echo "==> Restarting gateway LaunchAgent"
node "$ENTRY" daemon restart

echo "==> Listener check (:18789)"
lsof -iTCP:18789 -sTCP:LISTEN | head -n 5 || true

echo "==> launchctl label check"
launchctl print gui/"$UID" 2>/dev/null | grep -n "ai\\.openclaw\\.gateway" || true

echo "==> Done"
