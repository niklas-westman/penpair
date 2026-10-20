import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { ConfigError, isExternal, loadConfig, requireLocal, validateProjectConfig } from "../src/instance/config.js";
import { init } from "../src/instance/init.js";
import { assertEndpointIsInstance, doctorExternal } from "../src/instance/connection.js";
import { probe } from "../src/probe.js";

const hosted = { instance: "design", profile: { type: "external", origin: "https://design.penpot.app" } };

describe("an external Penpot as a project", () => {
  it("is a valid config with no Docker settings", () => {
    const config = validateProjectConfig(hosted);
    expect(isExternal(config)).toBe(true);
  });

  it.each([
    [{ ...hosted, profile: { type: "external", origin: "design.penpot.app" } }, /origin/],
    [{ ...hosted, profile: { type: "external", origin: "https://design.penpot.app/mcp" } }, /no path/],
    [{ ...hosted, profile: { type: "external", origin: "ftp://x" } }, /origin/],
    [{ ...hosted, instance: "Design!" }, /instance/],
    [{ ...hosted, snippets: ["../outside"] }, /snippets/],
  ])("rejects %#", (value, message) => {
    expect(() => validateProjectConfig(value)).toThrow(message);
  });

  it("still validates a local instance, and refuses the Docker commands for an external one", () => {
    expect(isExternal(validateProjectConfig({ instance: "x", penpotVersion: "2.18.3", ports: { frontend: 9002, mail: 1082 }, directory: ".penpair" }))).toBe(false);
    expect(() => requireLocal(validateProjectConfig(hosted))).toThrow(/someone else runs/);
  });

  it("is set up by init with only the config, no compose file and no secrets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-external-"));
    const result = await init(root, { external: "https://design.penpot.app", instance: "design" });
    expect(result).toMatchObject({ createdConfig: true, createdSecrets: false, files: [] });
    expect(await readdir(root)).toEqual(["penpair.config.json"]);
    expect(isExternal(await loadConfig(root))).toBe(true);
    expect(await readFile(path.join(root, "penpair.config.json"), "utf8")).not.toMatch(/SECRET|PASSWORD|userToken/);
    const again = await init(root, { isFree: async () => true });
    expect(again).toMatchObject({ createdConfig: false, files: [] });
  });

  it("refuses an endpoint for another Penpot, and accepts its own whatever the path or token", () => {
    const config = validateProjectConfig(hosted);
    expect(() => assertEndpointIsInstance({ source: "env-file", origin: "https://design.penpot.app" }, config)).not.toThrow();
    expect(() => assertEndpointIsInstance({ source: "codex-config", origin: "http://localhost:9001" }, config)).toThrow(/uses https:\/\/design\.penpot\.app/);
  });

  it("is checked by a doctor that does not ask for Docker", async () => {
    const config = validateProjectConfig(hosted) as Parameters<typeof doctorExternal>[0];
    const answering = (async () => ({ status: 200 })) as unknown as typeof fetch;
    const up = await doctorExternal(config, { fetch: answering, mcp: { origin: "https://design.penpot.app", connect: async () => ({ file: "design-file" }) } });
    expect(up.map((c) => [c.check, c.ok])).toEqual([["penpot", true], ["editor and plugin", true]]);
    const wrongKey = await doctorExternal(config, { fetch: answering, mcp: { origin: "http://localhost:9001", connect: async () => ({ file: "x" }) } });
    expect(wrongKey.at(-1)).toMatchObject({ ok: false });
    expect(wrongKey.at(-1)!.detail).toMatch(/not https:\/\/design\.penpot\.app/);
    const down = await doctorExternal(config, { fetch: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    expect(down[0]).toMatchObject({ check: "penpot", ok: false });
    expect(down[0]!.remedy).toMatch(/network/);
  });

  it("is a ConfigError, not a crash, when the config is not JSON", async () => {
    await expect(loadConfig(await mkdtemp(path.join(os.tmpdir(), "penpair-none-")))).rejects.toBeInstanceOf(ConfigError);
  });
});

const endpoint = { url: "https://design.penpot.app/mcp/stream?userToken=SECRET", description: { source: "env" as const, origin: "https://design.penpot.app", pathname: "/mcp/stream" } };
const noExecute: PenpotToolClient = {
  async callTool() {
    throw new Error("should not be called");
  },
  async listTools() {
    return ["high_level_overview", "penpot_api_info", "export_shape"];
  },
  async close() {},
};

describe("probing a server that offers fewer tools", () => {
  it("says plainly that penpair cannot drive it, without running anything", async () => {
    const report = await probe(endpoint, async () => noExecute);
    expect(report.tools).toEqual(["high_level_overview", "penpot_api_info", "export_shape"]);
    expect(JSON.stringify(report.capabilities)).toMatch(/no execute_code/);
    expect(report.requestLimit).toEqual({});
    expect(JSON.stringify(report)).not.toContain("SECRET");
  });
});
