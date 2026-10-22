import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prepareFileScript, runFileScript } from "../src/run-file.js";
import type { PenpotToolClient } from "../src/client.js";
import { kitFixture } from "./helpers/kit-fixture.js";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function trial() {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-human-trial-fixture-")), f = kitFixture();
  const metadata = new Map<string, string>();
  Object.assign(f.penpot.currentFile, {
    getSharedPluginData: (namespace: string, key: string) => metadata.get(namespace + "/" + key) ?? "",
    setSharedPluginData: (namespace: string, key: string, value: string) => metadata.set(namespace + "/" + key, value),
  });
  await cp(fileURLToPath(new URL("../../../examples/trials/", import.meta.url)), path.join(root, "trial"), { recursive: true });
  const client: PenpotToolClient = { async callTool(_name, args) { const result = await new AsyncFunction("penpot", String(args.code))(f.penpot); return { text: JSON.stringify({ result, log: "" }), isError: false }; }, async close() {} };
  return { root, f, client };
}
describe("controlled human-trial example bodies (offline preparation only)", () => {
  it("keeps a deliberate post-write failure uncertain, then independently reconciles without duplicate objects", async () => {
    const { root, f, client } = await trial();
    const prepared = await prepareFileScript(root, "trial/recovery-build.js", { page: "Candidate", inspect: "trial/recovery-inspect.js", readback: "trial/recovery-readback.js", params: { fileId: "file", pageId: "page", name: "Recovery trial", marker: "trial-fixture", failAfterWrite: "true" } });
    let runId = "";
    try { await runFileScript(client, prepared, { apply: true, journal: { root } }); } catch (error) { runId = (error as { runId: string }).runId; }
    expect(runId).toBeTruthy(); expect(f.root.children).toHaveLength(1);
    const id = f.root.children[0]!.id;
    expect(await runFileScript(client, prepared, { apply: true, journal: { root, runId, resume: true } })).toMatchObject({ verified: true });
    expect(f.root.children.map(shape => shape.id)).toEqual([id]);
  });
  it("opens an intentional writer-contention window while preserving design objects", async () => {
    const { root, f, client } = await trial();
    const prepared = await prepareFileScript(root, "trial/hold-writer.js", { page: "Candidate", inspect: "trial/hold-inspect.js", readback: "trial/hold-readback.js", params: { fileId: "file", pageId: "page", holdMs: "200", marker: "hold-fixture" } });
    let ready!: () => void; const active = new Promise<void>(resolve => { ready = resolve; });
    const first = runFileScript(client, prepared, { apply: true, journal: { root }, onStep: message => { if (message === "run-file") ready(); } });
    await active;
    await expect(runFileScript({ ...client }, prepared, { apply: true, journal: { root } })).rejects.toThrow(/writer/i);
    expect(await first).toMatchObject({ verified: true }); expect(f.root.children).toEqual([]);
  });
});
