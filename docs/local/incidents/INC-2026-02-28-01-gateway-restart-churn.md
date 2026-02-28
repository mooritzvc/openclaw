# Incident: Gateway Restart Churn During Cache-Report Rollout

- Incident ID: `INC-2026-02-28-01`
- Date: `2026-02-28`
- Severity: `SEV-3`
- Status: Resolved
- Branch context: `local/patches` on top of pristine `main`

## Summary

During rollout of a local cache-report trigger fix, gateway restarts became noisy and confusing:

- stale gateway process ownership on port `18789`
- mixed restart paths (daemon/service vs full mac app rebuild path)
- failed mac app rebuild path (`scripts/restart-mac.sh`) due local Swift macro/plugin toolchain errors

This incident affected operator confidence and increased recovery time, but did not indicate upstream `main` corruption.

## Impact

- Local operational disruption while restarting and validating behavior.
- No evidence of data loss in `~/brain/health/health.db`.
- `main` branch remained clean and unchanged.
- Local patch branch integrity remained intact (`local/patches` rebased and pushed).

## What Happened (Timeline, UTC)

1. Cache-report behavior fix prepared and tested on `local/patches`.
2. Gateway restart attempts encountered stale process conflicts on port `18789`.
3. Full mac app restart path (`scripts/restart-mac.sh`) was invoked and failed during Swift build (`SwiftUIMacros` / `PreviewsMacros` plugin errors).
4. Restart path was reduced back to daemon/service flow and stale gateway process was replaced.
5. Local docs/process guardrails were added under `docs/local/` and `scripts/local/`.

## Root Cause

Primary:

- Operational restart-path mixing under stale process conditions.

Contributing factors:

- Long-lived prior gateway process holding port `18789`.
- Full app rebuild path used for a gateway-only behavior change.
- Local Swift toolchain/macro environment not healthy for mac app rebuild.

Not root cause:

- The cache-report logic fix itself did not cause gateway process supervision failure.

## Runtime Risk Flag Clarification

During this incident, CLI probes from this coding-agent environment reported:

- `gateway closed (1006 ...)` and
- `connect EPERM 127.0.0.1:18789`

Given sandbox/network constraints in this agent runtime, probe failures can be false positives for local loopback connectivity. In parallel, launchd and gateway logs showed an active gateway process listening on `127.0.0.1:18789`.

Interpretation:

- Treat probe output from restricted automation environments carefully.
- Validate with host-level service checks (launchctl + listener ownership + gateway logs).

## Corrective Actions Applied

1. Added local gateway-safe restart helper:
   - `scripts/local/restart-gateway-safe.sh`
2. Standardized local workflow docs:
   - `docs/local/LOCAL_PATCH_WORKFLOW.md`
3. Updated local patch register to current rebased commit IDs:
   - `docs/local/PATCH_REGISTER.md`
4. Logged operational event:
   - `docs/local/OPERATIONS_LOG.md`
5. Added incident tracking index:
   - `docs/local/INCIDENTS.md`

## Prevention / Guardrails

1. Use one restart path for gateway-only changes:
   - `./scripts/local/restart-gateway-safe.sh`
2. Avoid `scripts/restart-mac.sh` unless changing mac app code in `apps/macos`.
3. Preflight before restart:
   - confirm port owner (`lsof -iTCP:18789 -sTCP:LISTEN`)
   - confirm active launch label (`launchctl print gui/$UID | rg ai.openclaw.gateway`)
4. Keep local feature patches isolated on `local/patches`; keep `main` pristine.

## Follow-ups

1. Decide whether cache-report customization remains required long-term.
2. If reduced local surface is preferred, plan a controlled revert of source-level local patches while retaining local ops docs/scripts.
