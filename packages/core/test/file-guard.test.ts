import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { guardFile } from "../src/file-guard.js";
import { executeCode, maxSnippetBytes, type PenpotToolClient } from "../src/client.js";
import * as clientModule from "../src/client.js";
import * as endpointModule from "../src/endpoint.js";
import { runCli } from "../src/cli-main.js";
import { validateProjectConfig } from "../src/instance/config.js";
import { fileIdentityCheck } from "../src/instance/connection.js";
import { connectProject } from "../src/instance/connect.js";

const expected = { id: "file-one", name: "Shared design" };
const config = { instance: "demo", profile: { type: "external" as const, origin: "https://example.test" }, file: expected };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function editor() {
  const penpot = { currentFile: { ...expected }, writes: 0 };
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const logs: string[] = [];
      const result = await new AsyncFunction("penpot", "console", args.code)(penpot, { warn: (message: string) => logs.push(message) });
      return { isError: false, text: JSON.stringify({ result, log: logs.join("\n") }) };
    },
    async close() {},
  };
  return { penpot, client };
}
afterEach(() => vi.restoreAllMocks());

describe("per-execution file identity", () => {
  it("accepts the pinned file, then refuses a later write after switching files", async () => {
    const { penpot, client } = editor();
    const guarded = guardFile(client, expected);
    await executeCode(guarded, "return { id: penpot.currentFile.id };");
    penpot.currentFile = { id: "file-two", name: "Scratch" };
    await expect(executeCode(guarded, "penpot.writes++; return { ok: true }; ")).rejects.toMatchObject({ code: "file-mismatch" });
    expect(penpot.writes).toBe(0);
  });
  it("warns for a basic read and reports the actual connected file", async () => {
    const { penpot, client } = editor();
    penpot.currentFile.id = "another";
    const warnings: string[] = [];
    const result = await executeCode(guardFile(client, expected, { mode: "warn", warn: (message) => warnings.push(message) }), "return { id: penpot.currentFile.id };");
    expect(result.result).toEqual({ id: "another" });
    expect(warnings.join()).toMatch(/Expected file.*file-one.*another/);
  });
  it("keeps old configurations usable with a visible unpinned warning", () => {
    const { client } = editor();
    const warnings: string[] = [];
    expect(guardFile(client, undefined, { warn: (message) => warnings.push(message) })).toBe(client);
    expect(warnings.join()).toMatch(/No file ID is pinned/);
  });
  it("permits a deliberate override and makes it visible", async () => {
    const { penpot, client } = editor();
    penpot.currentFile.id = "another";
    const warnings: string[] = [];
    await executeCode(guardFile(client, expected, { anyFile: true, warn: (message) => warnings.push(message) }), "penpot.writes++; return { ok: true };");
    expect(penpot.writes).toBe(1);
    expect(warnings.join()).toMatch(/--any-file overrides/);
  });
  it("enforces the final guarded size before delivery", async () => {
    const callTool = vi.fn();
    const client = { callTool, close: async () => undefined };
    await expect(executeCode(guardFile(client, expected), "x".repeat(maxSnippetBytes))).rejects.toMatchObject({ code: "snippet-too-large" });
    expect(callTool).not.toHaveBeenCalled();
  });
  it("validates file pins and reports doctor identity evidence", () => {
    expect(validateProjectConfig(config).file).toEqual(expected);
    expect(() => validateProjectConfig({ ...config, file: { id: " " } })).toThrow(/file/);
    expect(fileIdentityCheck(config, { file: "Renamed", fileId: expected.id })).toMatchObject({ ok: true, file: { expected, actual: { id: expected.id } } });
    expect(fileIdentityCheck(config, { file: "Scratch", fileId: "other" })).toMatchObject({ ok: false, file: { ok: false } });
  });
});

it("applies the file guard to adapter connections", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-file-adapter-"));
  await writeFile(path.join(root, "penpair.config.json"), JSON.stringify(config));
  const { penpot, client } = editor();
  penpot.currentFile.id = "other";
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(endpointModule, "resolveEndpoint").mockResolvedValue({ url: "https://example.test/mcp", description: { source: "env", origin: "https://example.test", pathname: "/mcp" } });
  vi.spyOn(clientModule, "connect").mockResolvedValue(client);
  const code = await runCli(["example"], { adapters: [{ name: "example", commands: [{ name: "example", summary: "", usage: [], run: async (context) => {
    await context.withPenpot((connection) => executeCode(connection, "penpot.writes++; return { ok: true };"));
    return 0;
  } }] }] });
  expect(code).toBe(1);
  expect(penpot.writes).toBe(0);
});

it("pins only after confirmation and preserves project-owned configuration", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-file-pin-"));
  const { file: _file, ...unpinned } = config;
  await writeFile(path.join(root, "penpair.config.json"), JSON.stringify({ ...unpinned, example: { keep: true } }));
  const io = { say: () => undefined, askHidden: async () => "", sleep: async () => undefined,
    openFile: async () => ({ file: expected.name, fileId: expected.id, pages: [] }), confirmFile: async () => true };
  const result = await connectProject(root, unpinned, io, { pasted: "https://example.test/mcp?userToken=fixture" });
  expect(result.filePinned).toBe(true);
  expect(JSON.parse(await readFile(path.join(root, "penpair.config.json"), "utf8"))).toMatchObject({ file: expected, example: { keep: true } });
  await expect(connectProject(root, config, { ...io, openFile: async () => ({ file: "Scratch", fileId: "other", pages: [] }) })).rejects.toThrow(/Expected file/);
});
