import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CommandResult } from "./command-result.js";

/** One `run-file --apply` in a queue. Paths are relative to the project, like the command line. */
export interface QueueJob {
  id: string;
  file: string;
  inspect: string;
  readback: string;
  page?: string;
  params?: Record<string, string | number | boolean>;
  include?: string[];
  stages?: number;
  layoutRoots?: string[];
  layoutScope?: "inspected" | "page";
  layoutMaxNodes?: number;
}
export interface QueueSpec {
  version: 1;
  /** Extra attempts after the first, for transient failures only (0–5, default 2). */
  retries: number;
  /** Wait before attempt n+1 is backoffMs × n (0–60000, default 5000). */
  backoffMs: number;
  /** When set, a lost editor connection triggers `wake --debug-port` before the retry. */
  wake?: {
    debugPort: number;
  };
  stopOnFailure: boolean;
  jobs: QueueJob[];
}
export type QueueJobState =
  | "queued"
  | "running"
  | "ok"
  | "already-satisfied"
  | "failed"
  | "uncertain";
export interface QueueJobRecord {
  id: string;
  state: QueueJobState;
  attempts: number;
  runId?: string;
  outcome?: string;
  message?: string;
  elapsedMs?: number;
}
export interface QueueRecord {
  schemaVersion: 1;
  queueId: string;
  specHash: string;
  createdAt: string;
  updatedAt: string;
  state: "running" | "done" | "failed" | "interrupted";
  jobs: QueueJobRecord[];
}

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,60}$/;
const queueIdPattern = /^[a-zA-Z0-9-]{1,100}$/;
const jobKeys = [
  "id",
  "file",
  "inspect",
  "readback",
  "page",
  "params",
  "include",
  "stages",
  "layoutRoots",
  "layoutScope",
  "layoutMaxNodes",
];
const specKeys = [
  "version",
  "retries",
  "backoffMs",
  "wake",
  "stopOnFailure",
  "jobs",
];

const fail = (message: string): never => {
  throw new Error(`Queue file: ${message}`);
};
const text = (value: unknown, label: string): string =>
  typeof value === "string" && value.trim() && !value.includes("\0")
    ? value
    : fail(`${label} must be a nonempty string`);
const strings = (value: unknown, label: string): string[] =>
  Array.isArray(value) && value.length <= 50
    ? value.map((entry) => text(entry, label))
    : fail(`${label} must be a list of at most 50 strings`);
const bounded = (value: unknown, label: string, min: number, max: number): number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fail(`${label} must be an integer from ${min} to ${max}`);

/** Strict: unknown keys, duplicate ids and unusable values refuse before anything runs. */
export function parseQueueSpec(source: string): QueueSpec {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return fail("not valid JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("the top level must be an object");
  }
  const top = raw as Record<string, unknown>;
  for (const key of Object.keys(top)) {
    if (!specKeys.includes(key)) {
      fail(`unknown key "${key}" (allowed: ${specKeys.join(", ")})`);
    }
  }
  if (top.version !== 1) {
    fail("version must be 1");
  }
  if (!Array.isArray(top.jobs) || top.jobs.length < 1 || top.jobs.length > 500) {
    fail("jobs must be a list of 1 to 500 jobs");
  }
  const wake = top.wake as Record<string, unknown> | undefined;
  if (wake !== undefined) {
    if (!wake || typeof wake !== "object" || Object.keys(wake).some((key) => key !== "debugPort")) {
      fail("wake accepts only debugPort");
    }
  }
  const jobs = (top.jobs as unknown[]).map((entry, index): QueueJob => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return fail(`job ${index + 1} must be an object`);
    }
    const job = entry as Record<string, unknown>;
    for (const key of Object.keys(job)) {
      if (!jobKeys.includes(key)) {
        fail(`job ${index + 1}: unknown key "${key}" (allowed: ${jobKeys.join(", ")})`);
      }
    }
    const id = text(job.id, `job ${index + 1}: id`);
    if (!idPattern.test(id)) {
      fail(`job ${index + 1}: id must be letters, digits, dot, dash or underscore (at most 61)`);
    }
    const params = job.params;
    if (params !== undefined) {
      if (!params || typeof params !== "object" || Array.isArray(params)) {
        fail(`job ${id}: params must be an object`);
      }
      for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
        if (
          !/^[A-Za-z][A-Za-z0-9]*$/.test(key) ||
          ![
            "string",
            "number",
            "boolean",
          ].includes(typeof value)
        ) {
          fail(
            `job ${id}: param "${key}" needs a letter-first alphanumeric name and a string, number or boolean value`,
          );
        }
      }
    }
    if (
      job.layoutScope !== undefined &&
      job.layoutScope !== "inspected" &&
      job.layoutScope !== "page"
    ) {
      fail(`job ${id}: layoutScope must be inspected or page`);
    }
    return {
      id,
      file: text(job.file, `job ${id}: file`),
      inspect: text(job.inspect, `job ${id}: inspect`),
      readback: text(job.readback, `job ${id}: readback`),
      ...(job.page === undefined
        ? {}
        : {
            page: text(job.page, `job ${id}: page`),
          }),
      ...(params === undefined
        ? {}
        : {
            params: params as QueueJob["params"],
          }),
      ...(job.include === undefined
        ? {}
        : {
            include: strings(job.include, `job ${id}: include`),
          }),
      ...(job.stages === undefined
        ? {}
        : {
            stages: bounded(job.stages, `job ${id}: stages`, 1, 50),
          }),
      ...(job.layoutRoots === undefined
        ? {}
        : {
            layoutRoots: strings(job.layoutRoots, `job ${id}: layoutRoots`),
          }),
      ...(job.layoutScope === undefined
        ? {}
        : {
            layoutScope: job.layoutScope as "inspected" | "page",
          }),
      ...(job.layoutMaxNodes === undefined
        ? {}
        : {
            layoutMaxNodes: bounded(job.layoutMaxNodes, `job ${id}: layoutMaxNodes`, 1, 100000),
          }),
    };
  });
  if (new Set(jobs.map((job) => job.id)).size !== jobs.length) {
    fail("job ids must be distinct");
  }
  if (top.stopOnFailure !== undefined && typeof top.stopOnFailure !== "boolean") {
    fail("stopOnFailure must be true or false");
  }
  return {
    version: 1,
    retries: top.retries === undefined ? 2 : bounded(top.retries, "retries", 0, 5),
    backoffMs: top.backoffMs === undefined ? 5000 : bounded(top.backoffMs, "backoffMs", 0, 60000),
    ...(wake === undefined
      ? {}
      : {
          wake: {
            debugPort: bounded(wake.debugPort, "wake.debugPort", 1, 65535),
          },
        }),
    stopOnFailure: top.stopOnFailure === true,
    jobs,
  };
}

/** The `run-file` command line a job stands for. `resumeRunId` continues an interrupted run instead of starting a new one. */
export function jobArguments(job: QueueJob, resumeRunId?: string): string[] {
  return [
    "run-file",
    job.file,
    "--inspect",
    job.inspect,
    "--readback",
    job.readback,
    ...(job.page
      ? [
          "--page",
          job.page,
        ]
      : []),
    ...Object.entries(job.params ?? {}).flatMap(([key, value]) => [
      "--param",
      `${key}=${value}`,
    ]),
    ...(job.include ?? []).flatMap((include) => [
      "--include",
      include,
    ]),
    ...(job.stages
      ? [
          "--stages",
          String(job.stages),
        ]
      : []),
    ...(job.layoutRoots ?? []).flatMap((root) => [
      "--layout-root",
      root,
    ]),
    ...(job.layoutScope
      ? [
          "--layout-scope",
          job.layoutScope,
        ]
      : []),
    ...(job.layoutMaxNodes
      ? [
          "--layout-max-nodes",
          String(job.layoutMaxNodes),
        ]
      : []),
    "--apply",
    ...(resumeRunId
      ? [
          "--resume",
          resumeRunId,
        ]
      : []),
  ];
}

const connectionLost =
  /No Penpot instance|not connected|Doctor deadline|editor never answers|connection (was )?lost|mcp-unavailable/i;
/** Only failures that did not decide the job are retried; a failed verification or a held lock never is. */
export function classify(
  result: CommandResult,
): "ok" | "already-satisfied" | "resume" | "reconnect" | "failed" {
  if (result.outcome === "success") {
    return "ok";
  }
  if (result.outcome === "already-satisfied") {
    return "already-satisfied";
  }
  const error = result.errors[0];
  const lost = error && (error.code === "mcp-unavailable" || connectionLost.test(error.message));
  if (result.outcome === "uncertain" || result.outcome === "incomplete") {
    return result.runId ? (lost ? "reconnect" : "resume") : "failed";
  }
  return lost ? "reconnect" : "failed";
}

export interface QueueOptions {
  root: string;
  spec: QueueSpec;
  specHash: string;
  queueId: string;
  /** An existing record to continue; jobs recorded as done are not run again. */
  record?: QueueRecord;
  stopOnFailure?: boolean;
  exec(argv: string[]): Promise<CommandResult>;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
  signal?: AbortSignal;
}

async function folder(root: string, create: boolean): Promise<string> {
  let current = root;
  for (const segment of [
    ".penpair",
    "queues",
  ]) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error("Queue directories must be real directories inside this project");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      if (create) {
        await mkdir(current, {
          mode: 0o700,
        });
      }
    }
  }
  return current;
}
async function saveQueue(root: string, record: QueueRecord): Promise<void> {
  record.updatedAt = new Date().toISOString();
  const directory = await folder(root, true);
  const temporary = path.join(
    directory,
    `.${record.queueId}-${randomBytes(4).toString("hex")}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await rename(temporary, path.join(directory, `${record.queueId}.json`));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
export async function readQueue(root: string, queueId: string): Promise<QueueRecord> {
  if (!queueIdPattern.test(queueId)) {
    throw new Error("Queue ID must contain only letters, digits and hyphens (at most 100)");
  }
  const file = path.join(await folder(root, false), `${queueId}.json`);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("Queue record must be a regular local file");
  }
  const record = JSON.parse(await readFile(file, "utf8")) as QueueRecord;
  if (record.schemaVersion !== 1 || record.queueId !== queueId || !Array.isArray(record.jobs)) {
    throw new Error("Queue record is malformed");
  }
  return record;
}
export async function listQueues(root: string): Promise<
  {
    queueId: string;
    state: string;
    updatedAt: string;
    jobs: number;
  }[]
> {
  let names: string[];
  try {
    names = await readdir(await folder(root, false));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const rows = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const record = await readQueue(root, name.slice(0, -5)).catch(() => undefined);
    if (record) {
      rows.push({
        queueId: record.queueId,
        state: record.state,
        updatedAt: record.updatedAt,
        jobs: record.jobs.length,
      });
    }
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const newQueueId = (): string =>
  `q-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${randomBytes(2).toString("hex")}`;
export const hashSpec = (spec: QueueSpec): string =>
  createHash("sha256").update(JSON.stringify(spec)).digest("hex");

const seconds = (ms: number) => `${Math.round(ms / 100) / 10} s`;
const done = (state: QueueJobState) => state === "ok" || state === "already-satisfied";

/** Runs the jobs one at a time, so one writer holds the file. Every state change is saved; a crashed queue resumes from its record. */
export async function runQueue(options: QueueOptions): Promise<QueueRecord> {
  const { spec, exec, sleep, log, root } = options;
  const now = new Date().toISOString();
  const record: QueueRecord = options.record ?? {
    schemaVersion: 1,
    queueId: options.queueId,
    specHash: options.specHash,
    createdAt: now,
    updatedAt: now,
    state: "running",
    jobs: spec.jobs.map((job) => ({
      id: job.id,
      state: "queued",
      attempts: 0,
    })),
  };
  record.state = "running";
  await saveQueue(root, record);
  const total = spec.jobs.length;
  let stopped = false;
  for (let index = 0; index < total && !stopped; index++) {
    const job = spec.jobs[index]!;
    const entry = record.jobs[index]!;
    if (done(entry.state)) {
      log(
        `queue ${record.queueId}: job ${index + 1} of ${total} "${job.id}": already ${entry.state}, skipped`,
      );
      continue;
    }
    if (options.signal?.aborted) {
      record.state = "interrupted";
      await saveQueue(root, record);
      throw options.signal.reason ?? new Error("Queue interrupted");
    }
    // A run an earlier attempt left uncertain is resumed from its journal, never started again.
    let resumeRunId =
      entry.state === "uncertain" || (entry.state === "failed" && entry.outcome === "uncertain")
        ? entry.runId
        : undefined;
    const started = Date.now();
    entry.state = "running";
    delete entry.message;
    for (let attempt = 1; attempt <= spec.retries + 1; attempt++) {
      entry.attempts++;
      await saveQueue(root, record);
      log(
        `queue ${record.queueId}: job ${index + 1} of ${total} "${job.id}": running (attempt ${attempt} of ${spec.retries + 1}${resumeRunId ? `, resuming run ${resumeRunId}` : ""})`,
      );
      const result = await exec(jobArguments(job, resumeRunId));
      const verdict = classify(result);
      entry.outcome = result.outcome;
      if (result.runId) {
        entry.runId = result.runId;
      }
      const problem =
        result.errors[0]?.message ??
        (
          result.data as {
            problems?: string[];
          } | null
        )?.problems?.[0];
      if (problem) {
        entry.message = problem;
      }
      if (verdict === "ok" || verdict === "already-satisfied") {
        entry.state = verdict;
        delete entry.message;
        break;
      }
      const retryable = verdict !== "failed" && attempt <= spec.retries;
      if (!retryable) {
        entry.state = result.outcome === "uncertain" ? "uncertain" : "failed";
        break;
      }
      log(
        `queue ${record.queueId}: job ${index + 1} of ${total} "${job.id}": ${verdict === "reconnect" ? "editor connection lost" : "interrupted"}${problem ? ` (${problem})` : ""}; retrying`,
      );
      if (verdict === "reconnect" && spec.wake) {
        const woke = await exec([
          "wake",
          "--debug-port",
          String(spec.wake.debugPort),
        ]);
        log(
          `queue ${record.queueId}: wake ${woke.exitCode === 0 ? "ready" : "did not confirm the editor"}`,
        );
      }
      resumeRunId = result.runId ?? resumeRunId;
      await sleep(spec.backoffMs * attempt);
    }
    entry.elapsedMs = Date.now() - started;
    await saveQueue(root, record);
    log(
      `queue ${record.queueId}: job ${index + 1} of ${total} "${job.id}": ${entry.state}${done(entry.state) ? "" : entry.message ? ` (${entry.message})` : ""} in ${seconds(entry.elapsedMs)}${entry.runId ? `, run ${entry.runId}` : ""}`,
    );
    if (!done(entry.state) && (options.stopOnFailure ?? spec.stopOnFailure)) {
      stopped = true;
      log(`queue ${record.queueId}: stopping after the first failure (stopOnFailure)`);
    }
  }
  const unfinished = record.jobs.some((job) => !done(job.state));
  record.state = unfinished ? "failed" : "done";
  await saveQueue(root, record);
  return record;
}
