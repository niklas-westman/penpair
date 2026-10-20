import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateConfig } from "../src/instance/config.js";
import { backup, composeArgs, doctor, down, parseComposePs, restore, up, verifyBackup, type Context } from "../src/docker/lifecycle.js";
import { assertEndpointIsInstance, LifecycleError } from "../src/instance/connection.js";
import type { RunOptions, RunResult, Runner } from "../src/instance/runner.js";

const config = validateConfig({ instance: "demo", penpotVersion: "2.18.3", ports: { frontend: 9102, mail: 1082 }, directory: ".penpair" });
const counts = { files: 2, profiles: 1, teams: 1, storageObjects: 3, fileRevisions: [{ id: "a", name: "base", revn: 4 }] };
const ok = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "" });

type Call = { command: string; args: string[]; options?: RunOptions };
function fakeRunner(handler: (call: Call) => RunResult | undefined = () => undefined): Runner & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async run(command, args, options) {
      const call = { command, args, options };
      calls.push(call);
      if (options?.outFile) await writeFile(options.outFile, `data-${calls.length}`);
      const joined = args.join(" ");
      return (
        handler(call) ??
        (joined.includes("ps -q") ? ok("container-1\n") : joined.includes("json_build_object") ? ok(JSON.stringify(counts)) : joined.includes("tzf") || command === "tar" ? ok("./a\n./b\n./c\n./d/\n") : ok())
      );
    },
  };
}

async function context(runner: Runner, extra: Partial<Context> = {}): Promise<Context> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-life-"));
  await mkdir(path.join(root, ".penpair"));
  return { root, config, runner, sleep: async () => undefined, now: () => new Date("2026-10-20T10:00:00Z"), ...extra };
}

describe("compose arguments", () => {
  it("name the instance's own project, compose file and secrets", async () => {
    const c = await context(fakeRunner());
    const args = composeArgs(c, "up", "-d");
    expect(args.slice(0, 3)).toEqual(["compose", "-p", "penpair-demo"]);
    expect(args).toContain(path.join(c.root, ".penpair/docker-compose.yaml"));
    expect(args).toContain(path.join(c.root, ".penpair/.env"));
    expect(args.slice(-2)).toEqual(["up", "-d"]);
  });
});

describe("up and down", () => {
  it("waits until the frontend answers", async () => {
    let tries = 0;
    const fetchFake = (async () => {
      if (++tries < 3) throw new Error("refused");
      return { status: 200 } as Response;
    }) as unknown as typeof fetch;
    const c = await context(fakeRunner(), { fetch: fetchFake });
    expect(await up(c)).toEqual({ url: "http://127.0.0.1:9102", ready: true });
    expect(tries).toBe(3);
  });

  it("says when it never came up", async () => {
    const c = await context(fakeRunner(), { fetch: (async () => { throw new Error("no"); }) as unknown as typeof fetch });
    expect((await up(c)).ready).toBe(false);
  });

  it("never removes volumes", async () => {
    const runner = fakeRunner();
    await down(await context(runner));
    const args = runner.calls.at(-1)!.args;
    expect(args).toContain("down");
    expect(args.join(" ")).not.toMatch(/-v\b|--volumes/);
  });

  it("reports a failing docker command with its own words", async () => {
    const runner = fakeRunner(() => ({ code: 1, stdout: "", stderr: "port is already allocated" }));
    await expect(down(await context(runner))).rejects.toThrow(/port is already allocated/);
  });
});

describe("compose ps output", () => {
  it("reads a JSON array and lines of JSON", () => {
    const row = { Service: "penpot-frontend", State: "running", Health: "" };
    expect(parseComposePs(JSON.stringify([row]))[0]).toEqual({ service: "penpot-frontend", state: "running", health: "" });
    expect(parseComposePs(`${JSON.stringify(row)}\n${JSON.stringify({ ...row, Service: "penpot-mcp" })}`)).toHaveLength(2);
  });
});

describe("backup", () => {
  it("writes the dump, the assets and a manifest with checksums and counts", async () => {
    const runner = fakeRunner();
    const { directory, manifest } = await backup(await context(runner));
    expect(path.basename(directory)).toBe("2026-10-20T10-00-00-000Z");
    expect(manifest.counts).toEqual(counts);
    expect(manifest.files.db.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await readFile(path.join(directory, "db.dump"), "utf8")).toMatch(/^data-/);
    expect(manifest.note).toMatch(/never commit/i);
    const dump = runner.calls.find((call) => call.args.includes("pg_dump"))!;
    expect(dump.args).toContain("-Fc");
  });
});

describe("verifying a backup", () => {
  it("restores into a throwaway database, compares, and removes it", async () => {
    const runner = fakeRunner();
    const c = await context(runner);
    const { directory } = await backup(c);
    const result = await verifyBackup(c, directory);
    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.check)).toEqual(expect.arrayContaining(["db.dump checksum", "restored files", "restored storageObjects", "asset files"]));
    expect(runner.calls.at(-1)!.args.slice(0, 2)).toEqual(["rm", "-f"]);
  });

  it("fails when a file was changed, and still removes the throwaway database", async () => {
    const runner = fakeRunner();
    const c = await context(runner);
    const { directory } = await backup(c);
    await writeFile(path.join(directory, "db.dump"), "tampered");
    const result = await verifyBackup(c, directory);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.check === "db.dump checksum")!.ok).toBe(false);
    expect(runner.calls.at(-1)!.args.slice(0, 2)).toEqual(["rm", "-f"]);
  });

  it("fails when the restored counts differ from the manifest", async () => {
    const runner = fakeRunner();
    const c = await context(runner);
    const { directory } = await backup(c);
    const changed = fakeRunner((call) => (call.args.join(" ").includes("json_build_object") ? ok(JSON.stringify({ ...counts, files: 1 })) : undefined));
    const result = await verifyBackup({ ...c, runner: changed }, directory);
    expect(result.checks.find((check) => check.check === "restored files")!.ok).toBe(false);
  });
});

describe("restore", () => {
  it("refuses without --yes", async () => {
    const c = await context(fakeRunner());
    const { directory } = await backup(c);
    await expect(restore(c, directory, { yes: false })).rejects.toBeInstanceOf(LifecycleError);
  });

  it("does nothing when a checksum does not match", async () => {
    const runner = fakeRunner();
    const c = await context(runner);
    const { directory } = await backup(c);
    await writeFile(path.join(directory, "assets.tgz"), "tampered");
    const before = runner.calls.length;
    const result = await restore(c, directory, { yes: true });
    expect(result.ok).toBe(false);
    expect(runner.calls.length).toBe(before);
  });

  it("takes a safety backup, replaces the database and the assets, starts again and compares", async () => {
    const runner = fakeRunner();
    const c = await context(runner, { fetch: (async () => ({ status: 200 })) as unknown as typeof fetch });
    const { directory } = await backup(c);
    const start = runner.calls.length;
    const result = await restore(c, directory, { yes: true });
    const steps = runner.calls.slice(start).map((call) => call.args.join(" "));
    const order = ["pg_dump", " stop ", "up -d penpot-postgres", "drop database penpot with (force)", "create database penpot", "pg_restore", "find /data -mindepth 1 -delete", " up -d"];
    let at = -1;
    for (const marker of order) {
      const next = steps.findIndex((step, i) => i > at && step.includes(marker));
      expect(next, marker).toBeGreaterThan(at);
      at = next;
    }
    expect(result.ok).toBe(true);
    expect(result.safetyBackup).toMatch(/pre-restore/);
  });
});

describe("acting on the right instance", () => {
  it("accepts this instance's endpoint and refuses another, naming where the key came from", () => {
    expect(() => assertEndpointIsInstance({ source: "env-file", origin: "http://localhost:9102" }, config)).not.toThrow();
    expect(() => assertEndpointIsInstance({ source: "codex-config", origin: "http://localhost:9001" }, config)).toThrow(/codex-config.*9001.*9102/s);
    expect(() => assertEndpointIsInstance({ source: "env", origin: "https://penpot.example.test" }, config)).toThrow(/--any-instance/);
  });
});

describe("doctor and the MCP endpoint", () => {
  it("notices a key that belongs to another instance and does not connect with it", async () => {
    let connected = false;
    const c = await context(fakeRunner((call) => (call.args[0] === "version" ? ok("28.3.2\n") : call.args.join(" ").includes("ps --all") ? ok("[]") : undefined)), { fetch: (async () => ({ status: 200 })) as unknown as typeof fetch });
    const checks = await doctor(c, { mcp: { origin: "http://localhost:9001", connect: async () => { connected = true; return { file: "x" }; } } });
    const check = checks.find((entry) => entry.check === "editor and plugin")!;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/not this instance/);
    expect(connected).toBe(false);
  });
});

describe("doctor", () => {
  it("stops at docker when the engine does not answer", async () => {
    const runner = fakeRunner(() => ({ code: 1, stdout: "", stderr: "cannot connect" }));
    const checks = await doctor(await context(runner));
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ check: "docker", ok: false });
    expect(checks[0]!.remedy).toMatch(/Docker/);
  });

  it("reports the editor and plugin through the supplied probe", async () => {
    const c = await context(fakeRunner((call) => (call.args[0] === "version" ? ok("28.3.2\n") : call.args.join(" ").includes("ps --all") ? ok("[]") : undefined)), { fetch: (async () => ({ status: 200 })) as unknown as typeof fetch });
    const here = { origin: "http://127.0.0.1:9102", connect: async () => ({ file: "demo-file" }) };
    const connected = await doctor(c, { mcp: here });
    expect(connected.find((check) => check.check === "editor and plugin")).toMatchObject({ ok: true });
    const missing = await doctor(c, { mcp: { ...here, connect: async () => { throw new Error("no plugin connected"); } } });
    expect(missing.find((check) => check.check === "editor and plugin")!.remedy).toMatch(/MCP Server, Connect/);
  });
});
