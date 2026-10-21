import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runOperation, type Operation } from "../src/operation.js";
import { snippet } from "../src/snippet.js";
import { archiveApply } from "../src/snippets/archive.js";
import type { PenpotToolClient } from "../src/client.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
it("resumes a registered-style operation from independent observations after a lost acknowledgment", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-operation-"));
  const penpot = { currentPage: { id: "page", root: { id: "root", x:0, y:0, width:0, height:0, children:[] } }, currentFile: { id: "file", revn: 1 }, value: 0, writes: 0 };
  let lost = false;
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const code = String(args.code);
      const result = await new AsyncFunction("penpot", code)(penpot);
      if (code.includes("penpot.writes++") && !lost) { lost = true; throw new Error("acknowledgment lost"); }
      return { text: JSON.stringify({ result, log: "" }), isError: false };
    }, async close() {},
  };
  const operation: Operation<Record<string, never>> = {
    name: "set-value", page: () => undefined,
    inspect: () => snippet("inspect", "return {ok:true, value:penpot.value};"),
    apply: () => snippet("apply", "penpot.value=1; penpot.writes++; return {ok:true};"),
    readback: () => snippet("readback", "return {ok:true, value:penpot.value};"),
    verify: ({ readback }) => readback.value === 1 ? [] : ["wrong value"],
  };
  const options = { apply: true, settleMs: 0, journal: { root, runId: "test-run" } };
  await expect(runOperation(client, operation, {}, options)).rejects.toMatchObject({ outcome: "uncertain" });
  expect(await runOperation(client, operation, {}, { ...options, journal: { ...options.journal, resume: true } })).toMatchObject({ verified: true });
  expect(penpot.writes).toBe(1);
});

describe("same-execution archive preconditions", () => {
  it("refuses a newly added candidate before making any archive", async () => {
    const params = { page: "P", archiveName: "Archive", keepPrefixes: [], partPrefixes: [], x: 9000, expectedPlan: [], expectedArchiveId: null };
    const penpot = { currentPage: { name: "P", root: { children: [{ id: "new", name: "New", type: "board", x: 0, y: 0, width: 10, height: 10 }] } }, createBoard: () => { throw new Error("unexpected mutation"); } };
    expect(await new AsyncFunction("penpot", archiveApply(params).code)(penpot)).toMatchObject({ ok: false, message: expect.stringContaining("source changed") });
  });
});
