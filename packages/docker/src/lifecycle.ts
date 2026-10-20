import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  composeProjectOf,
  endpointIsInstance,
  frontendUrl,
  instancePaths,
  LifecycleError,
  type BackupManifest,
  type Check,
  type Counts,
  type LocalContext,
  type DoctorCheck,
  type DoctorOptions,
  type InstanceConfig,
  type RestoreOptions,
  type ServiceState,
} from "@penpair/core";
import { readEnvValues } from "./secrets.js";

/** Kept under its old name inside this package. */
type Context = LocalContext;

const defaultSleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sleepOf = (c: Context) => c.sleep ?? defaultSleep;
const say = (c: Context, message: string): void => c.log?.(message);

/** `docker compose` arguments for this instance: its own project name, compose file and secrets. */
export function composeArgs(c: Context, ...rest: string[]): string[] {
  const paths = instancePaths(c.root, c.config);
  return ["compose", "-p", composeProjectOf(c.config), "-f", paths.compose, "--env-file", paths.env, ...rest];
}

async function docker(c: Context, args: string[], what: string): Promise<string> {
  const result = await c.runner.run("docker", args);
  if (result.code !== 0) throw new LifecycleError(`${what} failed: ${result.stderr.trim().split("\n").slice(-3).join(" ") || `exit ${result.code}`}`);
  return result.stdout;
}

/** The frontend answers a few seconds before the backend does (502 until then); /readyz is 200 only when the backend is ready. */
export const readyUrl = (config: InstanceConfig): string => `${frontendUrl(config)}/readyz`;

export async function waitForHttp(c: Context, url: string, timeoutMs = 240_000, stepMs = 3_000): Promise<boolean> {
  const doFetch = c.fetch ?? fetch;
  for (let waited = 0; waited <= timeoutMs; waited += stepMs) {
    try {
      const response = await doFetch(url, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      // not up yet
    }
    await sleepOf(c)(stepMs);
  }
  return false;
}

export async function up(c: Context): Promise<{ url: string; ready: boolean }> {
  say(c, "starting the containers");
  await docker(c, composeArgs(c, "up", "-d"), "docker compose up");
  say(c, "waiting for Penpot to answer (the first start can take a few minutes)");
  return { url: frontendUrl(c.config), ready: await waitForHttp(c, readyUrl(c.config)) };
}

/** Stops and removes the containers. Volumes are never removed: the design data stays. */
export async function down(c: Context): Promise<void> {
  await docker(c, composeArgs(c, "down"), "docker compose down");
}

export function parseComposePs(output: string): ServiceState[] {
  const rows: unknown[] = [];
  const text = output.trim();
  if (text.startsWith("[")) rows.push(...(JSON.parse(text) as unknown[]));
  else for (const line of text.split("\n").filter(Boolean)) rows.push(JSON.parse(line));
  return rows.map((row) => {
    const r = row as Record<string, string>;
    return { service: r.Service ?? r.Name ?? "?", state: r.State ?? "?", health: r.Health ?? "" };
  });
}

export async function status(c: Context): Promise<{ services: ServiceState[]; frontendReachable: boolean; backendReady: boolean; url: string }> {
  const output = await docker(c, composeArgs(c, "ps", "--all", "--format", "json"), "docker compose ps");
  const services = output.trim() ? parseComposePs(output) : [];
  const url = frontendUrl(c.config);
  const answers = async (target: string, ok: (status: number) => boolean): Promise<boolean> => {
    try {
      return ok((await (c.fetch ?? fetch)(target, { redirect: "manual" })).status);
    } catch {
      return false;
    }
  };
  return { services, frontendReachable: await answers(url, (code) => code < 500), backendReady: await answers(readyUrl(c.config), (code) => code === 200), url };
}

async function containerOf(c: Context, service: string): Promise<string> {
  const id = (await docker(c, composeArgs(c, "ps", "-q", service), `docker compose ps ${service}`)).trim().split("\n")[0];
  if (!id) throw new LifecycleError(`The ${service} container is not running. Run \`penpair up\` first.`);
  return id;
}

const countsSql = `select json_build_object('files',(select count(*) from file where deleted_at is null),'profiles',(select count(*) from profile),'teams',(select count(*) from team),'storageObjects',(select count(*) from storage_object),'fileRevisions',(select coalesce(json_agg(json_build_object('id',id,'name',name,'revn',revn) order by name,id),'[]'::json) from file where deleted_at is null))`;

async function readCounts(c: Context, container: string): Promise<Counts> {
  const out = await docker(c, ["exec", container, "psql", "-U", "penpot", "-d", "penpot", "-tAc", countsSql], "reading the database counts");
  return JSON.parse(out.trim()) as Counts;
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * A backup of the whole instance: a Postgres dump and a tarball of the asset volume, with checksums and the counts
 * that `backup verify` later checks a restore against. It holds account data (password hashes): never commit it.
 */
export async function backup(c: Context, label?: string): Promise<{ directory: string; manifest: BackupManifest }> {
  const paths = instancePaths(c.root, c.config);
  const stamp = (c.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const directory = path.join(paths.backups, label ? `${stamp}-${label}` : stamp);
  await mkdir(directory, { recursive: true });
  const postgres = await containerOf(c, "penpot-postgres");
  const backend = await containerOf(c, "penpot-backend");
  say(c, "dumping the database");
  const dump = await c.runner.run("docker", ["exec", postgres, "pg_dump", "-U", "penpot", "-d", "penpot", "-Fc"], { outFile: path.join(directory, "db.dump") });
  if (dump.code !== 0) throw new LifecycleError(`pg_dump failed: ${dump.stderr.trim().slice(-200)}`);
  say(c, "archiving the assets");
  const assets = await c.runner.run("docker", ["exec", backend, "tar", "czf", "-", "-C", "/opt/data/assets", "."], { outFile: path.join(directory, "assets.tgz") });
  if (assets.code !== 0) throw new LifecycleError(`archiving the assets failed: ${assets.stderr.trim().slice(-200)}`);
  const entry = async (name: string) => ({ name, sha256: await sha256File(path.join(directory, name)), bytes: (await stat(path.join(directory, name))).size });
  const manifest: BackupManifest = {
    instance: c.config.instance,
    penpotVersion: c.config.penpotVersion,
    createdAt: (c.now?.() ?? new Date()).toISOString(),
    ...(label ? { label } : {}),
    files: { db: await entry("db.dump"), assets: await entry("assets.tgz") },
    counts: await readCounts(c, postgres),
    note: "Contains account data (password hashes). Never commit it. Keep the instance's .env with it.",
  };
  await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, manifest };
}

async function loadManifest(directory: string): Promise<BackupManifest> {
  try {
    return JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as BackupManifest;
  } catch {
    throw new LifecycleError(`${directory} is not a penpair backup (no manifest.json)`);
  }
}


async function checksumChecks(directory: string, manifest: BackupManifest): Promise<Check[]> {
  const checks: Check[] = [];
  for (const key of ["db", "assets"] as const) {
    const wanted = manifest.files[key];
    let actual = "missing";
    try {
      actual = await sha256File(path.join(directory, wanted.name));
    } catch {
      // reported below
    }
    checks.push({ check: `${wanted.name} checksum`, ok: actual === wanted.sha256, detail: actual === wanted.sha256 ? "matches the manifest" : `expected ${wanted.sha256.slice(0, 12)}, found ${actual.slice(0, 12)}` });
  }
  return checks;
}

const compareCounts = (wanted: Counts, found: Counts): Check[] => [
  ...(["files", "profiles", "teams", "storageObjects"] as const).map((key) => ({ check: `restored ${key}`, ok: wanted[key] === found[key], detail: `${found[key]} (backup says ${wanted[key]})` })),
  { check: "file revisions", ok: JSON.stringify(wanted.fileRevisions) === JSON.stringify(found.fileRevisions), detail: `${found.fileRevisions.length} files, ids, names and revisions ${JSON.stringify(wanted.fileRevisions) === JSON.stringify(found.fileRevisions) ? "match" : "differ"}` },
];

/** Proves a backup can be restored without touching the instance: restores the dump into a throwaway Postgres and compares. */
export async function verifyBackup(c: Context, directory: string): Promise<{ ok: boolean; checks: Check[] }> {
  const manifest = await loadManifest(directory);
  const checks = await checksumChecks(directory, manifest);
  const name = `penpair-verify-${Math.random().toString(36).slice(2, 8)}`;
  say(c, "starting a throwaway Postgres");
  await docker(c, ["run", "-d", "--name", name, "-e", "POSTGRES_USER=penpot", "-e", "POSTGRES_PASSWORD=verify", "-e", "POSTGRES_DB=penpot", "-v", `${path.resolve(directory)}:/backup:ro`, "postgres:15"], "starting the throwaway Postgres");
  try {
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      ready = (await c.runner.run("docker", ["exec", name, "pg_isready", "-U", "penpot", "-d", "penpot"])).code === 0;
      if (!ready) await sleepOf(c)(1_000);
    }
    if (!ready) throw new LifecycleError("the throwaway Postgres did not become ready");
    say(c, "restoring the dump");
    await c.runner.run("docker", ["exec", name, "pg_restore", "-U", "penpot", "-d", "penpot", "--no-owner", "/backup/db.dump"]);
    checks.push(...compareCounts(manifest.counts, await readCounts(c, name)));
    const listing = await c.runner.run("tar", ["tzf", path.join(directory, manifest.files.assets.name)]);
    const entries = listing.stdout.split("\n").filter((line) => line && !line.endsWith("/")).length;
    checks.push({ check: "asset files", ok: entries === manifest.counts.storageObjects, detail: `${entries} files in the tarball, ${manifest.counts.storageObjects} storage objects` });
  } finally {
    await c.runner.run("docker", ["rm", "-f", name]);
  }
  return { ok: checks.every((check) => check.ok), checks };
}

/**
 * Replaces the instance's database and assets with a backup. A backup of the current data is taken first unless told
 * not to, the checksums are checked before anything is touched, and the counts are compared afterwards.
 */
export async function restore(c: Context, directory: string, options: RestoreOptions): Promise<{ ok: boolean; checks: Check[]; safetyBackup?: string }> {
  if (!options.yes) throw new LifecycleError("Restoring replaces this instance's data. Run again with --yes to confirm.");
  const manifest = await loadManifest(directory);
  const checks = await checksumChecks(directory, manifest);
  if (!checks.every((check) => check.ok)) return { ok: false, checks };
  let safetyBackup: string | undefined;
  if (!options.skipSafetyBackup) {
    try {
      say(c, "taking a safety backup of the current data first");
      safetyBackup = (await backup(c, "pre-restore")).directory;
    } catch (error) {
      if (!(error instanceof LifecycleError) || !/not running/.test(error.message)) throw error;
      say(c, "the instance is not running, so there is no current data to back up");
    }
  }
  say(c, "stopping the application containers");
  await docker(c, composeArgs(c, "stop", "penpot-frontend", "penpot-backend", "penpot-admin-console", "penpot-exporter", "penpot-mcp"), "stopping the application containers");
  await docker(c, composeArgs(c, "up", "-d", "penpot-postgres", "penpot-valkey"), "starting the database");
  const postgres = await containerOf(c, "penpot-postgres");
  for (let i = 0; i < 60; i++) {
    if ((await c.runner.run("docker", ["exec", postgres, "pg_isready", "-U", "penpot", "-d", "penpot"])).code === 0) break;
    await sleepOf(c)(1_000);
  }
  say(c, "replacing the database");
  await docker(c, ["exec", postgres, "psql", "-U", "penpot", "-d", "postgres", "-c", "drop database penpot with (force)"], "dropping the database");
  await docker(c, ["exec", postgres, "psql", "-U", "penpot", "-d", "postgres", "-c", "create database penpot"], "creating the database");
  const loaded = await c.runner.run("docker", ["exec", "-i", postgres, "pg_restore", "-U", "penpot", "-d", "penpot", "--no-owner"], { inFile: path.join(directory, manifest.files.db.name) });
  if (loaded.code !== 0) throw new LifecycleError(`pg_restore failed: ${loaded.stderr.trim().slice(-200)}`);
  say(c, "replacing the assets");
  const volume = `${composeProjectOf(c.config)}_penpot_assets`;
  const assets = await c.runner.run(
    "docker",
    ["run", "--rm", "-i", "-v", `${volume}:/data`, "--entrypoint", "sh", `penpotapp/backend:${c.config.penpotVersion}`, "-c", "find /data -mindepth 1 -delete && tar xzf - -C /data"],
    { inFile: path.join(directory, manifest.files.assets.name) },
  );
  if (assets.code !== 0) throw new LifecycleError(`restoring the assets failed: ${assets.stderr.trim().slice(-200)}`);
  say(c, "starting everything again");
  await up(c);
  checks.push(...compareCounts(manifest.counts, await readCounts(c, await containerOf(c, "penpot-postgres"))));
  return { ok: checks.every((check) => check.ok), checks, ...(safetyBackup ? { safetyBackup } : {}) };
}

/** What is up, what is not, and what to do about it. */
export async function doctor(c: Context, options: DoctorOptions = {}): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  const add = (check: string, ok: boolean, detail: string, remedy?: string): void => void out.push({ check, ok, detail, ...(remedy && !ok ? { remedy } : {}) });
  const version = await c.runner.run("docker", ["version", "--format", "{{.Server.Version}}"]);
  add("docker", version.code === 0, version.code === 0 ? `engine ${version.stdout.trim()}` : "not answering", "Start Docker Desktop (or the Docker daemon).");
  if (version.code !== 0) return out;
  const paths = instancePaths(c.root, c.config);
  try {
    const mode = (await stat(paths.env)).mode & 0o777;
    const values = await readEnvValues(paths.env);
    add("secrets file", mode === 0o600 && Boolean(values.PENPOT_SECRET_KEY) && Boolean(values.PENPOT_DATABASE_PASSWORD), `permissions ${mode.toString(8)}, keys ${values.PENPOT_SECRET_KEY && values.PENPOT_DATABASE_PASSWORD ? "present" : "missing"}`, "Run `penpair init` to create it, and `chmod 600` the file.");
  } catch {
    add("secrets file", false, "missing", "Run `penpair init`.");
  }
  let state: Awaited<ReturnType<typeof status>> | undefined;
  try {
    state = await status(c);
  } catch (error) {
    add("containers", false, String((error as Error).message), "Run `penpair up`.");
  }
  if (state) {
    const running = state.services.filter((s) => s.state === "running").map((s) => s.service);
    const needed = ["penpot-frontend", "penpot-backend", "penpot-postgres", "penpot-mcp"];
    const missing = needed.filter((service) => !running.includes(service));
    add("containers", missing.length === 0, missing.length === 0 ? `${running.length} running` : `not running: ${missing.join(", ")}`, "Run `penpair up`.");
    add("frontend", state.frontendReachable, state.frontendReachable ? state.url : `${state.url} does not answer`, "Run `penpair up` and wait for Penpot to start.");
    add("backend", state.backendReady, state.backendReady ? "ready" : "not ready yet (the proxy answers, the backend does not)", "Wait a few seconds after `penpair up`; if it stays like this, read the backend log with `docker compose logs penpot-backend`.");
  }
  if (options.mcp && !endpointIsInstance(options.mcp.origin, c.config)) {
    add("editor and plugin", false, `the MCP endpoint points at ${options.mcp.origin}, which is not this instance (${frontendUrl(c.config)})`, "Put this instance's MCP URL (Account, Integrations, MCP Server) in this project's .env.local as PENPAIR_MCP_URL.");
  } else if (options.mcp) {
    try {
      const { file } = await options.mcp.connect();
      add("editor and plugin", true, `connected to file "${file}"`);
    } catch (error) {
      add("editor and plugin", false, String((error as Error).message).split("\n")[0] ?? "not connected", "Open a file in Penpot, choose File, MCP Server, Connect, and keep the tab visible.");
    }
  }
  return out;
}
