import { openInBrowser } from "../src/instance/tty.js";
import { nodeRunner } from "../src/instance/runner.js";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openProject, projectStatus } from "../src/project-status.js";
import type { PenpotToolClient } from "../src/client.js";
const config = { instance: "trial", file: { id: "file /?" }, profile: { type: "external" as const, origin: "https://design.penpot.app" } };
describe("public project status and opening", () => {
 it("reports a failed platform browser launch rather than claiming opened", async () => {
  const run = vi.spyOn(nodeRunner, "run").mockResolvedValue({ code: 1, stdout: "", stderr: "unavailable" });
  try { await expect(openInBrowser("https://example.test")).rejects.toThrow(/launch failed/); } finally { run.mockRestore(); }
 });
 it("encodes the pinned file and opens only the configured origin", async () => {
  let opened = ""; await openProject(config, async url => { opened = url; });
  expect(opened).toBe("https://design.penpot.app/#/workspace?file-id=file%20%2F%3F");
  await expect(openProject({ ...config, file: undefined }, async () => {})).rejects.toThrow(/Pin/);
 });
 it("separates observed connection facts from missing evidence and supports explicit adapter hooks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-status-")); let closed = false;
  const client: PenpotToolClient = { async callTool() { return { isError: false, text: JSON.stringify({ result: { ok: true, fileId: config.file.id, revision: 1, pages: [{ id: "page", name: "P" }], apiVersion: "test" } }) }; }, async close() { closed = true; } };
  const report = await projectStatus(root, config, { reachable: async () => true, connection: async () => client, adapterStatus: async () => [{ id: "declared", label: "Declarations", state: "warning", detail: "Stale snapshot" }] });
  expect(report.connection).toMatchObject({ fileId: config.file.id, pages: [{ id: "page" }] }); expect(closed).toBe(true);
  expect(report.lines).toEqual(expect.arrayContaining([expect.objectContaining({ id: "declared", state: "warning" }), expect.objectContaining({ id: "baselines", state: "unknown" })])); expect(report.ok).toBe(false);
 });
 it("does not turn a foreign file or a failed plugin into healthy status", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-status-"));
  const client: PenpotToolClient = { async callTool() { return { isError: false, text: JSON.stringify({ result: { ok: true, fileId: "foreign", revision: 1, pages: [] } }) }; }, async close() {} };
  const report = await projectStatus(root, config, { reachable: async () => true, connection: async () => client });
  expect(report.lines.find(l => l.id === "connection")!.state).toBe("failed"); expect(report.connection).toBeNull();
 });
});
