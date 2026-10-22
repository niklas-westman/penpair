import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineAdapter, loadAdapters, readRawConfig, reservedCommands } from "../src/adapters.js";
import { runCli } from "../src/cli-main.js";
import { validateProjectConfig } from "../src/instance/config.js";

const hosted = { instance: "demo", profile: { type: "external", origin: "https://design.penpot.app" } };
const folder = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-adapters-"));
const adapterSource = (extra = ""): string => `export default { name: "demo-adapter", commands: [{ name: "hello", summary: "Says hello", usage: ["penpair hello <name>   greets"], run: async (context, args) => { console.log("hello " + args.join(",") + " in " + context.root.split("/").pop() + " raw=" + JSON.stringify(context.rawConfig.demo ?? null)); return 7; } }${extra}] };\n`;

afterEach(() => vi.restoreAllMocks());

describe("adapters in the project's configuration", () => {
  it("are a list of names or paths", () => {
    expect(() => validateProjectConfig({ ...hosted, adapters: ["@penpair/marwes-ui", "./tools/adapter.mjs"] })).not.toThrow();
    expect(() => validateProjectConfig({ ...hosted, adapters: "x" })).toThrow(/adapters/);
    expect(() => validateProjectConfig({ ...hosted, adapters: [1] })).toThrow(/adapters/);
  });

  it("keep their own settings in their own block, which the core does not judge", async () => {
    const root = await folder();
    await writeFile(path.join(root, "penpair.config.json"), JSON.stringify({ ...hosted, demo: { anything: true } }));
    expect((await readRawConfig(root)).demo).toEqual({ anything: true });
    expect(() => validateProjectConfig({ ...hosted, demo: { anything: true } })).not.toThrow();
  });
});

describe("loading adapters", () => {
  it("loads one from a relative path and offers its commands", async () => {
    const root = await folder();
    await writeFile(path.join(root, "adapter.mjs"), adapterSource());
    const { adapters, problems } = await loadAdapters(root, ["./adapter.mjs"]);
    expect(problems).toEqual([]);
    expect(adapters.map((a) => a.name)).toEqual(["demo-adapter"]);
    expect(adapters[0]!.commands.map((c) => c.name)).toEqual(["hello"]);
  });

  it("says how to install one that is missing, and keeps going", async () => {
    const root = await folder();
    await writeFile(path.join(root, "adapter.mjs"), adapterSource());
    const { adapters, problems } = await loadAdapters(root, ["@penpair/not-installed", "./adapter.mjs"]);
    expect(problems.join()).toMatch(/not installed in this project[\s\S]*npm i -D @penpair\/not-installed/);
    expect(adapters).toHaveLength(1);
  });

  it("refuses a command that the core already has, or that another adapter took", async () => {
    const root = await folder();
    await writeFile(path.join(root, "clash.mjs"), `export default { name: "clash", commands: [{ name: "doctor", summary: "", usage: [], run: async () => 0 }] };\n`);
    await writeFile(path.join(root, "a.mjs"), adapterSource());
    await writeFile(path.join(root, "b.mjs"), adapterSource().replace("demo-adapter", "second"));
    const { adapters, problems } = await loadAdapters(root, ["./clash.mjs", "./a.mjs", "./b.mjs"]);
    expect(problems.join("\n")).toMatch(/"doctor" is one the core already has/);
    expect(problems.join("\n")).toMatch(/"hello" is already provided by demo-adapter/);
    expect(adapters.find((a) => a.name === "clash")?.commands).toEqual([]);
    expect(adapters.find((a) => a.name === "second")?.commands).toEqual([]);
  });

  it("explains a module that is not an adapter", async () => {
    const root = await folder();
    await writeFile(path.join(root, "nope.mjs"), "export const x = 1;\n");
    expect((await loadAdapters(root, ["./nope.mjs"])).problems.join()).toMatch(/defineAdapter/);
  });

  it("defineAdapter returns what it is given, and the reserved names cover the core's commands", () => {
    const adapter = { name: "x", commands: [] };
    expect(defineAdapter(adapter)).toBe(adapter);
    for (const name of ["setup", "doctor", "baselines", "up"]) expect(reservedCommands).toContain(name);
  });
});

describe("the command line with an adapter", () => {
  it("runs the adapter's command with its arguments and the project's settings, and returns its exit code", async () => {
    const root = await folder();
    await writeFile(path.join(root, "penpair.config.json"), JSON.stringify({ ...hosted, adapters: ["./adapter.mjs"], demo: { level: 3 } }));
    await writeFile(path.join(root, "adapter.mjs"), adapterSource());
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    expect(await runCli(["hello", "a", "--flag", "b"])).toBe(7);
    expect(log).toHaveBeenCalledWith(`hello a,--flag,b in ${path.basename(root)} raw={"level":3}`);
  });

  it("names configured extensions without loading their commands in help", async () => {
    const root = await folder();
    await writeFile(path.join(root, "penpair.config.json"), JSON.stringify({ ...hosted, adapters: ["./adapter.mjs"] }));
    await writeFile(path.join(root, "adapter.mjs"), adapterSource());
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    expect(await runCli(["--help"])).toBe(0);
    expect(String(log.mock.calls[0]?.[0])).toMatch(/Configured executable extensions[\s\S]*adapter\.mjs/);
  });

  it("warns about an adapter that is not installed only when it matters", async () => {
    const root = await folder();
    await writeFile(path.join(root, "penpair.config.json"), JSON.stringify({ ...hosted, adapters: ["@penpair/not-installed"] }));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    await runCli(["skills"]);
    expect(err).not.toHaveBeenCalled();
    await runCli(["--help"]);
    expect(err).not.toHaveBeenCalled();
    await runCli(["unknown-extension-command"]);
    expect(err.mock.calls.flat().join()).toMatch(/not installed in this project/);
  });
});
