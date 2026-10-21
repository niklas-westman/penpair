import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runCli, runCommand } from "../src/cli-main.js";
import { collectCommand, commandOutput, commandSignal, CommandInterruptedError } from "../src/command-result.js";
import { executeCode, UncertainExecutionError } from "../src/client.js";
import * as clientModule from "../src/client.js";
import * as endpointModule from "../src/endpoint.js";
import { PenpairError } from "../src/errors.js";
import type { Adapter } from "../src/adapters.js";

afterEach(() => vi.restoreAllMocks());
async function project(content?: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-command-"));
  await writeFile(path.join(root, "penpair.config.json"), content ?? JSON.stringify({ instance: "shared", profile: { type: "external", origin: "https://example.test" } }));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return root;
}
const endpoint = { url: "https://example.test/mcp?userToken=PRIVATE", description: { source: "env" as const, origin: "https://example.test", pathname: "/mcp" } };
const adapter = (run: Adapter["commands"][number]["run"]): Adapter[] => [{ name: "fixture", commands: [{ name: "fixture", summary: "fixture", usage: [], run }] }];

it("emits one versioned JSON document for offline success and invalid configuration", async () => {
  const root = await project();
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  expect(await runCli(["--json", "config", "check"])).toBe(0);
  expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({ schemaVersion: 1, outcome: "success", completeness: { complete: true }, data: { valid: true } });
  await writeFile(path.join(root, "penpair.config.json"), "{");
  const failed = await runCommand(["pages"]);
  expect(failed).toMatchObject({ outcome: "failed", exitCode: 1, errors: [{ code: "invalid-json" }] });
});

it("preserves structured truncation instead of turning a partial tree into success", async () => {
  await project();
  vi.spyOn(endpointModule, "resolveEndpoint").mockResolvedValue(endpoint);
  vi.spyOn(clientModule, "connect").mockResolvedValue({ async callTool() { return { text: JSON.stringify({ result: { ok: true, fileId: "file", pageId: "page", lines: ["one"], truncated: true }, log: "" }), isError: false }; }, async close() {} });
  expect(await runCommand(["tree", "--page", "P"])).toMatchObject({ outcome: "incomplete", exitCode: 3, target: { fileId: "file", pageId: "page" }, completeness: { complete: false }, data: { lines: ["one"], truncated: true } });
});

it("uses the same contract for adapter drift and redacts connection credentials at the boundary", async () => {
  await project();
  vi.spyOn(endpointModule, "resolveEndpoint").mockResolvedValue(endpoint);
  vi.spyOn(clientModule, "connect").mockResolvedValue({ async callTool() { throw new Error("unused"); }, async close() {} });
  const result = await runCommand(["fixture"], { adapters: adapter(async (context) => {
    await context.withPenpot(async () => undefined);
    context.output!.result({ current: false, note: "comparison" });
    context.output!.error("fixture warning PRIVATE");
    return 2;
  }) });
  expect(result).toMatchObject({ outcome: "drift", exitCode: 2, data: { current: false } });
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

it("keeps uncertain writes and read suspension distinct", async () => {
  await project();
  expect(await runCommand(["fixture"], { adapters: adapter(async () => { throw new UncertainExecutionError("run-one", "lost acknowledgment"); }) })).toMatchObject({ outcome: "uncertain", exitCode: 4, runId: "run-one", errors: [{ code: "write-uncertain" }] });
  expect(await runCommand(["fixture"], { adapters: adapter(async () => { throw new PenpairError("plugin-suspended", "sleeping tab"); }) })).toMatchObject({ outcome: "failed", exitCode: 1, errors: [{ code: "plugin-suspended", remedy: expect.any(String) }] });
});

it("cancels before work and never describes an interrupted delivered write as safely undone", async () => {
  const controller = new AbortController(); controller.abort();
  const work = vi.fn(async () => 0);
  expect(await collectCommand("test", work, { signal: controller.signal })).toMatchObject({ outcome: "cancelled", exitCode: 130 });
  expect(work).not.toHaveBeenCalled();
  const during = new AbortController(); let writes = 0;
  const result = await collectCommand("write", async () => {
    await executeCode({ async callTool() { writes++; during.abort(new CommandInterruptedError("cancelled")); return { text: '{"result":{"ok":true},"log":""}', isError: false }; }, async close() {} }, "mutate()", { effect: "write" });
    return 0;
  }, { signal: during.signal });
  expect(result).toMatchObject({ outcome: "uncertain", exitCode: 4 });
  expect(writes).toBe(1);
});

it("enforces a command deadline through the signal and emits one JSON document", async () => {
  await project();
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const code = await runCli(["fixture", "--json", "--timeout-ms", "10"], { adapters: adapter(async () => {
    const signal = commandSignal()!;
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    return 0;
  }) });
  expect(code).toBe(124); expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({ outcome: "deadline", exitCode: 124 });
});

it("rejects ignored write flags and nonfinite numbers before connecting", async () => {
  await project();
  const connect = vi.spyOn(clientModule, "connect");
  expect(await runCommand(["pages", "--apply"])).toMatchObject({ outcome: "failed" });
  expect(await runCommand(["tree", "--page", "P", "--depth", "NaN"])).toMatchObject({ outcome: "failed" });
  expect(connect).not.toHaveBeenCalled();
});
