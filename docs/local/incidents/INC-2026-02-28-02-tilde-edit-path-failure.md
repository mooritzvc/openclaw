# Incident: Edit Tool Failed On `~/.openclaw/workspace/to-do.md`

- Incident ID: `INC-2026-02-28-02`
- Date: `2026-02-28`
- Severity: `SEV-4`
- Status: Resolved
- Branch context: `local/patches` on top of pristine `main`

## Summary

A file edit call targeting `~/.openclaw/workspace/to-do.md` failed with:

- `⚠️ 📝 Edit: in ~/.openclaw/workspace/to-do.md (...) failed`

The failure was caused by path normalization not expanding `~` for `edit`/`write`/`read` tool params before filesystem resolution.

## Impact

- One local workspace edit operation failed.
- No data loss.
- No gateway outage.

## Root Cause

`normalizeToolParams` handled alias keys (`file_path` -> `path`, `old_string` -> `oldText`, etc.) but did not normalize path strings that start with `~`.

As a result, filesystem operations received a literal tilde path. In Node path resolution, that behaves like a relative path segment, not home expansion.

## Fix Applied

Code:

- Added tilde-aware path normalization for `path` and `file_path` in:
  - `src/agents/pi-tools.read.ts`
- Uses `resolveUserPath(...)` when the path begins with `~`.

Tests:

- Added regression coverage for `read`/`write`/`edit` on tilde paths:
  - `src/agents/pi-tools.workspace-paths.test.ts`

Validation:

- `pnpm test -- src/agents/pi-tools.workspace-paths.test.ts src/agents/pi-tools.workspace-only-false.test.ts`
- `pnpm test -- src/auto-reply/reply/commands-cache-debug.test.ts src/auto-reply/reply/commands.test.ts src/auto-reply/commands-registry.test.ts src/auto-reply/commands-args.test.ts`

## Prevention

1. Keep tilde-path regression test in the default local validation set for FS tools.
2. Prefer absolute paths or workspace-relative paths in prompts/tool calls when possible.
3. Keep local patch changes scoped (`local/patches` only) and covered by focused tests.
