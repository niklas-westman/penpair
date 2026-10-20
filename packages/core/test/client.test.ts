import { describe, expect, it } from "vitest";
import { classifyFailure, executeCode, maxSnippetBytes, type PenpotToolClient, type ToolOutcome } from "../src/client.js";
import { PenpairError } from "../src/errors.js";

function fake(outcomes: (ToolOutcome | Error)[]): PenpotToolClient & { calls: number } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async callTool() {
      const next = outcomes[Math.min(calls++, outcomes.length - 1)]!;
      if (next instanceof Error) throw next;
      return next;
    },
    async close() {},
  };
}

const ok = (result: unknown): ToolOutcome => ({ text: JSON.stringify({ result, log: "printed" }), isError: false });

describe("failure text", () => {
  it("gets a distinct code each", () => {
    expect(classifyFailure("plugin tab appears to be suspended (no heartbeat for 40s)")).toBe("plugin-suspended");
    expect(classifyFailure("no plugin connected")).toBe("plugin-disconnected");
    expect(classifyFailure("401 Unauthorized")).toBe("auth-rejected");
    expect(classifyFailure("fetch failed ECONNREFUSED")).toBe("mcp-unavailable");
    expect(classifyFailure("something else")).toBe("tool-failed");
  });
});

describe("executing a snippet", () => {
  it("returns the parsed result and the log", async () => {
    expect((await executeCode(fake([ok(JSON.stringify({ a: 1 }))]), "return 1")).result).toEqual({ a: 1 });
    const plain = await executeCode(fake([ok("text")]), "return 1");
    expect(plain).toEqual({ result: "text", log: "printed" });
  });

  it("waits out a suspended tab and tries again", async () => {
    const client = fake([
      { text: "Tool execution failed: plugin tab appears to be suspended (no heartbeat)", isError: true },
      ok({ done: true }),
    ]);
    const waits: string[] = [];
    const result = await executeCode(client, "return 1", { sleep: async () => undefined, onWait: (message) => waits.push(message) });
    expect(result.result).toEqual({ done: true });
    expect(client.calls).toBe(2);
    expect(waits).toHaveLength(1);
  });

  it("gives up with the suspended code after the retries", async () => {
    const client = fake([{ text: "suspended", isError: true }]);
    await expect(executeCode(client, "x", { retries: 1, sleep: async () => undefined })).rejects.toMatchObject({ code: "plugin-suspended" });
    expect(client.calls).toBe(2);
  });

  it("refuses a snippet that is too large before sending it", async () => {
    const client = fake([ok(1)]);
    await expect(executeCode(client, "x".repeat(maxSnippetBytes + 1))).rejects.toBeInstanceOf(PenpairError);
    expect(client.calls).toBe(0);
  });

  it("redacts what ends up in an error", async () => {
    const client = fake([{ text: "Tool execution failed: at https://h/mcp?userToken=SECRET", isError: true }]);
    await expect(executeCode(client, "x", { redact: (text) => text.replace(/SECRET/g, "[redacted]") })).rejects.toThrow(/\[redacted\]/);
  });
});
