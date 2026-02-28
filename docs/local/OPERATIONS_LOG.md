# Local Operations Log

Purpose: timestamped run log for upstream syncs, rebases, and notable local maintenance.

Use UTC timestamps.

## Template

```
## YYYY-MM-DD HH:MM UTC - <short title>
- Operator: <name>
- Branch: <branch>
- Action:
  - <what was run>
- Result:
  - <success/failure + key outputs>
- Follow-ups:
  - <next steps or none>
```

## Entries

## 2026-02-28 15:35 UTC - Baseline importer stability pass

- Operator: Codex
- Branch: `local/patches` (brain-tools project for importer fixes)
- Action:
  - validated and fixed Hevy incremental cursor replay
  - validated and fixed WHOOP cycle replay filtering
- Result:
  - Hevy watermark now advances and replay loop stopped
  - WHOOP no longer re-imports same cycle on repeated syncs
- Follow-ups:
  - run next upstream sync using `scripts/local/sync-local-patches.sh`
