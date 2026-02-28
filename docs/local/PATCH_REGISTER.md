# Local Patch Register

Purpose: authoritative list of all local-only changes that live on `local/patches`.

How to use:

1. Add one row for each local patch commit.
2. Keep scope and rollback instructions short and concrete.
3. Update this file in the same PR/commit as the patch itself.

| Commit      | Area                    | Why this exists                                                | Risk on upstream rebase                 | Rollback               |
| ----------- | ----------------------- | -------------------------------------------------------------- | --------------------------------------- | ---------------------- |
| `0309e1956` | auto-reply cache report | deterministic `/cache_report` command for local ops visibility | medium (touches reply/model boundaries) | `git revert 0309e1956` |
| `0dfeed1ae` | test harness            | isolates tests from optional import side effects               | low                                     | `git revert 0dfeed1ae` |
| `cfa418d73` | docs/local              | upstream update workflow and local patch changelog             | low                                     | `git revert cfa418d73` |
| `23925893a` | docs/local              | GitHub remote/token scope notes                                | low                                     | `git revert 23925893a` |
| `dbd387b18` | docs/local              | confirms myfork tracking setup                                 | low                                     | `git revert dbd387b18` |
| `a7c53de18` | docs/local              | add patch register, operations log, and sync helper            | low                                     | `git revert a7c53de18` |
| `17dfc6cfe` | rebase hygiene          | remove leftover conflict marker in extra params                | low                                     | `git revert 17dfc6cfe` |
| `4fa757d71` | auto-reply cache report | require explicit slash command for cache report trigger        | low                                     | `git revert 4fa757d71` |
| `c94bdab26` | docs/local + scripts    | safe gateway-only restart path and local process guardrails    | low                                     | `git revert c94bdab26` |
