import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { handleCommands } from "./commands.js";
import { buildCommandTestParams } from "./commands.test-harness.js";

let testDir = "";

beforeAll(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cache-report-"));
});

afterAll(async () => {
  if (testDir) {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

async function writeTranscript(filePath: string, lines: string[]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
}

function buildParams(commandBody: string, sessionFile: string) {
  const cfg = {
    commands: { text: true },
    channels: { whatsapp: { allowFrom: ["*"] } },
  } as OpenClawConfig;
  const params = buildCommandTestParams(commandBody, cfg, undefined, { workspaceDir: testDir });
  params.sessionEntry = {
    sessionId: "session-1",
    sessionFile,
    updatedAt: Date.now(),
  };
  params.provider = "openai-codex";
  params.model = "gpt-5.3-codex";
  return params;
}

describe("/cache_report native command", () => {
  it("reports total input, cache read/write, uncached input, and output", async () => {
    const sessionFile = path.join(testDir, "sessions", "one.jsonl");
    await writeTranscript(sessionFile, [
      JSON.stringify({
        type: "message",
        timestamp: "2026-02-21T00:00:00.000Z",
        message: {
          role: "assistant",
          usage: { input: 100, output: 10, cacheRead: 900, cacheWrite: 0 },
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-02-21T00:01:00.000Z",
        message: {
          role: "assistant",
          usage: { input: 50, output: 5, cacheRead: 450, cacheWrite: 10 },
        },
      }),
    ]);

    const result = await handleCommands(buildParams("/cache_report session", sessionFile));
    const text = result.reply?.text ?? "";

    expect(result.shouldContinue).toBe(false);
    expect(text).toContain("🧊 Cache Report");
    expect(text).toContain("Tokens: 1.5k in · 15 out");
    expect(text).toContain("Uncached input: 150 (150)");
    expect(text).toContain("Cache: 1.4k read · 10 write");
    expect(text).not.toContain("If you want, I can also give you");
  });

  it("uses since-last-compaction window by default", async () => {
    const sessionFile = path.join(testDir, "sessions", "two.jsonl");
    await writeTranscript(sessionFile, [
      JSON.stringify({
        type: "message",
        timestamp: "2026-02-21T00:00:00.000Z",
        message: {
          role: "assistant",
          usage: { input: 1000, output: 20, cacheRead: 0, cacheWrite: 0 },
        },
      }),
      JSON.stringify({
        type: "compaction",
        timestamp: "2026-02-21T00:02:00.000Z",
        summary: "compacted",
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-02-21T00:03:00.000Z",
        message: {
          role: "assistant",
          usage: { input: 100, output: 10, cacheRead: 900, cacheWrite: 0 },
        },
      }),
    ]);

    const result = await handleCommands(buildParams("/cache_report", sessionFile));
    const text = result.reply?.text ?? "";

    expect(result.shouldContinue).toBe(false);
    expect(text).toContain("Scope: since last compaction");
    expect(text).toContain("Tokens: 1.0k in · 10 out");
    expect(text).toContain("Session totals: 2.0k in · 900 read");
  });

  it("intercepts wrapped messages that include /cache_report at the end", async () => {
    const sessionFile = path.join(testDir, "sessions", "three.jsonl");
    await writeTranscript(sessionFile, [
      JSON.stringify({
        type: "message",
        timestamp: "2026-02-21T00:00:00.000Z",
        message: {
          role: "assistant",
          usage: { input: 30, output: 5, cacheRead: 70, cacheWrite: 10 },
        },
      }),
    ]);

    const wrappedBody = `Conversation info (untrusted metadata):
\`\`\`json
{"message_id":"1","sender":"x"}
\`\`\`
/cache_report`;
    const result = await handleCommands(buildParams(wrappedBody, sessionFile));
    const text = result.reply?.text ?? "";

    expect(result.shouldContinue).toBe(false);
    expect(text).toContain("🧊 Cache Report");
    expect(text).toContain("Cache: 70 read · 10 write");
  });

  it("accepts /cache-report slash alias", async () => {
    const sessionFile = path.join(testDir, "sessions", "alias.jsonl");
    await writeTranscript(sessionFile, [
      JSON.stringify({
        type: "message",
        timestamp: "2026-02-21T00:00:00.000Z",
        message: {
          role: "assistant",
          usage: { input: 30, output: 5, cacheRead: 70, cacheWrite: 10 },
        },
      }),
    ]);

    const result = await handleCommands(buildParams("/cache-report session", sessionFile));
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text ?? "").toContain("🧊 Cache Report");
  });

  it("does not trigger on plain-text cache report phrase", async () => {
    const sessionFile = path.join(testDir, "sessions", "four.jsonl");
    await writeTranscript(sessionFile, [
      JSON.stringify({
        type: "message",
        timestamp: "2026-02-21T00:00:00.000Z",
        message: {
          role: "assistant",
          usage: { input: 30, output: 5, cacheRead: 70, cacheWrite: 10 },
        },
      }),
    ]);

    const result = await handleCommands(
      buildParams("can you give me a cache report?", sessionFile),
    );
    expect(result.shouldContinue).toBe(true);
    expect(result.reply).toBeUndefined();
  });

  it("does not trigger on unsupported spaced slash alias", async () => {
    const sessionFile = path.join(testDir, "sessions", "five.jsonl");
    await writeTranscript(sessionFile, [
      JSON.stringify({
        type: "message",
        timestamp: "2026-02-21T00:00:00.000Z",
        message: {
          role: "assistant",
          usage: { input: 30, output: 5, cacheRead: 70, cacheWrite: 10 },
        },
      }),
    ]);

    const result = await handleCommands(buildParams("/cache report", sessionFile));
    expect(result.shouldContinue).toBe(true);
    expect(result.reply).toBeUndefined();
  });
});
