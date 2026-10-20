import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/instance/config.js";
import { init } from "../src/instance/init.js";
import { needsLocalProfile, requireLocalProfile, type LocalProfile } from "../src/local-profile.js";

const core = path.join(import.meta.dirname, "..");
const docker = path.join(core, "../docker");
const web = path.join(core, "../web");

async function filesUnder(directory: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(full)));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8")) as { version: string; bin?: Record<string, string>; dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };

// The Docker package depends on the core, never the other way round: the core offers a plug-in point and knows nothing about what plugs in.
describe("the core does not depend on the Docker package", () => {
  it("has no Docker code of its own", async () => {
    const files = (await filesUnder(path.join(core, "src"))).map((f) => path.relative(path.join(core, "src"), f));
    expect(files.filter((f) => f.startsWith("docker/") || /compose|lifecycle|secrets|template/.test(path.basename(f)))).toEqual([]);
  });

  it("imports nothing from it, and lists it nowhere in its package.json", async () => {
    for (const file of await filesUnder(path.join(core, "src"))) {
      const text = await readFile(file, "utf8");
      expect(text, path.relative(core, file)).not.toMatch(/from\s+["']@penpair\/docker["']|import\(\s*["']@penpair\/docker["']|require\(\s*["']@penpair\/docker["']/);
    }
    const manifest = await readJson(path.join(core, "package.json"));
    for (const field of [manifest.dependencies, manifest.peerDependencies, manifest.optionalDependencies]) expect(Object.keys(field ?? {})).not.toContain("@penpair/docker");
  });
});

// One command package per way of running Penpot, each carrying the core. The core has no command, so the two never fight over `penpair`.
describe("the command packages carry the core", () => {
  for (const [name, directory] of [["@penpair/web", web], ["@penpair/docker", docker]] as const) {
    it(`${name} depends on the core as a dependency and reaches it only through its public entry`, async () => {
      const manifest = await readJson(path.join(directory, "package.json"));
      expect(manifest.dependencies?.["@penpair/core"]).toMatch(/^workspace:/);
      expect(manifest.peerDependencies).toBeUndefined();
      for (const file of await filesUnder(path.join(directory, "src"))) {
        const text = await readFile(file, "utf8");
        for (const match of text.matchAll(/from\s+"([^"]+)"/g)) {
          const specifier = match[1] ?? "";
          if (specifier.startsWith("@penpair/")) expect(specifier, path.basename(file)).toBe("@penpair/core");
          if (specifier.startsWith(".")) expect(path.resolve(path.dirname(file), specifier), path.basename(file)).toContain(path.join(directory, "src"));
        }
      }
    });
  }

  it("the core has no command; the web and Docker packages each have `penpair`, started with what they add", async () => {
    expect((await readJson(path.join(core, "package.json"))).bin).toBeUndefined();
    expect((await readJson(path.join(web, "package.json"))).bin).toEqual({ penpair: "dist/cli.js" });
    expect((await readJson(path.join(docker, "package.json"))).bin).toEqual({ penpair: "dist/cli.js" });
    expect(await readFile(path.join(web, "src/cli.ts"), "utf8")).toMatch(/runCli\(process\.argv\.slice\(2\)\)/);
    expect(await readFile(path.join(docker, "src/cli.ts"), "utf8")).toMatch(/runCli\(process\.argv\.slice\(2\), \{ local: dockerProfile \}\)/);
  });
});

describe("running Penpot on this computer is a plug-in", () => {
  it("says where the commands come from when nothing provides them", () => {
    expect(() => requireLocalProfile(undefined)).toThrow(ConfigError);
    expect(() => requireLocalProfile(undefined)).toThrow(/npm i -D @penpair\/docker/);
    expect(needsLocalProfile).toMatch(/Penpot on the web needs nothing extra/);
  });

  it("is used by init only when Docker is meant, never for Penpot on the web", async () => {
    const root = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-boundary-"));
    const calls: string[] = [];
    const local = { init: async () => (calls.push("init"), { config: {} as never, createdConfig: true, createdSecrets: true, files: [], gitignoreAdded: false }) } as unknown as LocalProfile;
    await init(await root(), { external: "https://design.penpot.app" }, { local });
    expect(calls).toEqual([]);
    await init(await root(), {}, { local });
    expect(calls).toEqual(["init"]);
    await expect(init(await root(), {})).rejects.toThrow(/separate|not part of this install/);
  });
});

describe("the version", () => {
  it("is the one in package.json, for all four packages, each carrying exactly the version below it", async () => {
    const corePackage = await readJson(path.join(core, "package.json"));
    const dockerPackage = await readJson(path.join(docker, "package.json"));
    const webPackage = await readJson(path.join(web, "package.json"));
    const wrapper = await readJson(path.join(core, "../penpair/package.json"));
    const { version } = await import("../src/index.js");
    expect(version).toBe(corePackage.version);
    expect(dockerPackage.version).toBe(corePackage.version);
    expect(wrapper.version).toBe(corePackage.version);
    expect(webPackage.version).toBe(corePackage.version);
    expect(wrapper.dependencies?.["@penpair/web"]).toMatch(/^workspace:/);
  });
});
