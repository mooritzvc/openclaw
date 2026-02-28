#!/usr/bin/env bash
set -euo pipefail

# Sync workflow for this repo's local customization model:
# - main mirrors upstream (origin/main)
# - local/patches carries local commits

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit/stash first."
  exit 1
fi

echo "==> Updating main from origin/main (ff-only)"
git checkout main >/dev/null
git fetch origin
git pull --ff-only origin main

echo "==> Rebasing local/patches onto updated main"
git checkout local/patches >/dev/null
git rebase main

echo "==> Divergence summary (main...local/patches)"
git rev-list --left-right --count main...local/patches
echo "Done. If all looks good, push: git push myfork local/patches --force-with-lease"
