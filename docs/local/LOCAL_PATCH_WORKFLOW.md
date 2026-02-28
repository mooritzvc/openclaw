# Local Patch Workflow (OpenClaw)

This repo now uses a two-branch model to keep upstream updates safe.

## Branch model

- `main`: pristine upstream mirror (tracks `origin/main` only, no local custom commits)
- `local/patches`: your local customizations on top of `main`

Current state is tracked live with:

```bash
git checkout local/patches
git rev-list --left-right --count main...local/patches
```

## Why this is safer

- You can always trust `main` as a clean baseline.
- All custom risk is isolated in `local/patches`.
- Updates become a repeatable process instead of ad-hoc merge chaos.

## Standard update workflow

1. Update upstream baseline:

```bash
cd /Users/openclaw/openclaw
git checkout main
git fetch origin
git pull --ff-only origin main
```

2. Replay local patches onto fresh upstream:

```bash
git checkout local/patches
git rebase main
```

3. If conflicts happen:

```bash
# edit conflicted files
git add <resolved-files>
git rebase --continue
# or abort:
# git rebase --abort
```

4. Run focused validation:

```bash
npm run test:fast -- src/auto-reply/reply/commands-cache-report.test.ts src/sessions/model-overrides.test.ts
```

5. Run OpenClaw from `local/patches` for your customized behavior.

Shortcut script:

```bash
./scripts/local/sync-local-patches.sh
```

Gateway-only restart (recommended for local patch validation):

```bash
./scripts/local/restart-gateway-safe.sh
```

Avoid `scripts/restart-mac.sh` for routine gateway restarts. That path rebuilds the macOS app and can fail on local Swift/toolchain issues unrelated to gateway logic changes.

## Safety rules

- Do not commit local custom changes to `main`.
- Keep commits small and feature-scoped.
- Before risky rebases, create a safety branch:

```bash
git branch backup/pre-rebase-$(date +%Y%m%d-%H%M)
```

## Local customization changelog

Canonical register:

- [PATCH_REGISTER.md](/Users/openclaw/openclaw/docs/local/PATCH_REGISTER.md)

Operations/run log:

- [OPERATIONS_LOG.md](/Users/openclaw/openclaw/docs/local/OPERATIONS_LOG.md)

Incident register:

- [INCIDENTS.md](/Users/openclaw/openclaw/docs/local/INCIDENTS.md)

### Commit: `0309e1956`

- Message: `feat(auto-reply): add deterministic cache report command`
- Purpose:
  - Add deterministic `/cache_report` command based on session JSONL usage
  - Report input/output/cache read/cache write/uncached input/hit rate
  - Add cache-break candidate and recent-turn snapshots
  - Rotate/reset session boundary on model switch to keep stats clean
- Files:
  - `src/auto-reply/reply/commands-cache-report.ts`
  - `src/auto-reply/reply/commands-cache-report.test.ts`
  - `src/auto-reply/commands-registry.data.ts`
  - `src/auto-reply/reply/commands-core.ts`
  - `src/auto-reply/reply/directive-handling.impl.ts`
  - `src/auto-reply/reply/directive-handling.persist.ts`
  - `src/sessions/model-overrides.ts`
  - `src/sessions/model-overrides.test.ts`
  - `src/agents/pi-embedded-runner/cache-ttl.ts`
  - `src/agents/pi-embedded-runner/extra-params.ts`

### Commit: `0dfeed1ae`

- Message: `test(auto-reply): decouple command harness from full command registry`
- Purpose:
  - Prevent optional Discord voice dependency import chain from breaking focused unit tests
- File:
  - `src/auto-reply/reply/commands.test-harness.ts`

### Commit: `17dfc6cfe`

- Message: `fix(rebase): remove stray conflict marker in extra params`
- Purpose:
  - Keep local patch layer clean and rebase-safe after conflict resolution
- File:
  - `src/agents/pi-embedded-runner/extra-params.ts`

### Commit: `4fa757d71`

- Message: `fix(auto-reply): require slash command for cache report`
- Purpose:
  - Prevent plain text `cache report` from triggering command execution
  - Limit cache report trigger to explicit slash commands (`/cache_report`, `/cache-report`)
- Files:
  - `src/auto-reply/reply/commands-cache-report.ts`
  - `src/auto-reply/reply/commands-cache-report.test.ts`

## Optional but recommended: private fork

For long-term cleanliness, keep a private fork remote and push `local/patches` there:

```bash
# example
# git remote add myfork <your-private-fork-url>
# git push -u myfork local/patches
```

Benefits:

- Off-machine backup of local customizations
- Easy rollback if local machine state changes
- Clear separation of upstream (`origin`) vs your custom branch (`myfork`)

## GitHub remote setup status (this machine)

Current:

- `origin` is configured (`openclaw/openclaw`)
- `myfork` is configured (`mooritzvc/openclaw`)
- `local/patches` is pushed and tracks `myfork/local/patches`

What you need if re-running setup on another machine:

- A GitHub token with repository write/admin capability for your account
  - for classic PAT: `repo`
  - for fine-grained token: repository `Administration (write)` + `Contents (read)` for fork/create operations

One-time commands:

```bash
cd /Users/openclaw/openclaw
export GH_TOKEN=<token-with-repo-create-permission>
gh repo fork openclaw/openclaw --clone=false --remote=false
git remote add myfork https://github.com/<your-user>/openclaw.git
git push -u myfork local/patches
```

After that, normal push target for local work:

```bash
git checkout local/patches
git push myfork local/patches
```
