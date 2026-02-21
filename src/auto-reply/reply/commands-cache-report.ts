import fs from "node:fs/promises";
import type { SessionEntry } from "../../config/sessions.js";
import type { CommandHandler } from "./commands-types.js";
import { normalizeUsage } from "../../agents/usage.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveSessionFilePath, resolveSessionFilePathOptions } from "../../config/sessions.js";
import { logVerbose } from "../../globals.js";

type CacheReportScope = "last-compaction" | "session" | "turns";

type ParsedArgs = {
  scope: CacheReportScope;
  turns: number;
};

type UsageTurn = {
  timestamp?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  prompt: number;
  cacheHitPct: number;
};

type ReportTotals = {
  turns: number;
  prompt: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitPct: number;
};

type ParsedTranscript = {
  turns: UsageTurn[];
  compactionCount: number;
  lastCompactionTurnIndex: number;
  lastCompactionTimestamp?: string;
};

const DEFAULT_TURNS = 10;
const CACHE_REPORT_USAGE = "⚙️ Usage: /cache_report [session|turns N]";

function formatInt(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString("en-US");
}

function formatShort(value: number): string {
  const safe = Math.max(0, Math.round(value));
  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1)}M`;
  }
  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(1)}k`;
  }
  return String(safe);
}

function formatPct(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(2)}%`;
}

export function parseCacheReportArgs(normalizedCommandBody: string): ParsedArgs | null {
  const trimmed = normalizedCommandBody.trim();
  const matched = matchCacheReportCommand(trimmed);
  if (!matched) {
    return null;
  }
  const rawArgs = matched.args.trim();
  if (!rawArgs) {
    return { scope: "last-compaction", turns: DEFAULT_TURNS };
  }

  const parts = rawArgs.split(/\s+/).filter(Boolean);
  if (parts[0] === "session") {
    return { scope: "session", turns: DEFAULT_TURNS };
  }
  if (parts[0] === "turns") {
    const parsed = Number(parts[1]);
    const turns = Number.isFinite(parsed) ? Math.max(1, Math.min(500, Math.floor(parsed))) : DEFAULT_TURNS;
    return { scope: "turns", turns };
  }
  return { scope: "last-compaction", turns: DEFAULT_TURNS };
}

function matchCacheReportCommand(body: string): { args: string } | null {
  const commandPatterns = [
    /(?:^|\s)\/cache_report(?:\s+([\s\S]*))?$/i,
    /(?:^|\s)\/cache-report(?:\s+([\s\S]*))?$/i,
    /(?:^|\s)\/cache\s+report(?:\s+([\s\S]*))?$/i,
    /(?:^|\s)cache\s+report(?:\s+([\s\S]*))?$/i,
  ];
  for (const pattern of commandPatterns) {
    const match = body.match(pattern);
    if (!match) {
      continue;
    }
    return { args: match[1] ?? "" };
  }
  return null;
}

function calculateTotals(turns: UsageTurn[]): ReportTotals {
  const totals = turns.reduce<ReportTotals>(
    (acc, turn) => {
      acc.turns += 1;
      acc.prompt += turn.prompt;
      acc.input += turn.input;
      acc.output += turn.output;
      acc.cacheRead += turn.cacheRead;
      acc.cacheWrite += turn.cacheWrite;
      return acc;
    },
    {
      turns: 0,
      prompt: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheHitPct: 0,
    },
  );
  totals.cacheHitPct = totals.prompt > 0 ? (100 * totals.cacheRead) / totals.prompt : 0;
  return totals;
}

function detectBreakCandidates(turns: UsageTurn[]): UsageTurn[] {
  return turns
    .filter((turn) => turn.prompt >= 1_000)
    .filter((turn) => turn.cacheRead === 0 || turn.cacheHitPct < 35)
    .slice(-5);
}

function sliceByScope(
  parsed: ParsedTranscript,
  scope: CacheReportScope,
  turnsCount: number,
): UsageTurn[] {
  if (scope === "session") {
    return parsed.turns;
  }
  if (scope === "turns") {
    return parsed.turns.slice(-turnsCount);
  }
  if (parsed.lastCompactionTurnIndex < 0) {
    return parsed.turns;
  }
  return parsed.turns.slice(parsed.lastCompactionTurnIndex);
}

function resolveScopeLabel(parsed: ParsedTranscript, scope: CacheReportScope, turns: number): string {
  if (scope === "session") {
    return "session";
  }
  if (scope === "turns") {
    return `last ${turns} turns`;
  }
  if (parsed.lastCompactionTurnIndex < 0) {
    return "since last compaction (none found, using full session)";
  }
  return "since last compaction";
}

function formatReportText(params: {
  sessionKey: string;
  modelRef: string;
  scope: CacheReportScope;
  scopeLabel: string;
  compactionCount: number;
  lastCompactionTimestamp?: string;
  totals: ReportTotals;
  allTotals: ReportTotals;
  breakCandidates: UsageTurn[];
  recentTurns: UsageTurn[];
}): string {
  const lines: string[] = [];
  lines.push("🧊 Cache Report");
  lines.push(`🧵 Session: ${params.sessionKey}`);
  lines.push(`🧠 Model: ${params.modelRef}`);
  lines.push(`🪟 Scope: ${params.scopeLabel}`);
  lines.push(
    `🧹 Compactions: ${params.compactionCount}${params.lastCompactionTimestamp ? ` · last ${params.lastCompactionTimestamp}` : ""}`,
  );
  lines.push(`🧮 Tokens: ${formatShort(params.totals.prompt)} in · ${formatShort(params.totals.output)} out`);
  lines.push(
    `📦 Cache: ${formatShort(params.totals.cacheRead)} read · ${formatShort(params.totals.cacheWrite)} write · ${formatPct(params.totals.cacheHitPct)} hit`,
  );
  lines.push(`🔎 Uncached input: ${formatShort(params.totals.input)} (${formatInt(params.totals.input)})`);

  if (params.scope !== "session") {
    lines.push(
      `📚 Session totals: ${formatShort(params.allTotals.prompt)} in · ${formatShort(params.allTotals.cacheRead)} read · ${formatPct(params.allTotals.cacheHitPct)} hit`,
    );
  }

  if (params.breakCandidates.length > 0) {
    lines.push("💥 Low cache-hit turns (possible breaks):");
    for (const turn of params.breakCandidates) {
      lines.push(
        `• ${turn.timestamp ?? "unknown"} · hit ${formatPct(turn.cacheHitPct)} · in ${formatInt(turn.input)} · cacheR ${formatInt(turn.cacheRead)} · out ${formatInt(turn.output)}`,
      );
    }
  }

  if (params.recentTurns.length > 0) {
    lines.push("🕒 Last turns:");
    for (const turn of params.recentTurns) {
      lines.push(
        `• ${turn.timestamp ?? "unknown"} · hit ${formatPct(turn.cacheHitPct)} · uncached ${formatInt(turn.input)} · cacheR ${formatInt(turn.cacheRead)} · out ${formatInt(turn.output)}`,
      );
    }
  }
  return lines.join("\n");
}

async function resolveSessionTranscriptPath(params: {
  sessionEntry?: SessionEntry;
  sessionKey: string;
  agentId?: string;
  storePath?: string;
}): Promise<string | null> {
  const direct = params.sessionEntry?.sessionFile?.trim();
  if (direct) {
    return direct;
  }
  const sessionId = params.sessionEntry?.sessionId;
  if (!sessionId) {
    return null;
  }

  try {
    const resolvedAgentId = params.agentId ?? resolveSessionAgentId({ sessionKey: params.sessionKey });
    return resolveSessionFilePath(
      sessionId,
      params.sessionEntry,
      resolveSessionFilePathOptions({ agentId: resolvedAgentId, storePath: params.storePath }),
    );
  } catch {
    return null;
  }
}

async function parseTranscript(sessionFile: string): Promise<ParsedTranscript> {
  const turns: UsageTurn[] = [];
  let compactionCount = 0;
  let lastCompactionTurnIndex = -1;
  let lastCompactionTimestamp: string | undefined;

  const content = await fs.readFile(sessionFile, "utf-8");
  for (const line of content.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const entry = JSON.parse(trimmed) as Record<string, unknown>;
      const type = entry.type;
      if (type === "compaction") {
        compactionCount += 1;
        lastCompactionTurnIndex = turns.length;
        const ts = entry.timestamp;
        if (typeof ts === "string") {
          lastCompactionTimestamp = ts;
        }
        continue;
      }
      if (type !== "message") {
        continue;
      }
      const message = entry.message as Record<string, unknown> | undefined;
      if (!message || message.role !== "assistant") {
        continue;
      }
      const usageRaw = (message.usage ?? entry.usage) as
        | {
            input?: number;
            output?: number;
            cacheRead?: number;
            cacheWrite?: number;
          }
        | undefined;
      const usage = normalizeUsage(usageRaw);
      if (!usage) {
        continue;
      }
      const input = usage.input ?? 0;
      const output = usage.output ?? 0;
      const cacheRead = usage.cacheRead ?? 0;
      const cacheWrite = usage.cacheWrite ?? 0;
      const prompt = input + cacheRead + cacheWrite;
      const cacheHitPct = prompt > 0 ? (100 * cacheRead) / prompt : 0;
      turns.push({
        timestamp: typeof entry.timestamp === "string" ? entry.timestamp : undefined,
        input,
        output,
        cacheRead,
        cacheWrite,
        prompt,
        cacheHitPct,
      });
    } catch {
      // ignore malformed lines
    }
  }

  return { turns, compactionCount, lastCompactionTurnIndex, lastCompactionTimestamp };
}

async function buildCacheReportReply(params: {
  commandBodyNormalized: string;
  sessionEntry?: SessionEntry;
  sessionKey: string;
  provider: string;
  model: string;
  agentId?: string;
  storePath?: string;
}): Promise<string> {
  const parsedArgs = parseCacheReportArgs(params.commandBodyNormalized);
  if (!parsedArgs) {
    return CACHE_REPORT_USAGE;
  }

  const sessionFile = await resolveSessionTranscriptPath({
    sessionEntry: params.sessionEntry,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    storePath: params.storePath,
  });
  if (!sessionFile) {
    return "❌ Cache report unavailable: no session file found.";
  }

  let parsed: ParsedTranscript;
  try {
    parsed = await parseTranscript(sessionFile);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `❌ Cache report failed: ${message}`;
  }

  if (parsed.turns.length === 0) {
    return "❌ Cache report unavailable: no assistant usage rows found in transcript.";
  }

  const selectedTurns = sliceByScope(parsed, parsedArgs.scope, parsedArgs.turns);
  if (selectedTurns.length === 0) {
    return "❌ Cache report unavailable: selected window has no usage rows.";
  }

  const totals = calculateTotals(selectedTurns);
  const allTotals = calculateTotals(parsed.turns);
  const scopeLabel = resolveScopeLabel(parsed, parsedArgs.scope, parsedArgs.turns);
  const breakCandidates = detectBreakCandidates(selectedTurns);
  const recentTurns = selectedTurns.slice(-5);
  return formatReportText({
    sessionKey: params.sessionKey,
    modelRef: `${params.provider}/${params.model}`,
    scope: parsedArgs.scope,
    scopeLabel,
    compactionCount: parsed.compactionCount,
    lastCompactionTimestamp: parsed.lastCompactionTimestamp,
    totals,
    allTotals,
    breakCandidates,
    recentTurns,
  });
}

export const handleCacheReportCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const parsedArgs = parseCacheReportArgs(params.command.commandBodyNormalized);
  if (!parsedArgs) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /cache_report from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  const text = await buildCacheReportReply({
    commandBodyNormalized: params.command.commandBodyNormalized,
    sessionEntry: params.sessionEntry,
    sessionKey: params.sessionKey,
    provider: params.provider,
    model: params.model,
    agentId: params.agentId,
    storePath: params.storePath,
  });
  return { shouldContinue: false, reply: { text } };
};
