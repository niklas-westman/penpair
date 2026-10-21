import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as adapters from "../src/adapters.js";
import * as client from "../src/client.js";
import * as endpoint from "../src/endpoint.js";
import { runCli } from "../src/cli-main.js";
import { loadConfig, loadOptionalConfig } from "../src/instance/config.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const hosted = { instance: "demo", profile: { type: "external", origin: "https://design.penpot.app" } };
const folder = (): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), "penpair-config-"));
const file = (root: string): string => path.join(root, "penpair.config.json");

afterEach(() => vi.restoreAllMocks());

describe("configuration failures", () => {
  it("treats only an absent file as optional", async () => {
    const root = await folder();
    expect(await loadOptionalConfig(root)).toBeUndefined();
    expect(await adapters.readRawConfig(root)).toEqual({});
    await expect(loadConfig(root)).rejects.toMatchObject({ code: "missing" });
    await fs.symlink(path.join(root, "missing.json"), file(root));
    await expect(loadOptionalConfig(root)).rejects.toMatchObject({ code: "unreadable" });
  });

  it("reports unreadable files without hiding them as absent", async () => {
    const root = await folder();
    const failure = Object.assign(new Error("private details"), { code: "EACCES" });
    vi.mocked(fs.readFile).mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);
    await expect(loadConfig(root)).rejects.toMatchObject({ code: "unreadable", message: expect.stringMatching(/EACCES.*permissions/) });
    await expect(adapters.readRawConfig(root)).rejects.toMatchObject({ code: "unreadable" });
  });

  it("reports malformed JSON without echoing file content", async () => {
    const root = await folder();
    await fs.writeFile(file(root), '{"accidentalCredential":"PRIVATE-CONTENT",');
    await expect(loadConfig(root)).rejects.toMatchObject({ code: "invalid-json", message: expect.not.stringContaining("PRIVATE-CONTENT") });
    await expect(adapters.readRawConfig(root)).rejects.toMatchObject({ code: "invalid-json" });
  });

  it.each([
    [[], /JSON object/],
    [{ ...hosted, instance: 3 }, /instance/],
    [{ ...hosted, profile: { type: "unknown" } }, /profile.type/],
    [{ ...hosted, profile: null }, /profile.type/],
    [{ ...hosted, profile: { type: "external", origin: "wrong" } }, /profile.origin/],
    [{ ...hosted, snippets: ["../outside.mjs"] }, /snippets/],
  ])("rejects invalid config %# through both readers", async (value, message) => {
    const root = await folder();
    await fs.writeFile(file(root), JSON.stringify(value));
    await expect(loadConfig(root)).rejects.toThrow(message);
    await expect(adapters.readRawConfig(root)).rejects.toThrow(message);
  });
});

function cliSpies(root: string) {
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const resolve = vi.spyOn(endpoint, "resolveEndpoint").mockRejectedValue(new Error("unexpected endpoint discovery"));
  const connect = vi.spyOn(client, "connect").mockRejectedValue(new Error("unexpected connection"));
  const imports = vi.spyOn(adapters, "loadAdapters");
  return { output, errors, resolve, connect, imports };
}

describe("configuration before CLI connections and imports", () => {
  it.each([
    ["pages"], ["archive", "--apply", "--any-instance"], ["run", "example", "--apply"],
    ["probe", "--deep", "--write"], ["hello"], ["snippets", "check"], ["doctor"],
  ])("stops %j before discovery or imports on invalid fields", async (...args) => {
    const root = await folder();
    await fs.writeFile(file(root), JSON.stringify({ ...hosted, instance: "Invalid!", adapters: ["./side-effect.mjs"] }));
    const spies = cliSpies(root);
    expect(await runCli(args)).toBe(1);
    expect(spies.errors.mock.calls.flat().join()).toMatch(/instance/);
    expect(spies.resolve).not.toHaveBeenCalled();
    expect(spies.connect).not.toHaveBeenCalled();
    expect(spies.imports).not.toHaveBeenCalled();
  });

  it.each(["{", "[]"])("stops malformed/non-object config %s before discovery", async (source) => {
    const root = await folder();
    await fs.writeFile(file(root), source);
    const spies = cliSpies(root);
    expect(await runCli(["pages", "--standalone", "--any-instance"])).toBe(1);
    expect(spies.resolve).not.toHaveBeenCalled();
    expect(spies.imports).not.toHaveBeenCalled();
  });

  it("stops an unreadable config before discovery or imports", async () => {
    const root = await folder();
    await fs.mkdir(file(root));
    const spies = cliSpies(root);
    expect(await runCli(["pages"])).toBe(1);
    expect(spies.errors.mock.calls.flat().join()).toMatch(/Cannot read/);
    expect(spies.resolve).not.toHaveBeenCalled();
    expect(spies.imports).not.toHaveBeenCalled();
  });

  it("checks config offline, preserving adapter blocks without executing them", async () => {
    const root = await folder();
    await fs.writeFile(file(root), JSON.stringify({ ...hosted, adapters: ["./throws.mjs"], example: { enabled: true } }));
    await fs.writeFile(path.join(root, "throws.mjs"), 'throw new Error("must not import");');
    const spies = cliSpies(root);
    expect(await runCli(["config", "check", "--json"])).toBe(0);
    expect(JSON.parse(String(spies.output.mock.calls[0]?.[0]))).toEqual({ valid: true, file: "penpair.config.json" });
    expect((await adapters.readRawConfig(root)).example).toEqual({ enabled: true });
    expect(spies.imports).not.toHaveBeenCalled();
    expect(spies.resolve).not.toHaveBeenCalled();
  });

  it("returns a structured failed check and still offers the schema while config is broken", async () => {
    const root = await folder();
    await fs.writeFile(file(root), "{");
    const spies = cliSpies(root);
    expect(await runCli(["config", "check", "--json"])).toBe(1);
    expect(JSON.parse(String(spies.output.mock.calls[0]?.[0]))).toMatchObject({ valid: false, error: { code: "invalid-json" } });
    expect(await runCli(["config", "schema"])).toBe(0);
    expect(JSON.parse(String(spies.output.mock.calls[1]?.[0]))).toMatchObject({ type: "object", required: ["instance"] });
    expect(spies.imports).not.toHaveBeenCalled();
    expect(spies.resolve).not.toHaveBeenCalled();
  });
});

describe("explicit config-free inspection", () => {
  it.each([["pages"], ["archive", "--apply", "--any-instance"], ["run", "example", "--apply"]])("requires a project or explicit inspection mode for %j", async (...args) => {
    const spies = cliSpies(await folder());
    expect(await runCli(args)).toBe(1);
    expect(spies.errors.mock.calls.flat().join()).toMatch(/--standalone/);
    expect(spies.resolve).not.toHaveBeenCalled();
  });

  it("allows a config-free built-in read through the normal connection", async () => {
    const spies = cliSpies(await folder());
    spies.resolve.mockResolvedValue({ url: "https://example.test/mcp", description: { source: "env", origin: "https://example.test", pathname: "/mcp" } });
    const callTool = vi.fn().mockResolvedValue({ text: JSON.stringify({ result: { ok: true, pages: [] }, log: "" }), isError: false });
    const close = vi.fn().mockResolvedValue(undefined);
    spies.connect.mockResolvedValue({ callTool, close });
    expect(await runCli(["pages", "--standalone"])).toBe(0);
    expect(callTool).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([["archive", "--apply"], ["run", "example"], ["probe", "--deep", "--write"], ["doctor"]])("rejects %j as standalone", async (...args) => {
    const spies = cliSpies(await folder());
    expect(await runCli([...args, "--standalone"])).toBe(1);
    expect(spies.resolve).not.toHaveBeenCalled();
  });

  it("never bypasses a configured project", async () => {
    const root = await folder();
    await fs.writeFile(file(root), JSON.stringify(hosted));
    const spies = cliSpies(root);
    expect(await runCli(["pages", "--standalone", "--any-instance"])).toBe(1);
    expect(spies.resolve).not.toHaveBeenCalled();
  });

  it("keeps the instance guard for valid project commands", async () => {
    const root = await folder();
    await fs.writeFile(file(root), JSON.stringify(hosted));
    const spies = cliSpies(root);
    spies.resolve.mockResolvedValue({ url: "https://other.test/mcp", description: { source: "env", origin: "https://other.test", pathname: "/mcp" } });
    expect(await runCli(["pages"])).toBe(1);
    expect(spies.errors.mock.calls.flat().join()).toMatch(/this project uses/);
    expect(spies.connect).not.toHaveBeenCalled();
  });
});
