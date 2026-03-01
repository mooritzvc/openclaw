# Local Runbook (Moritz + Coding Agents)

Purpose: one operational playbook for OpenClaw repo work and host-side infrastructure work.

Scope:

- OpenClaw code/debug work in this repository
- Host operations around OpenClaw on the Mac Mini (SSH, restart, service health)

## Session Start (Mandatory)

1. Start from repo root: `/Users/openclaw/openclaw`
2. Read this file and `docs/local/DECISIONS.md`
3. Confirm in one short preflight:
   - task goal
   - whether host ops are needed
   - files likely to be touched

Default operating mode: **hybrid** (repo + infra in one workflow when needed).

## Anti-Sprawl Rules

- Prefer extending existing docs/scripts over creating new ones.
- No new scripts unless explicitly approved by Moritz.
- If a new file is truly needed, state why existing files are insufficient.
- Keep procedures centralized in this runbook and linked docs.

## Working Rules

- Branch model:
  - `main` = upstream baseline mirror
  - `local/patches` = local customizations
- For update/rebase flow, use: `docs/local/LOCAL_PATCH_WORKFLOW.md`
- For patch inventory, use: `docs/local/PATCH_REGISTER.md`
- For operation history, use: `docs/local/OPERATIONS_LOG.md`
- For incident write-ups, use: `docs/local/INCIDENTS.md`

## Safe Remote Operations (Mac Mini)

- Preferred remote recovery action: `reboot`
- Avoid remote full shutdown unless onsite recovery is guaranteed
- Verify after restart:
  1. SSH reachable
  2. OpenClaw gateway service running
  3. OpenClaw gateway RPC probe healthy

Reference commands:

- `openclaw gateway status`
- `openclaw status`
- `openclaw logs --follow`

## Task Logging

- Record meaningful ops changes in `docs/local/OPERATIONS_LOG.md`
- Record root-cause events in `docs/local/INCIDENTS.md` + incident report
- Record stable policy choices in `docs/local/DECISIONS.md`
