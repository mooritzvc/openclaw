import type { SessionEntry } from "../config/sessions.js";
import crypto from "node:crypto";
import { resolveSessionTranscriptPath } from "../config/sessions.js";

export type ModelOverrideSelection = {
  provider: string;
  model: string;
  isDefault?: boolean;
};

export function applyModelOverrideToSessionEntry(params: {
  entry: SessionEntry;
  selection: ModelOverrideSelection;
  profileOverride?: string;
  profileOverrideSource?: "auto" | "user";
}): { updated: boolean } {
  const { entry, selection, profileOverride } = params;
  const profileOverrideSource = params.profileOverrideSource ?? "user";
  let updated = false;

  if (selection.isDefault) {
    if (entry.providerOverride) {
      delete entry.providerOverride;
      updated = true;
    }
    if (entry.modelOverride) {
      delete entry.modelOverride;
      updated = true;
    }
  } else {
    if (entry.providerOverride !== selection.provider) {
      entry.providerOverride = selection.provider;
      updated = true;
    }
    if (entry.modelOverride !== selection.model) {
      entry.modelOverride = selection.model;
      updated = true;
    }
  }

  if (profileOverride) {
    if (entry.authProfileOverride !== profileOverride) {
      entry.authProfileOverride = profileOverride;
      updated = true;
    }
    if (entry.authProfileOverrideSource !== profileOverrideSource) {
      entry.authProfileOverrideSource = profileOverrideSource;
      updated = true;
    }
    if (entry.authProfileOverrideCompactionCount !== undefined) {
      delete entry.authProfileOverrideCompactionCount;
      updated = true;
    }
  } else {
    if (entry.authProfileOverride) {
      delete entry.authProfileOverride;
      updated = true;
    }
    if (entry.authProfileOverrideSource) {
      delete entry.authProfileOverrideSource;
      updated = true;
    }
    if (entry.authProfileOverrideCompactionCount !== undefined) {
      delete entry.authProfileOverrideCompactionCount;
      updated = true;
    }
  }

  // Clear stale fallback notice when the user explicitly switches models.
  if (updated) {
    delete entry.fallbackNoticeSelectedModel;
    delete entry.fallbackNoticeActiveModel;
    delete entry.fallbackNoticeReason;
    entry.updatedAt = Date.now();
  }

  return { updated };
}

export function rotateSessionBoundaryForModelSwitch(params: {
  entry: SessionEntry;
  previousLabel: string;
  nextLabel: string;
  agentId?: string;
}): { rotated: boolean; previousSessionId?: string; nextSessionId?: string } {
  if (!params.nextLabel || params.nextLabel === params.previousLabel) {
    return { rotated: false };
  }

  const previousSessionId = params.entry.sessionId;
  const nextSessionId = crypto.randomUUID();

  params.entry.sessionId = nextSessionId;
  params.entry.sessionFile = resolveSessionTranscriptPath(
    nextSessionId,
    params.agentId,
    params.entry.lastThreadId,
  );
  params.entry.systemSent = false;
  params.entry.abortedLastRun = false;
  params.entry.inputTokens = undefined;
  params.entry.outputTokens = undefined;
  params.entry.totalTokens = undefined;
  params.entry.totalTokensFresh = undefined;
  params.entry.contextTokens = undefined;
  params.entry.compactionCount = 0;
  params.entry.memoryFlushAt = undefined;
  params.entry.memoryFlushCompactionCount = undefined;
  params.entry.systemPromptReport = undefined;
  params.entry.cliSessionIds = undefined;
  params.entry.claudeCliSessionId = undefined;
  params.entry.updatedAt = Date.now();

  return {
    rotated: true,
    previousSessionId,
    nextSessionId,
  };
}
