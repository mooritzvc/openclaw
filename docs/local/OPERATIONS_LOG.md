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

## 2026-02-28 19:58 UTC - CacheDebug rename and tilde path incident fix

- Operator: Codex
- Branch: `local/patches`
- Action:
  - renamed cache command wiring from `cache_report`/`CacheReport` to `cache_debug`/`CacheDebug`
  - updated command tests and registry wiring for `/cache_debug` and `/cache-debug`
  - fixed FS tool path normalization so `~` expands correctly for `read`/`write`/`edit`
  - added local incident report `INC-2026-02-28-02` for the tilde edit failure
- Result:
  - cache command rename is consistent across runtime + tests
  - edit calls using `~/.openclaw/...` no longer fail due to literal tilde paths
  - focused test suite passed for command + FS tool paths
- Follow-ups:
  - none

## 2026-02-28 18:33 UTC - Incident report capture and register bootstrap

- Operator: Codex
- Branch: `local/patches`
- Action:
  - created local incident register (`docs/local/INCIDENTS.md`)
  - wrote incident report for gateway restart churn (`INC-2026-02-28-01`)
  - linked incident register from local workflow doc
- Result:
  - incidents now tracked in-repo with root cause + guardrails
- Follow-ups:
  - keep incident register updated for future local ops disruptions

## 2026-02-28 18:10 UTC - Gateway restart guardrail cleanup

- Operator: Codex
- Branch: `local/patches`
- Action:
  - validated local patch branch state against `main`
  - updated local patch docs to current rebased commit hashes
  - added `scripts/local/restart-gateway-safe.sh` for gateway-only restarts
  - documented restart guardrail in `docs/local/LOCAL_PATCH_WORKFLOW.md`
- Result:
  - local patch register now matches current commit IDs
  - future gateway restarts can avoid full mac app rebuild path by default
- Follow-ups:
  - use `./scripts/local/restart-gateway-safe.sh` for gateway-only restart/testing

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
