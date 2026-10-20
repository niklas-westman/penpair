import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { firstFreePort, init } from "../src/instance/init.js";
import { generateSecrets, readEnvValues } from "../src/docker/secrets.js";

const free = async (): Promise<boolean> => true;
const project = async (name = "my-app"): Promise<string> => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "penpair-init-"));
  const root = path.join(parent, name);
  await (await import("node:fs/promises")).mkdir(root);
  return root;
};

describe("secrets", () => {
  it("are long, random and different each time", () => {
    const a = generateSecrets();
    const b = generateSecrets();
    expect(a.secretKey.length).toBeGreaterThanOrEqual(80);
    expect(a.databasePassword.length).toBeGreaterThanOrEqual(30);
    expect(a.secretKey).not.toBe(b.secretKey);
  });
});

describe("ports", () => {
  it("takes the first free one and skips the ones to avoid", async () => {
    expect(await firstFreePort(9001, [], async (p) => p >= 9003)).toBe(9003);
    expect(await firstFreePort(1080, [1080], free)).toBe(1081);
  });
});

describe("init", () => {
  it("writes the config, the compose file and an owner-only secrets file", async () => {
    const root = await project("trading-journal");
    const result = await init(root, { port: 9002, isFree: free, gitignore: true });
    expect(result).toMatchObject({ createdConfig: true, createdSecrets: true, gitignoreAdded: true });
    expect(result.config).toMatchObject({ instance: "trading-journal", ports: { frontend: 9002, mail: 1080 }, directory: ".penpair" });
    const env = path.join(root, ".penpair/.env");
    expect((await stat(env)).mode & 0o777).toBe(0o600);
    expect(Object.keys(await readEnvValues(env))).toEqual(["PENPOT_VERSION", "PENPOT_SECRET_KEY", "PENPOT_DATABASE_PASSWORD"]);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(".penpair/");
    expect(await readFile(path.join(root, "penpair.config.json"), "utf8")).not.toMatch(/SECRET|PASSWORD/);
  });

  it("never replaces existing secrets and does not add the gitignore line twice", async () => {
    const root = await project();
    await init(root, { isFree: free, gitignore: true });
    const before = await readFile(path.join(root, ".penpair/.env"), "utf8");
    const again = await init(root, { isFree: free, gitignore: true });
    expect(again).toMatchObject({ createdConfig: false, createdSecrets: false, gitignoreAdded: false });
    expect(await readFile(path.join(root, ".penpair/.env"), "utf8")).toBe(before);
    expect((await readFile(path.join(root, ".gitignore"), "utf8")).match(/\.penpair\//g)).toHaveLength(1);
  });

  it("keeps an existing config's ports when run again", async () => {
    const root = await project();
    await init(root, { port: 9050, mailPort: 1090, isFree: free });
    const again = await init(root, { port: 9999, isFree: free });
    expect(again.config.ports).toEqual({ frontend: 9050, mail: 1090 });
  });

  it("falls back to a valid instance name when the folder name is unusable", async () => {
    const root = await project("123");
    expect((await init(root, { isFree: free })).config.instance).toBe("design");
  });

  it("leaves an unrelated file alone", async () => {
    const root = await project();
    await writeFile(path.join(root, ".gitignore"), "node_modules/");
    await init(root, { isFree: free, gitignore: true });
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toMatch(/^node_modules\/\n# penpair/);
  });
});
