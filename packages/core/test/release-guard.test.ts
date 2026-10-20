import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript, shared with the release scripts
import { checkVersions, guardScript, publishOrder, loadPackages } from "../../../scripts/lib/versions.mjs";

const run = promisify(execFile);
const repository = path.join(import.meta.dirname, "../../..");

interface Fixture { root: string; write(folder: string, json: object): Promise<void> }

/** A throwaway repository: the real scripts, and packages the test controls. */
async function fixture(version = "1.2.3", sourceVersion = version): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-release-"));
  await cp(path.join(repository, "scripts"), path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "packages/core/src"), { recursive: true });
  await writeFile(path.join(root, "packages/core/src/version.ts"), `export const version = "${sourceVersion}";\n`);
  const write = async (folder: string, json: object): Promise<void> => {
    await mkdir(path.join(root, "packages", folder), { recursive: true });
    await writeFile(path.join(root, "packages", folder, "package.json"), JSON.stringify(json, null, 2));
  };
  const guarded = { prepublishOnly: guardScript };
  await write("core", { name: "@penpair/core", version, scripts: guarded });
  await write("web", { name: "@penpair/web", version, scripts: guarded, dependencies: { "@penpair/core": "workspace:*" } });
  await write("docker", { name: "@penpair/docker", version, scripts: guarded, dependencies: { "@penpair/core": "workspace:*" } });
  return { root, write };
}

describe("the repository as it is", () => {
  it("has every package at one version, guarded, with exact internal dependencies", async () => {
    const result = await checkVersions(repository);
    expect(result.problems).toEqual([]);
    expect(result.packages.map((p: { name: string }) => p.name).sort()).toEqual(["@penpair/core", "@penpair/docker", "@penpair/marwes-ui", "@penpair/web", "penpair"]);
  });

  it("publishes the core first and the short name after the web package", async () => {
    const order = publishOrder(await loadPackages(repository)).map((p: { name: string }) => p.name);
    expect(order[0]).toBe("@penpair/core");
    expect(order.indexOf("penpair")).toBeGreaterThan(order.indexOf("@penpair/web"));
  });
});

describe("the version check", () => {
  it("passes for a consistent set", async () => {
    expect((await checkVersions((await fixture()).root)).ok).toBe(true);
  });

  it("fails when one package differs, even a package that has no changes", async () => {
    const f = await fixture();
    await f.write("docker", { name: "@penpair/docker", version: "1.2.2", scripts: { prepublishOnly: guardScript }, dependencies: { "@penpair/core": "workspace:*" } });
    const result = await checkVersions(f.root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/different versions[\s\S]*pnpm bump/);
  });

  it("fails for a package that is added later at another version", async () => {
    const f = await fixture();
    await f.write("marwes-ui", { name: "@penpair/marwes-ui", version: "0.0.1", scripts: { prepublishOnly: guardScript } });
    expect((await checkVersions(f.root)).ok).toBe(false);
  });

  it("fails when the version in the source differs, when a package is private, or when the guard is missing", async () => {
    expect((await checkVersions((await fixture("1.2.3", "1.2.0")).root)).problems.join()).toMatch(/version\.ts says 1\.2\.0/);
    const f = await fixture();
    await f.write("web", { name: "@penpair/web", version: "1.2.3", private: true, scripts: {}, dependencies: { "@penpair/core": "workspace:*" } });
    const problems = (await checkVersions(f.root)).problems.join("\n");
    expect(problems).toMatch(/private/);
    expect(problems).toMatch(/prepublishOnly/);
  });

  it("fails when `types` is not the first condition in a package's exports", async () => {
    const f = await fixture();
    await f.write("web", { name: "@penpair/web", version: "1.2.3", scripts: { prepublishOnly: guardScript }, dependencies: { "@penpair/core": "workspace:*" }, exports: { ".": { default: "./dist/index.js", types: "./dist/index.d.ts" } } });
    expect((await checkVersions(f.root)).problems.join()).toMatch(/"types" must be the first condition/);
    await f.write("web", { name: "@penpair/web", version: "1.2.3", scripts: { prepublishOnly: guardScript }, dependencies: { "@penpair/core": "workspace:*" }, exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } } });
    expect((await checkVersions(f.root)).ok).toBe(true);
  });

  it("fails when a package pins another package of the repository to a range instead of workspace:*", async () => {
    const f = await fixture();
    await f.write("web", { name: "@penpair/web", version: "1.2.3", scripts: { prepublishOnly: guardScript }, dependencies: { "@penpair/core": "^1.2.3" } });
    expect((await checkVersions(f.root)).problems.join()).toMatch(/workspace:\*/);
  });
});

describe("the publish guard", () => {
  const guard = (root: string, env: Record<string, string>) => run("node", [path.join(root, "scripts/guard-publish.mjs")], { env: { PATH: process.env.PATH ?? "", ...env } });

  it("refuses to publish a package on its own", async () => {
    const f = await fixture();
    await expect(guard(f.root, {})).rejects.toMatchObject({ stderr: expect.stringContaining("pnpm release") });
  });

  it("lets the release through when the versions agree, and refuses it when they do not", async () => {
    const f = await fixture();
    await expect(guard(f.root, { PENPAIR_RELEASE: "1" })).resolves.toBeDefined();
    await f.write("web", { name: "@penpair/web", version: "9.9.9", scripts: { prepublishOnly: guardScript }, dependencies: { "@penpair/core": "workspace:*" } });
    await expect(guard(f.root, { PENPAIR_RELEASE: "1" })).rejects.toMatchObject({ stderr: expect.stringContaining("different versions") });
  });
});

describe("the bump", () => {
  const bump = (root: string, argument: string) => run("node", [path.join(root, "scripts/bump.mjs"), argument]);
  const versionOf = async (root: string, folder: string): Promise<string> => JSON.parse(await readFile(path.join(root, "packages", folder, "package.json"), "utf8")).version;

  it("sets every package and the source version together, so they cannot drift", async () => {
    const f = await fixture();
    await bump(f.root, "patch");
    for (const folder of ["core", "web", "docker"]) expect(await versionOf(f.root, folder)).toBe("1.2.4");
    expect(await readFile(path.join(f.root, "packages/core/src/version.ts"), "utf8")).toContain('"1.2.4"');
    expect((await checkVersions(f.root)).ok).toBe(true);
    await bump(f.root, "minor");
    expect(await versionOf(f.root, "docker")).toBe("1.3.0");
  });

  it("repairs a drift by moving everything above the highest version, never backwards", async () => {
    const f = await fixture();
    await f.write("docker", { name: "@penpair/docker", version: "1.5.0", scripts: { prepublishOnly: guardScript }, dependencies: { "@penpair/core": "workspace:*" } });
    await bump(f.root, "patch");
    for (const folder of ["core", "web", "docker"]) expect(await versionOf(f.root, folder)).toBe("1.5.1");
  });

  it("refuses a version that is not higher, or not a version", async () => {
    const f = await fixture();
    await expect(bump(f.root, "1.2.3")).rejects.toMatchObject({ stderr: expect.stringContaining("not higher") });
    await expect(bump(f.root, "nonsense")).rejects.toMatchObject({ stderr: expect.stringContaining("not patch") });
  });
});

describe("the release command", () => {
  it("stops before touching git or npm when the packages are not consistent", async () => {
    const f = await fixture();
    await f.write("web", { name: "@penpair/web", version: "9.9.9", scripts: { prepublishOnly: guardScript }, dependencies: { "@penpair/core": "workspace:*" } });
    await expect(run("node", [path.join(f.root, "scripts/release.mjs")])).rejects.toMatchObject({ stderr: expect.stringContaining("not consistent") });
  });
});
