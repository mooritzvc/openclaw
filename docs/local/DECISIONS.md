# Local Decisions (ADR-lite)

Purpose: keep stable operating decisions explicit so new sessions do not relearn them.

Status keys:

- `accepted`
- `superseded`

---

## D-0001: Single Session Root

- Date: 2026-03-01
- Status: accepted
- Decision:
  - Start coding/debugging sessions from `/Users/openclaw/openclaw`.
- Why:
  - Deterministic context for Codex/Claude.
  - Avoids "wrong folder" startup drift.

## D-0002: Separate Runtime Persona from Engineering Ops

- Date: 2026-03-01
- Status: accepted
- Decision:
  - Treat `~/.openclaw/workspace/*` as assistant runtime persona/memory.
  - Treat `openclaw/docs/local/*` as engineering + infrastructure runbooks.
- Why:
  - Prevents mixing chat-persona memory with operational source of truth.
  - Keeps code/infra procedures versioned in git.

## D-0003: Default Hybrid Workflow

- Date: 2026-03-01
- Status: accepted
- Decision:
  - Use one hybrid workflow for tasks that span repo code and host infrastructure.
  - Do not force separate "modes" unless explicitly needed.
- Why:
  - Real tasks often cross boundaries (code + connector + host operations).
  - Reduces process overhead.

## D-0004: Anti-Sprawl Constraint

- Date: 2026-03-01
- Status: accepted
- Decision:
  - No new scripts/docs unless existing files cannot be extended and Moritz approved.
- Why:
  - Prevents "Frankenstein" growth from uncontrolled helper files.
