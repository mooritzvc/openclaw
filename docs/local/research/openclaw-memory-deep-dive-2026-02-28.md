# Executive Summary

OpenClaw memory is best understood as three cooperating systems:

1. **Disk-backed knowledge files** (`MEMORY.md`, `memory/*.md`, optional custom markdown paths).
2. **Retrieval/index runtime** (`memory_search` + `memory_get`) over either builtin SQLite indexing or QMD.
3. **Pre-compaction memory flush** that runs a silent memory-write turn before context compaction pressure peaks.

In your current local environment, memory is running through the **QMD backend** with `memory-core` as the active memory plugin slot, and both `main` and `data` agents are using QMD-backed retrieval.[^status-memory-plugin][^memory-status-main][^memory-status-data]

# Scope and Method

This report combines:

- Official OpenClaw docs (concepts + CLI + compaction + plugins).
- Deep code-path inspection across `src/memory/*`, agent tooling, and compaction/memory-flush code.
- Local runtime checks on this laptop (version, config, memory status, QMD collection/index state).
- Local branch-diff analysis versus `main` to isolate local behavior differences.

The goal is not just feature description; it is **runtime truth** for this machine and branch as of **2026-02-28**.

# Core Mental Model

## 1. Source of Truth Is Markdown on Disk

OpenClaw treats markdown files as canonical memory state; model recall quality depends on what is persisted to files, not ephemeral context.[^docs-memory]

Default memory file surfaces:

- `MEMORY.md` (curated long-term memory).
- `memory/YYYY-MM-DD.md` and related `memory/*.md` files.

Builtin indexing also supports additional markdown paths via `memorySearch.extraPaths`, while QMD uses `memory.qmd.paths` collections.[^internal-list-memory-files][^backend-config-custom-paths]

## 2. Retrieval Is Tool-Driven (Not Always-Loaded)

The agent-facing retrieval interface is the memory tool pair:

- `memory_search`: retrieval over indexed snippets.
- `memory_get`: targeted file/line read.

These tools are injected by the memory plugin slot owner (default: `memory-core`).[^memory-core-plugin][^plugins-slots-default]

## 3. Compaction Safety Uses a Separate Memory-Flush Pass

When context usage approaches compaction thresholds, OpenClaw can run a silent pre-compaction turn to encourage durable writes to memory files before summaries compact history.[^memory-flush-settings][^memory-flush-runner]

# Plugin and Tool Wiring

Memory capability is plugin-slot based:

- `plugins.slots.memory` selects the active memory plugin.
- Default slot target is `memory-core`.
- `memory-core` registers both tools and the `openclaw memory` CLI commands.

This architecture decouples the agent-visible tool surface from the retrieval backend internals.[^plugins-slots-default][^memory-core-plugin][^docs-plugin]

Tool-level behavior details:

- `memory_search` resolves the manager for the active agent and returns decorated snippets, provider/model metadata, and fallback status.
- `memory_get` is constrained to safe markdown paths and degrades to empty text for missing files instead of throwing.
- Citations can be `auto|on|off`; in `auto`, citations are shown in direct chats and suppressed by default in groups/channels.

[^memory-tool-search]: `/Users/openclaw/openclaw/src/agents/tools/memory-tool.ts:40-99`

[^memory-tool-get]: `/Users/openclaw/openclaw/src/agents/tools/memory-tool.ts:101-140`

[^memory-tool-citations]: `/Users/openclaw/openclaw/src/agents/tools/memory-tool.ts:142-242`

# Backend Selection and Fallback

`getMemorySearchManager(...)` is the entrypoint for backend resolution:

- If `memory.backend` resolves to `qmd`, OpenClaw creates a `QmdMemoryManager`.
- In non-status mode, QMD is wrapped in `FallbackMemoryManager`.
- If QMD search fails at runtime, wrapper marks primary failed, closes it, evicts cache, and routes subsequent calls to builtin SQLite manager.
- If QMD is unavailable at initialization time, OpenClaw logs warning and falls back to builtin.

This gives operational continuity under QMD outages while preserving an automatic retry path for future calls.[^search-manager-selection][^search-manager-fallback]

# Builtin Backend Deep Dive (SQLite Manager)

## Configuration Resolution

Builtin behavior is resolved by `resolveMemorySearchConfig(...)` using global defaults plus per-agent overrides. Important normalized values include:

- sources (`memory` plus optional `sessions`),
- provider/fallback,
- chunking parameters,
- sync policy,
- hybrid retrieval knobs,
- cache settings.

Weights are normalized to sum to 1.0, and session source is gated behind experimental enablement.[^memory-search-config][^memory-search-config-normalization]

## Index Schema and Storage

Builtin memory index uses SQLite tables:

- `meta`, `files`, `chunks`,
- `embedding_cache`,
- optional FTS5 virtual table (`chunks_fts`) when enabled/available.

Vector acceleration uses optional sqlite-vec `vec0` table (`chunks_vec`), with graceful fallback when unavailable.[^memory-schema][^manager-sync-vector-ready][^manager-search-vector]

## File Discovery and Chunking

File enumeration:

- includes `MEMORY.md`, `memory.md`, and recursive `memory/**/*.md`,
- merges configured extra paths,
- ignores symlinks and non-markdown files,
- dedupes via realpath keys.

Chunking:

- approximate token windows via char budget,
- overlap carry-forward,
- line-range mapping for retrieval citations and `memory_get` targeting.

[^internal-list-memory-files]: `/Users/openclaw/openclaw/src/memory/internal.ts:80-146`

[^internal-chunking]: `/Users/openclaw/openclaw/src/memory/internal.ts:184-265`

## Embeddings, Batching, and Cache

Embedding provider resolution supports `auto`, explicit remote providers, and local node-llama-based embeddings.

In `auto`:

1. local (only if configured path exists),
2. openai,
3. gemini,
4. voyage,
5. mistral,
6. else FTS-only degraded mode (no provider).

Batching and retries are implemented with provider-specific flows and fallback to non-batch embedding when repeated batch failures occur. Embedding cache avoids re-embedding unchanged chunks during sync/reindex cycles.[^embeddings-provider-selection][^manager-embedding-batch][^manager-embedding-cache]

## Sync Lifecycle and Reindex Triggers

Builtin sync includes:

- watcher-driven dirty marking,
- optional interval sync,
- on-search trigger,
- on-session-start warm.

A full safe reindex is triggered when any index identity components drift:

- provider/model/provider-key fingerprint,
- source-set changes,
- chunking parameter changes,
- vector dimension readiness constraints.

Reindex uses a temp-db swap for atomicity under normal mode.[^manager-sync-watcher][^manager-sync-runsync][^manager-sync-safe-reindex]

## Retrieval Pipeline

Builtin retrieval supports:

- vector similarity,
- BM25 keyword retrieval (FTS),
- hybrid weighted merge,
- optional temporal decay,
- optional MMR reranking.

If embeddings are unavailable, manager uses FTS-only mode when FTS exists; if neither embeddings nor FTS are usable, search returns no results with warning.[^manager-search-entry][^manager-search-fts-only][^hybrid-merge][^temporal-decay][^mmr]

## `memory_get` Safety Boundaries

Builtin `readFile`:

- requires markdown files,
- allows in-workspace memory paths and approved extra paths,
- blocks escapes and symlink targets,
- returns `{text: "", path}` for missing files.

[^manager-read-file]: `/Users/openclaw/openclaw/src/memory/manager.ts:505-576`

[^fs-utils]: `/Users/openclaw/openclaw/src/memory/fs-utils.ts:6-31`

## Session Transcript Source (Builtin Optional)

When enabled via source config, session transcripts are parsed from JSONL:

- only `message` entries with `user`/`assistant` roles,
- text extraction from message blocks,
- sensitive text redaction,
- line mapping back to JSONL positions.

Delta-threshold sync logic tracks bytes/messages before reindexing changed session files in background.[^session-files-build][^manager-sync-session-delta]

# QMD Backend Deep Dive

## Backend Resolution and Defaults

When `memory.backend="qmd"`, OpenClaw resolves QMD config with:

- managed collections from default workspace memory files (if enabled),
- plus custom `memory.qmd.paths`,
- search mode (`search|vsearch|query`),
- update cadence and timeout limits,
- optional session export collection,
- scope policy (default: deny all except direct chats).

[^backend-config-main]: `/Users/openclaw/openclaw/src/memory/backend-config.ts:297-354`

[^backend-config-default-scope]: `/Users/openclaw/openclaw/src/memory/backend-config.ts:96-104`

## Agent-Scoped QMD State

Each agent gets isolated QMD XDG roots under:

- `~/.openclaw/agents/<agentId>/qmd/xdg-config`
- `~/.openclaw/agents/<agentId>/qmd/xdg-cache`

OpenClaw runs QMD with overridden `XDG_CONFIG_HOME` / `XDG_CACHE_HOME`, and maintains index at `.../qmd/index.sqlite`.[^qmd-manager-state]

## Startup and Refresh Lifecycle

QMD manager initialization:

- bootstraps managed collection map,
- ensures collection bindings in QMD,
- optionally runs boot update (blocking or background),
- arms periodic update timer.

Gateway startup proactively initializes QMD memory managers per eligible agent so update timers are armed even before first memory search call.[^qmd-manager-initialize][^gateway-startup-memory][^gateway-startup-sidecars]

## Scope Gate and Search Execution

Before every QMD search, OpenClaw checks scope policy derived from session key metadata; denied scope returns empty results and logs diagnostic context (`channel`, `chatType`).[^qmd-search-scope][^qmd-scope]

If allowed:

- runs configured mode (`search`/`vsearch`/`query`) with collection filters,
- repairs missing-collection failures once and retries,
- falls back to `query` when selected mode rejects flags,
- resolves doc IDs to absolute and display paths,
- applies score filtering, source diversification, and injected-char budget clamping.

[^qmd-search-core]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:608-745`

[^qmd-search-fallback-query]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:681-703`

[^qmd-doc-resolution]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:1417-1603`

[^qmd-clamp-diversify]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:1662-1730`

## QMD Update/Embed Resilience

QMD update path includes:

- queued forced updates,
- retry policy for update timeouts / sqlite-busy style failures,
- null-byte collection repair path,
- embed cadence with exponential backoff on failures.

[^qmd-update]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:858-991`

[^qmd-null-byte-repair]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:567-606`

## QMD `memory_get` Path Model

QMD read supports two path forms:

- workspace-relative paths (must remain inside workspace),
- `qmd/<collection>/<relative-path>` for out-of-workspace collections.

Both forms enforce escape protections and markdown-only constraints, and missing files degrade to empty text.[^qmd-read-file][^qmd-read-path]

# Pre-Compaction Memory Flush (Durability Plane)

Memory flush is a dedicated mechanism separate from retrieval indexing:

- settings resolve from `agents.defaults.compaction.memoryFlush`,
- flush trigger uses token thresholds:
  `contextWindow - reserveTokensFloor - softThresholdTokens`,
- run is skipped for heartbeats, CLI providers, or non-writable workspace contexts,
- flush metadata persisted as `memoryFlushAt` and `memoryFlushCompactionCount`,
- guarded to one flush per compaction cycle.

[^memory-flush-settings]: `/Users/openclaw/openclaw/src/auto-reply/reply/memory-flush.ts:74-111`

[^memory-flush-threshold]: `/Users/openclaw/openclaw/src/auto-reply/reply/memory-flush.ts:113-144`

[^memory-flush-runner]: `/Users/openclaw/openclaw/src/auto-reply/reply/agent-runner-memory.ts:27-172`

[^memory-flush-hookpoint]: `/Users/openclaw/openclaw/src/auto-reply/reply/agent-runner.ts:251-264`

[^session-entry-flush-fields]: `/Users/openclaw/openclaw/src/config/sessions/types.ts:146-149`

# Local Runtime Findings (This Laptop)

## Active Runtime

- OpenClaw version: `2026.2.27`.
- QMD version: `1.0.7`.
- Memory plugin slot owner: `memory-core`.
- Active memory backend: `qmd`.

Main agent and data agent both report QMD backend/provider/model and memory-only source mode in current deep status output.[^status-memory-plugin][^memory-status-main][^memory-status-data]

## Effective Local Config Highlights

From `~/.openclaw/openclaw.json`:

- `memory.backend = "qmd"`.
- `memory.qmd.includeDefaultMemory = true`.
- `memory.qmd.paths` adds `/Users/openclaw/brain` (`**/*.md`) and `/Users/openclaw/brain-tools` (`{README.md,ARCHITECTURE.md,WORKFLOW.md}`).
- `agents.defaults.memorySearch.provider = "local"` with `fallback = "none"` (relevant for builtin path and QMD-fallback scenarios).
- Pre-compaction flush enabled with `softThresholdTokens = 4000`, reserve floor `24000`.

[^local-config]: `/Users/openclaw/.openclaw/openclaw.json`

## Current QMD Index Reality

Observed active docs:

- `main` index: `brain-main (2)`, `memory-dir-main (1)`, plus active docs in `brain-tools-docs-main (15)`.
- `data` index: `brain-data (2)`, `memory-dir-data (1)`.

Important nuance:

- Collection listings currently show `brain-tools-root-main` and `brain-tools-root-data` with 0 files, while active document rows still include `brain-tools-docs-main` on `main`.
- Search execution remains constrained to managed collection names built from current config; stale active docs may still appear in aggregate DB stats, but search path scopes by managed collection filters.

[^local-main-sql]: local command output from `sqlite3 /Users/openclaw/.openclaw/agents/main/qmd/xdg-cache/qmd/index.sqlite "SELECT collection, COUNT(*) ..."`

[^local-data-sql]: local command output from `sqlite3 /Users/openclaw/.openclaw/agents/data/qmd/xdg-cache/qmd/index.sqlite "SELECT collection, COUNT(*) ..."`

[^qmd-managed-collections]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:1855-1875`

## CLI Scope Behavior Note

Running `openclaw memory search` without a qualifying direct-chat session context can be denied under default QMD scope policy, producing empty results and scope-denied logs. This is expected with default `deny` + allow direct-chat configuration.[^backend-config-default-scope][^qmd-search-scope]

# Local Branch Diffs That Affect Memory Lifecycle

No local diffs were found in core memory engine files (`src/memory/*`) or memory docs compared with `main`.

One local patch has **indirect memory impact**:

- model-switch directives now rotate to a new `sessionId` boundary,
- this reset clears `compactionCount`, `memoryFlushAt`, and `memoryFlushCompactionCount`.

Result: after model switch, flush-cycle tracking starts fresh for the new session boundary.[^model-rotate][^directive-persist-rotate][^directive-impl-rotate]

# Docs-vs-Code Nuance

A notable nuance worth tracking:

- Docs describe `MEMORY.md` as loaded only in main private session contexts.
- Current bootstrap filtering code excludes memory bootstrap files only for **subagent** and **cron** session keys, not all group/channel contexts.

This does not automatically imply leakage in your deployment because retrieval and memory behavior are additionally constrained by tool policies, channel behavior, and (for QMD retrieval) scope rules, but the statement is broader than the current filter implementation.

[^docs-memory-main-private]: https://docs.openclaw.ai/concepts/memory

[^workspace-bootstrap-filter]: `/Users/openclaw/openclaw/src/agents/workspace.ts:565-573`

# Practical Recommendations

1. Keep QMD scope intentional.
   If you want CLI/manual memory search from non-chat contexts, define explicit `memory.qmd.scope` rules that permit those contexts.

2. Reconcile stale/legacy collection naming.
   Given active docs in `brain-tools-docs-main` while config targets `brain-tools-root-main`, review collection migration state and clean stale collection bindings if needed.

3. Keep model-switch rotation behavior documented for operators.
   Because model switches reset flush counters and session boundaries, this affects debugging compaction/memory-flush timelines.

4. Add a guardrail test for docs-vs-bootstrap memory-loading claim.
   If product intent is "main private only", enforce that in `filterBootstrapFilesForSession(...)` or equivalent policy layer.

# Sources

## Official Docs (Web)

- OpenClaw Memory: https://docs.openclaw.ai/concepts/memory
- OpenClaw CLI Memory: https://docs.openclaw.ai/cli/memory
- OpenClaw Context: https://docs.openclaw.ai/concepts/context
- Session/Compaction Reference: https://docs.openclaw.ai/reference/session-management-compaction
- Plugin System: https://docs.openclaw.ai/tools/plugin
- QMD project: https://github.com/tobi/qmd

## Primary Local Code Anchors

- Manager selection/fallback: `/Users/openclaw/openclaw/src/memory/search-manager.ts`
- Builtin manager: `/Users/openclaw/openclaw/src/memory/manager.ts`
- Builtin sync/reindex logic: `/Users/openclaw/openclaw/src/memory/manager-sync-ops.ts`
- Builtin embedding pipeline: `/Users/openclaw/openclaw/src/memory/manager-embedding-ops.ts`
- Search operations: `/Users/openclaw/openclaw/src/memory/manager-search.ts`
- Hybrid/MMR/temporal: `/Users/openclaw/openclaw/src/memory/hybrid.ts`, `/Users/openclaw/openclaw/src/memory/mmr.ts`, `/Users/openclaw/openclaw/src/memory/temporal-decay.ts`
- QMD manager: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts`
- QMD scope: `/Users/openclaw/openclaw/src/memory/qmd-scope.ts`
- Memory tools: `/Users/openclaw/openclaw/src/agents/tools/memory-tool.ts`
- Memory plugin slot/core plugin: `/Users/openclaw/openclaw/src/plugins/slots.ts`, `/Users/openclaw/openclaw/extensions/memory-core/index.ts`
- Pre-compaction memory flush: `/Users/openclaw/openclaw/src/auto-reply/reply/memory-flush.ts`, `/Users/openclaw/openclaw/src/auto-reply/reply/agent-runner-memory.ts`
- Local model-switch patch: `/Users/openclaw/openclaw/src/sessions/model-overrides.ts`, `/Users/openclaw/openclaw/src/auto-reply/reply/directive-handling.persist.ts`, `/Users/openclaw/openclaw/src/auto-reply/reply/directive-handling.impl.ts`

# Footnotes

[^docs-memory]: https://docs.openclaw.ai/concepts/memory

[^memory-core-plugin]: `/Users/openclaw/openclaw/extensions/memory-core/index.ts:4-35`

[^plugins-slots-default]: `/Users/openclaw/openclaw/src/plugins/slots.ts:16-29`

[^docs-plugin]: https://docs.openclaw.ai/tools/plugin

[^search-manager-selection]: `/Users/openclaw/openclaw/src/memory/search-manager.ts:19-73`

[^search-manager-fallback]: `/Users/openclaw/openclaw/src/memory/search-manager.ts:75-217`

[^memory-search-config]: `/Users/openclaw/openclaw/src/agents/memory-search.ts:8-361`

[^memory-search-config-normalization]: `/Users/openclaw/openclaw/src/agents/memory-search.ts:281-347`

[^memory-schema]: `/Users/openclaw/openclaw/src/memory/memory-schema.ts:3-83`

[^manager-sync-vector-ready]: `/Users/openclaw/openclaw/src/memory/manager-sync-ops.ts:157-227`

[^manager-search-vector]: `/Users/openclaw/openclaw/src/memory/manager-search.ts:20-94`

[^internal-list-memory-files]: `/Users/openclaw/openclaw/src/memory/internal.ts:80-146`

[^backend-config-custom-paths]: `/Users/openclaw/openclaw/src/memory/backend-config.ts:220-252`

[^internal-chunking]: `/Users/openclaw/openclaw/src/memory/internal.ts:184-265`

[^embeddings-provider-selection]: `/Users/openclaw/openclaw/src/memory/embeddings.ts:144-260`

[^manager-embedding-batch]: `/Users/openclaw/openclaw/src/memory/manager-embedding-ops.ts:369-687`

[^manager-embedding-cache]: `/Users/openclaw/openclaw/src/memory/manager-embedding-ops.ts:77-205`

[^manager-sync-watcher]: `/Users/openclaw/openclaw/src/memory/manager-sync-ops.ts:356-608`

[^manager-sync-runsync]: `/Users/openclaw/openclaw/src/memory/manager-sync-ops.ts:843-922`

[^manager-sync-safe-reindex]: `/Users/openclaw/openclaw/src/memory/manager-sync-ops.ts:996-1104`

[^manager-search-entry]: `/Users/openclaw/openclaw/src/memory/manager.ts:230-316`

[^manager-search-fts-only]: `/Users/openclaw/openclaw/src/memory/manager.ts:256-290`

[^hybrid-merge]: `/Users/openclaw/openclaw/src/memory/hybrid.ts:51-149`

[^temporal-decay]: `/Users/openclaw/openclaw/src/memory/temporal-decay.ts:121-167`

[^mmr]: `/Users/openclaw/openclaw/src/memory/mmr.ts:116-214`

[^manager-read-file]: `/Users/openclaw/openclaw/src/memory/manager.ts:505-576`

[^fs-utils]: `/Users/openclaw/openclaw/src/memory/fs-utils.ts:6-31`

[^session-files-build]: `/Users/openclaw/openclaw/src/memory/session-files.ts:74-131`

[^manager-sync-session-delta]: `/Users/openclaw/openclaw/src/memory/manager-sync-ops.ts:400-524`

[^backend-config-main]: `/Users/openclaw/openclaw/src/memory/backend-config.ts:297-354`

[^backend-config-default-scope]: `/Users/openclaw/openclaw/src/memory/backend-config.ts:96-104`

[^qmd-manager-state]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:157-242`

[^qmd-manager-initialize]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:244-286`

[^gateway-startup-memory]: `/Users/openclaw/openclaw/src/gateway/server-startup-memory.ts:7-29`

[^gateway-startup-sidecars]: `/Users/openclaw/openclaw/src/gateway/server-startup.ts:180-182`

[^qmd-search-scope]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:612-615`

[^qmd-scope]: `/Users/openclaw/openclaw/src/memory/qmd-scope.ts:10-51`

[^qmd-search-core]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:608-745`

[^qmd-search-fallback-query]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:681-703`

[^qmd-doc-resolution]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:1417-1603`

[^qmd-clamp-diversify]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:1662-1730`

[^qmd-update]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:858-991`

[^qmd-null-byte-repair]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:567-606`

[^qmd-read-file]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:761-797`

[^qmd-read-path]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:1618-1660`

[^memory-flush-settings]: `/Users/openclaw/openclaw/src/auto-reply/reply/memory-flush.ts:74-111`

[^memory-flush-threshold]: `/Users/openclaw/openclaw/src/auto-reply/reply/memory-flush.ts:113-144`

[^memory-flush-runner]: `/Users/openclaw/openclaw/src/auto-reply/reply/agent-runner-memory.ts:27-172`

[^memory-flush-hookpoint]: `/Users/openclaw/openclaw/src/auto-reply/reply/agent-runner.ts:251-264`

[^session-entry-flush-fields]: `/Users/openclaw/openclaw/src/config/sessions/types.ts:146-149`

[^status-memory-plugin]: local command output from `openclaw status --json | jq '{memoryPlugin, memoryBackend:.memory.backend, ...}'`

[^memory-status-main]: local command output from `openclaw memory status --json --deep --agent main`

[^memory-status-data]: local command output from `openclaw memory status --json --deep --agent data`

[^local-config]: `/Users/openclaw/.openclaw/openclaw.json`

[^local-main-sql]: local command output from `sqlite3 /Users/openclaw/.openclaw/agents/main/qmd/xdg-cache/qmd/index.sqlite ...`

[^local-data-sql]: local command output from `sqlite3 /Users/openclaw/.openclaw/agents/data/qmd/xdg-cache/qmd/index.sqlite ...`

[^qmd-managed-collections]: `/Users/openclaw/openclaw/src/memory/qmd-manager.ts:1855-1875`

[^model-rotate]: `/Users/openclaw/openclaw/src/sessions/model-overrides.ts:80-119`

[^directive-persist-rotate]: `/Users/openclaw/openclaw/src/auto-reply/reply/directive-handling.persist.ts:179-184`

[^directive-impl-rotate]: `/Users/openclaw/openclaw/src/auto-reply/reply/directive-handling.impl.ts:330-336`

[^docs-memory-main-private]: https://docs.openclaw.ai/concepts/memory

[^workspace-bootstrap-filter]: `/Users/openclaw/openclaw/src/agents/workspace.ts:565-573`
