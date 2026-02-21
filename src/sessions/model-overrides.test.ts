import { describe, expect, it } from "vitest";
import { applyModelOverrideToSessionEntry, rotateSessionBoundaryForModelSwitch } from "./model-overrides.js";

describe("rotateSessionBoundaryForModelSwitch", () => {
  it("does not rotate when model label is unchanged", () => {
    const entry = {
      sessionId: "sess-1",
      updatedAt: Date.now(),
      totalTokens: 1234,
      compactionCount: 2,
    };

    const result = rotateSessionBoundaryForModelSwitch({
      entry,
      previousLabel: "claude-bridge/claude-opus-4-6",
      nextLabel: "claude-bridge/claude-opus-4-6",
      agentId: "main",
    });

    expect(result.rotated).toBe(false);
    expect(entry.sessionId).toBe("sess-1");
    expect(entry.totalTokens).toBe(1234);
  });

  it("rotates and resets context counters on model switch", () => {
    const entry = {
      sessionId: "sess-1",
      updatedAt: Date.now(),
      providerOverride: "claude-bridge",
      modelOverride: "claude-opus-4-6",
      totalTokens: 1234,
      totalTokensFresh: true,
      inputTokens: 1200,
      outputTokens: 34,
      compactionCount: 3,
      memoryFlushAt: Date.now(),
      memoryFlushCompactionCount: 3,
      systemSent: true,
      claudeCliSessionId: "cli-sess",
    };
    applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "claude-bridge", model: "claude-sonnet-4-5" },
    });

    const result = rotateSessionBoundaryForModelSwitch({
      entry,
      previousLabel: "claude-bridge/claude-opus-4-6",
      nextLabel: "claude-bridge/claude-sonnet-4-5",
      agentId: "main",
    });

    expect(result.rotated).toBe(true);
    expect(result.previousSessionId).toBe("sess-1");
    expect(entry.sessionId).not.toBe("sess-1");
    expect(entry.sessionFile).toContain(".jsonl");
    expect(entry.totalTokens).toBeUndefined();
    expect(entry.inputTokens).toBeUndefined();
    expect(entry.outputTokens).toBeUndefined();
    expect(entry.compactionCount).toBe(0);
    expect(entry.memoryFlushAt).toBeUndefined();
    expect(entry.memoryFlushCompactionCount).toBeUndefined();
    expect(entry.systemSent).toBe(false);
    expect(entry.claudeCliSessionId).toBeUndefined();
  });
});
