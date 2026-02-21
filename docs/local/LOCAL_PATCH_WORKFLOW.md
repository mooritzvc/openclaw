# Local Patch Workflow (OpenClaw)

This repo now uses a two-branch model to keep upstream updates safe.

## Branch model

- `main`: pristine upstream mirror (tracks `origin/main` only, no local custom commits)
- `local/patches`: your local customizations on top of `main`

Current state (2026-02-21):
- `main` at `b703ea367` (matches `origin/main`)
- `local/patches` is 2 commits ahead of upstream

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

## Safety rules

- Do not commit local custom changes to `main`.
- Keep commits small and feature-scoped.
- Before risky rebases, create a safety branch:
```bash
git branch backup/pre-rebase-$(date +%Y%m%d-%H%M)
```

## Local customization changelog

### Commit: `e2ad2ee7e`
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

### Commit: `706f086eb`
- Message: `test(auto-reply): decouple command harness from full command registry`
- Purpose:
  - Prevent optional Discord voice dependency import chain from breaking focused unit tests
- File:
  - `src/auto-reply/reply/commands.test-harness.ts`

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

