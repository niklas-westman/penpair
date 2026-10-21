import { describe, expect, it } from "vitest";
import { SnippetRegistry } from "../src/registry.js";
import { runOperation, type Operation } from "../src/operation.js";
import { snippet } from "../src/snippet.js";
import type { PenpotToolClient } from "../src/client.js";

function sequence(results: unknown[]) {
  let calls = 0;
  const client: PenpotToolClient = {
    async callTool() { return { text: JSON.stringify({ result: results[calls++], log: "" }), isError: false }; },
    async close() {},
  };
  return { client, count: () => calls };
}
const fast = { layout: false as const, apply: true, settleMs: 0, sleep: async () => undefined };
const operation: Operation<undefined> = {
  name: "fixture", page: () => undefined,
  inspect: () => snippet("inspect", "return { ok: true };"),
  apply: () => snippet("apply", "return { ok: true };"),
  readback: () => snippet("readback", "return { ok: true };"),
  verify: () => [],
};

describe("positive verification evidence", () => {
  it.each([undefined, null, "ok", 42, [], {}, { ok: true }, { ok: true, problems: [] },
    { ok: true, verification: { expected: {}, actual: {} } },
    { ok: true, verification: { expected: { count: 2 }, actual: { count: 1 } } },
  ])("does not verify missing or invalid readback %#", async (readback) => {
    const registry = new SnippetRegistry();
    registry.register({ kind: "write", name: "fixture", description: "fixture", inspect: "return {};", apply: "return {};", readback: "return {};" });
    const { client } = sequence([{ ok: true, count: 1 }, { ok: true }, readback]);
    const report = await registry.run(client, "fixture", {}, fast) as { verified: boolean; outcome: string; apply: unknown; problems: string[] };
    expect(report).toMatchObject({ verified: false, outcome: "failed", apply: { ok: true } });
    expect(report.problems.length).toBeGreaterThan(0);
  });

  it("compares independent actual observations with expected postconditions", async () => {
    const registry = new SnippetRegistry();
    registry.register({ kind: "write", name: "fixture", description: "fixture", inspect: "return {};", apply: "return {};", readback: "return {};" });
    const { client } = sequence([{ ok: true, count: 1 }, { ok: true }, { ok: true, verification: { expected: { count: 2, file: "pinned" }, actual: { file: "pinned", count: 2 } } }]);
    expect(await registry.run(client, "fixture", {}, fast)).toMatchObject({ verified: true, outcome: "verified" });
  });

  it("does not let an explicit verifier waive a missing readback", async () => {
    const { client } = sequence([{ ok: true }, { ok: true }, { ok: true }]);
    expect(await runOperation(client, operation, undefined, fast)).toMatchObject({ verified: false, outcome: "failed" });
  });

  it("stops before writing when inspect returns no explicit result", async () => {
    const { client, count } = sequence([null]);
    await expect(runOperation(client, operation, undefined, fast)).rejects.toThrow(/nothing was applied/);
    expect(count()).toBe(1);
  });

  it("reports an ambiguous apply acknowledgment without inventing success", async () => {
    const { client, count } = sequence([{ ok: true }, "done"]);
    await expect(runOperation(client, operation, undefined, fast)).rejects.toMatchObject({ code: "write-uncertain" });
    expect(count()).toBe(2);
  });

  it("retains the applied observations when independent verification throws", async () => {
    const { client } = sequence([{ ok: true, before: 1 }, { ok: true, changed: 1 }, { ok: true, actual: 2 }]);
    const report = await runOperation(client, { ...operation, verify: () => { throw new Error("bad verifier"); } }, undefined, fast);
    expect(report).toMatchObject({ verified: false, outcome: "failed", apply: { changed: 1 }, readback: { actual: 2 } });
    expect(report.problems.join()).toMatch(/bad verifier/);
  });

  it("rejects a malformed explicit verifier result", async () => {
    const { client } = sequence([{ ok: true }, { ok: true }, { ok: true, actual: 2 }]);
    const report = await runOperation(client, { ...operation, verify: () => undefined as never }, undefined, fast);
    expect(report).toMatchObject({ verified: false, outcome: "failed" });
  });
});
