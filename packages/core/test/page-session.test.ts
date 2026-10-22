import { expect, it } from "vitest";
import { captureStructuralSnapshot, SnapshotCaptureError } from "../src/structure-snapshot.js";
import { runOnPage } from "../src/operation.js";
import { requirePage, snippet } from "../src/snippet.js";
import { selectPage, withPageSession } from "../src/page-session.js";
import { guardFile } from "../src/file-guard.js";
import type { PenpotToolClient } from "../src/client.js";
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
function fixture() {
 const pages = ["A", "B", "C"].map(name => ({ id: name.toLowerCase(), name, root: { id: `root-${name}`, name: "root", type: "board", tokens: {}, children: [] }, getShapeById() { return null; } }));
 const penpot = { currentFile: { id: "file", revn: 1, pages }, currentPage: pages[0]!, library: { local: { tokens: { sets: [], themes: [] } } }, openPage(page: typeof pages[number]) { pending = page; polls = 0; } };
 let pending: typeof pages[number] | undefined, polls = 0;
 const visits: string[] = [];
 const hooks = { before: (_code: string) => undefined, after: (_code: string) => undefined };
 const client: PenpotToolClient = { async callTool(_name, args) {
  const code = String(args.code); hooks.before(code);
  if (pending && code.includes('return {ok:true,fileId:penpot.currentFile.id,pageId:penpot.currentPage.id}')) { if (++polls === 2) { penpot.currentPage = pending; pending = undefined; } }
  const result = await new AsyncFunction("penpot", code)(penpot);
  if (code.includes('const document = {schemaVersion:1,kind:CFG.kind')) visits.push(penpot.currentPage.id);
  hooks.after(code);
  return { text: JSON.stringify({ result, log: "" }), isError: false };
 }, async close() {} };
 return { client, pages, penpot, hooks, visits };
}
it("serializes two whole-file collectors and restores the starting visible page", async () => {
 const f = fixture();
 const [first, second] = await Promise.all([captureStructuralSnapshot(f.client), captureStructuralSnapshot(f.client)]);
 expect(first).toEqual(second); expect(first.pages.map(page => page.pageId)).toEqual(["a", "b", "c"]);
 expect(f.penpot.currentPage.id).toBe("a");
 expect(f.visits).toEqual(["a", "b", "c", "c", "a", "b", "c", "c"]);
});
it("rejects unexpected manual navigation and restores after failure", async () => {
 const f = fixture(); let changed = false;
 f.hooks.after = code => { if (!changed && code.includes('const document = {schemaVersion:1,kind:CFG.kind')) { changed = true; f.penpot.currentPage = f.pages[2]!; } };
 await expect(captureStructuralSnapshot(f.client)).rejects.toMatchObject({ message: expect.stringContaining("Unexpected external navigation"), progress: [{ pageId: "a", stage: "start", elapsedMs: expect.any(Number) }] });
 expect(f.penpot.currentPage.id).toBe("a");
});
it("refuses mid-capture edits", async () => {
 const f = fixture(); let changed = false;
 f.hooks.after = code => { if (!changed && code.includes('const document = {schemaVersion:1,kind:CFG.kind')) { changed = true; f.penpot.currentFile.revn++; f.penpot.currentFile.pages = f.pages.slice(1); } };
 try { await captureStructuralSnapshot(f.client); throw new Error("should fail"); } catch (error) {
  expect(error).toBeInstanceOf(SnapshotCaptureError); expect((error as Error).message).toMatch(/revision|source|missing/);
 }
});
it("retains the capture failure when restoring a removed starting page also fails", async () => {
 const f = fixture(); let changed = false;
 f.hooks.after = code => { if (!changed && code.includes('const document = {schemaVersion:1,kind:CFG.kind')) { changed = true; f.penpot.currentPage = f.pages[2]!; f.penpot.currentFile.pages = f.pages.slice(1); } };
 await expect(captureStructuralSnapshot(f.client)).rejects.toMatchObject({ message: expect.stringContaining("Unexpected external navigation"), restorationError: expect.stringContaining("missing or ambiguous") });
});
it("refuses ambiguous names, removed pages and bounded switch failures", async () => {
 const f = fixture(); f.pages[1]!.name = "A";
 await expect(withPageSession(f.client, () => selectPage(f.client, { name: "A" }))).rejects.toThrow(/ambiguous/);
 await expect(withPageSession(f.client, () => selectPage(f.client, { id: "gone" }))).rejects.toThrow(/missing/);
 f.penpot.openPage = () => undefined;
 await expect(withPageSession(f.client, () => selectPage(f.client, { id: "c" }, { timeoutMs: 2, sleep: async () => undefined }))).rejects.toThrow(/expected c, observed a, stage/);
});
it("a derived file guard shares the client's session and cannot silently repair external navigation", async () => {
 const f = fixture(), guarded = guardFile(f.client, { id: "file" });
 const read = snippet("identity", `${requirePage}\nreturn {ok:true,fileId:penpot.currentFile.id,pageId:penpot.currentPage.id};`, { page: "A" }, "read");
 await withPageSession(f.client, async () => {
  await runOnPage(guarded, read, "A"); f.penpot.currentPage = f.pages[1]!;
  await expect(runOnPage(guarded, read, "A")).rejects.toThrow(/Unexpected external navigation/);
 });
});
