# Local Patch Register

Purpose: authoritative list of all local-only changes that live on `local/patches`.

How to use:

1. Add one row for each local patch commit.
2. Keep scope and rollback instructions short and concrete.
3. Update this file in the same PR/commit as the patch itself.

| Commit      | Area                    | Why this exists                                                | Risk on upstream rebase                 | Rollback               |
| ----------- | ----------------------- | -------------------------------------------------------------- | --------------------------------------- | ---------------------- |
| `e2ad2ee7e` | auto-reply cache report | deterministic `/cache_report` command for local ops visibility | medium (touches reply/model boundaries) | `git revert e2ad2ee7e` |
| `706f086eb` | test harness            | isolates tests from optional import side effects               | low                                     | `git revert 706f086eb` |
| `a9457b83a` | docs/local              | local patch workflow documentation                             | low                                     | `git revert a9457b83a` |
| `d234cf730` | docs/local              | GitHub remote/token scope notes                                | low                                     | `git revert d234cf730` |
| `204538c87` | docs/local              | confirms myfork tracking setup                                 | low                                     | `git revert 204538c87` |
