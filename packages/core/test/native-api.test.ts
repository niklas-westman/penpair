import { describe, expect, it } from "vitest";
import { waitForStableLayout } from "../src/layout.js";
import { createCheckpoint, validateFileIntegrity } from "../src/native-api.js";
import type { PenpotToolClient } from "../src/client.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function fixture(beforeCall: (count: number) => void = () => undefined) {
  const shape = { id: "shape", x: 0, y: 0, width: 10, height: 10, children: [] };
  const penpot = { currentFile: { id: "file" }, currentPage: { id: "page", root: shape, getShapeById: (id: string) => id === shape.id ? shape : null } };
  let calls = 0;
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      beforeCall(++calls);
      const result = await new AsyncFunction("penpot", args.code)(penpot);
      return { text: JSON.stringify({ result, log: "" }), isError: false };
    }, async close() {},
  };
  return { client, penpot, shape, calls: () => calls };
}
const noSleep = async () => undefined;

describe("native layout with older-API fallback", () => {
  it("prefers a supported native wait", async () => {
    const f = fixture();
    let waits = 0;
    Object.assign(f.penpot, { waitForLayoutUpdate: async () => { waits++; } });
    expect(await waitForStableLayout(f.client)).toMatchObject({ stable: true, method: "native", samples: 1 });
    expect(waits).toBe(1);
  });
  it("polls geometry until an old API settles", async () => {
    const f = fixture((n) => { f.shape.width = n < 3 ? n * 10 : 30; });
    expect(await waitForStableLayout(f.client, { sleep: noSleep })).toMatchObject({ stable: true, method: "geometry", samples: 4 });
  });
  it("reports a bounded native timeout instead of silently declaring success", async () => {
    const f = fixture();
    Object.assign(f.penpot, { waitForLayoutUpdate: async () => { throw new Error("layout timeout"); } });
    expect(await waitForStableLayout(f.client)).toMatchObject({ stable: false, method: "native", reason: "layout timeout" });
  });
  it("stops bounded geometry polling when every read changes", async () => {
    const f = fixture((n) => { f.shape.width = n; });
    expect(await waitForStableLayout(f.client, { timeoutMs: 10, intervalMs: 2, sleep: noSleep })).toMatchObject({ stable: false, method: "geometry", samples: 6 });
  });
  it("rejects a missing target and a target change between samples", async () => {
    const missing = fixture();
    await expect(waitForStableLayout(missing.client, { shapeId: "gone" })).rejects.toThrow(/does not exist/);
    const changed = fixture((n) => { if (n === 2) changed.penpot.currentFile.id = "another"; });
    await expect(waitForStableLayout(changed.client, { sleep: noSleep })).rejects.toThrow(/target changed/);
  });
});

describe("optional file integrity", () => {
  it("reports unsupported separately from a valid file", async () => {
    expect(await validateFileIntegrity(fixture().client)).toEqual({ supported: false });
    const f = fixture();
    Object.assign(f.penpot.currentFile, { validate: () => [] });
    expect(await validateFileIntegrity(f.client)).toEqual({ supported: true, valid: true, issues: [] });
  });
  it("reports referential integrity issues", async () => {
    const f = fixture();
    Object.assign(f.penpot.currentFile, { validate: () => [{ code: "dangling-component" }] });
    expect(await validateFileIntegrity(f.client)).toMatchObject({ supported: true, valid: false, issues: [{ code: "dangling-component" }] });
  });
  it("does not infer integrity from a throwing or malformed API", async () => {
    const f = fixture();
    Object.assign(f.penpot.currentFile, { validate: () => "not observations" });
    await expect(validateFileIntegrity(f.client)).rejects.toThrow(/no issue list/);
    Object.assign(f.penpot.currentFile, { validate: () => { throw new Error("not available here"); } });
    await expect(validateFileIntegrity(f.client)).rejects.toThrow(/not available/);
  });
});

describe("named version checkpoints", () => {
  const checkpoint = { label: "before token push", runId: "test-run" };
  const fast = { settleMs: 0, sleep: noSleep };
  it("keeps unsupported version history explicit", async () => {
    expect(await createCheckpoint(fixture().client, checkpoint, { ...fast, apply: true })).toEqual({ supported: false });
  });
  it("only creates with apply, reads back, and reuses the same run checkpoint", async () => {
    const f = fixture();
    const versions: { label: string; createdAt: string }[] = [];
    Object.assign(f.penpot.currentFile, { findVersions: async () => versions, saveVersion: async (label: string) => { versions.push({ label, createdAt: "2026-10-21" }); } });
    expect((await createCheckpoint(f.client, checkpoint, fast)).report?.phase).toBe("inspected");
    expect(versions).toHaveLength(0);
    expect((await createCheckpoint(f.client, checkpoint, { ...fast, apply: true })).report?.verified).toBe(true);
    expect((await createCheckpoint(f.client, checkpoint, { ...fast, apply: true })).report?.verified).toBe(true);
    expect(versions).toHaveLength(1);
  });
  it("refuses a file switch between checkpoint inspection and apply", async () => {
    const f = fixture((n) => { if (n === 3) f.penpot.currentFile.id = "another"; });
    let writes = 0;
    Object.assign(f.penpot.currentFile, { findVersions: async () => [], saveVersion: async () => { writes++; } });
    await expect(createCheckpoint(f.client, checkpoint, { ...fast, apply: true })).rejects.toThrow(/file changed/);
    expect(writes).toBe(0);
  });
});
