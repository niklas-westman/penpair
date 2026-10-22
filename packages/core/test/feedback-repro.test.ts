import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { waitForStableLayout } from "../src/layout.js";
import { runJournaledSteps } from "../src/journal.js";
import { runOnPage } from "../src/operation.js";
import { requirePage, snippet } from "../src/snippet.js";
import type { PenpotToolClient } from "../src/client.js";
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const clientFor = (penpot: unknown): PenpotToolClient => ({ async callTool(_name, args) { return { text: JSON.stringify({ result: await new AsyncFunction("penpot", String(args.code))(penpot), log: "" }), isError: false }; }, async close() {} });

it.fails("PP-01: an idle native timeout can fall back to complete stable geometry", async () => {
 const root = { id: "root", x: 0, y: 0, width: 10, height: 10, children: [] };
 const penpot = { currentFile: { id: "file" }, currentPage: { id: "page", root }, waitForLayoutUpdate: async () => { throw new Error("idle layout timeout"); } };
 expect(await waitForStableLayout(clientFor(penpot), { sleep: async () => undefined })).toMatchObject({ stable: true, method: "geometry" });
});
it("PP-07: deferred lease save is observable but indistinguishable from an external edit", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "penpair-lease-repro-"));
 for (const cause of ["lease-save", "external-edit"]) {
  let revision = 1, reads = 0, writes = 0;
  await expect(runJournaledSteps([{ key: "step", label: "no-op", signature: "v1", inspect: async () => { if (++reads === 2) revision++; return 0; }, apply: async () => { writes++; }, verify: () => true, reconcile: () => "pending" }], {
   root, runId: cause, operation: "repro", input: {}, target: async () => ({ fileId: "file", revision }),
   coordinate: async () => ({ check: async () => undefined, release: async () => undefined }),
  })).rejects.toMatchObject({ outcome: "conflict" });
  expect(writes).toBe(0);
 }
});
it.fails("PP-08: waits for observed page identity when switching takes more than one turn", async () => {
 const root = { children: [] }, first = { id: "a", name: "A", root }, second = { id: "b", name: "B", root };
 let pending = false, sleeps = 0;
 const penpot = { currentFile: { id: "file", pages: [first, second] }, currentPage: first, openPage: () => { pending = true; } };
 const result = await runOnPage(clientFor(penpot), snippet("read-page", `${requirePage}\nreturn {ok:true,pageId:penpot.currentPage.id};`, { page: "B" }, "read"), "B", { sleep: async () => { if (pending && ++sleeps === 2) penpot.currentPage = second; } });
 expect(result.pageId).toBe("b");
});
