import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactEndpoint } from "./endpoint.js";
import { ensureGitignoreEntry } from "./instance/gitignore.js";
import type { WriteLease } from "./coordination.js";
import { version } from "./version.js";
import type { PenpotToolClient } from "./client.js";
import { runSnippet, snippet } from "./snippet.js";

export interface JournalTarget {
  fileId: string;
  revision?: number;
}
export async function readJournalTarget(client: PenpotToolClient): Promise<JournalTarget> {
  const result = await runSnippet(
    client,
    snippet(
      "journal-target",
      "return { ok: true, fileId: penpot.currentFile.id, revision: penpot.currentFile.revn };",
      {},
      "read",
    ),
  );
  if (
    result.ok !== true ||
    typeof result.fileId !== "string" ||
    !result.fileId ||
    !Number.isInteger(result.revision)
  ) {
    throw new Error("Journal target identity/revision was not observed");
  }
  return {
    fileId: result.fileId,
    revision: Number(result.revision),
  };
}
export interface JournalStep<T> {
  key: string;
  label: string;
  /** Source/signature identifying the implementation of this step, not only its display name. */
  signature: string;
  initial?: T;
  /** The `before` observation is taken right before this step runs instead of at planning (earlier steps change what it sees). */
  deferredBefore?: boolean;
  inspect(): Promise<T>;
  apply(current: T, target: JournalTarget): Promise<unknown>;
  verify(current: T, before: T, result?: unknown): boolean;
  reconcile(
    before: T,
    current: T,
    result?: unknown,
    state?: OperationJournal["steps"][number]["state"],
  ): "complete" | "pending" | "conflict";
}
export interface JournalTraceEvent {
  event:
    | "lease-acquire-start"
    | "lease-acquired"
    | "lease-check"
    | "inspection-start"
    | "inspection-end"
    | "revision-observed"
    | "lease-release-start"
    | "lease-released"
    | "lease-release-failed";
  at: string;
  elapsedMs: number;
  step?: number;
  target?: JournalTarget;
}
export interface OperationJournal {
  schemaVersion: 1;
  engineVersion: string;
  runId: string;
  operation: string;
  inputHash: string;
  planHash: string;
  payload?: unknown;
  target: JournalTarget;
  state: "planned" | "running" | "uncertain" | "failed" | "conflict" | "verified";
  createdAt: string;
  updatedAt: string;
  redacted: boolean;
  trace?: JournalTraceEvent[];
  checkpoint?: unknown;
  error?: string;
  steps: {
    key: string;
    label: string;
    state: "pending" | "started" | "completed" | "uncertain" | "failed";
    before: unknown;
    after?: unknown;
    targetBefore?: JournalTarget;
    targetAfter?: JournalTarget;
    result?: unknown;
    /** Set when the step's verification already held before its write, so the write was not run. */
    skipped?: "readback-already-satisfied";
    error?: string;
  }[];
}
export interface JournalOptions {
  root: string;
  forceLock?: boolean;
  coordinate?(runId: string, target: JournalTarget): Promise<WriteLease>;
  operation: string;
  input: unknown;
  payload?: unknown;
  runId?: string;
  resume?: boolean;
  target(): Promise<JournalTarget>;
  checkpoint?(runId: string): Promise<{
    supported: boolean;
    report?: {
      verified: boolean;
    };
  }>;
  requireCheckpoint?: boolean;
  finalVerify?(): Promise<boolean>;
  redact?(text: string): string;
  trace?: boolean;
  onTrace?(event: JournalTraceEvent): void;
  onStep?(message: string): void;
}

/** Stable JSON hashing; observation comparisons may explicitly ignore transport execution metadata. */
export function observationHash(value: unknown, ignoreExecution = false): string {
  const canonical = (entry: unknown): unknown => {
    if (Array.isArray(entry)) {
      return entry.map(canonical);
    }
    if (typeof entry !== "object" || entry === null) {
      return entry;
    }
    return Object.fromEntries(
      Object.entries(entry)
        .filter(([key]) => !ignoreExecution || key !== "execution")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [
          key,
          canonical(child),
        ]),
    );
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)) ?? "null")
    .digest("hex");
}

function validateRunId(runId: string): void {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(runId)) {
    throw new Error("Run ID must contain only letters, digits and hyphens (at most 100)");
  }
}
async function folder(root: string, create: boolean): Promise<string> {
  if (create) {
    await ensureGitignoreEntry(root, ".penpair", {
      directory: true,
      comment: "penpair: private local operations and recovery evidence",
    });
  }
  let current = root;
  for (const segment of [
    ".penpair",
    "runs",
  ]) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(
          "Operation journal directories must be real directories inside this project",
        );
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

export async function readJournal(root: string, runId: string): Promise<OperationJournal> {
  validateRunId(runId);
  const file = path.join(await folder(root, false), `${runId}.json`);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("Operation journal must be a regular local file");
  }
  const record = JSON.parse(await readFile(file, "utf8")) as OperationJournal;
  if (
    record.schemaVersion !== 1 ||
    record.runId !== runId ||
    typeof record.operation !== "string" ||
    !Array.isArray(record.steps) ||
    !record.target ||
    typeof record.target.fileId !== "string"
  ) {
    throw new Error("Operation journal is invalid or uses an unsupported schema");
  }
  return record;
}
export async function listJournals(
  root: string,
): Promise<Pick<OperationJournal, "runId" | "operation" | "state" | "target" | "updatedAt">[]> {
  let files: string[];
  try {
    files = await readdir(await folder(root, false));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const records = await Promise.all(
    files
      .filter((name) => /^[a-zA-Z0-9-]+\.json$/.test(name))
      .map((name) => readJournal(root, name.slice(0, -5))),
  );
  return records
    .map(({ runId, operation, state, target, updatedAt }) => ({
      runId,
      operation,
      state,
      target,
      updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class JournalRunError extends Error {
  constructor(
    readonly runId: string,
    readonly outcome: OperationJournal["state"],
    message: string,
  ) {
    super(
      `Run ${runId} is ${outcome}: ${message}. Inspect \`penpair runs ${runId}\` before explicitly resuming.`,
    );
  }
}

/** Each started phase is persisted before its write. Resume must inspect and reconcile actual state, never replay blindly. */
export async function runJournaledSteps<T>(
  steps: JournalStep<T>[],
  options: JournalOptions,
): Promise<OperationJournal> {
  if (options.requireCheckpoint && !options.checkpoint) {
    throw new Error("A required checkpoint needs a checkpoint provider");
  }
  const runId = options.runId ?? randomUUID();
  validateRunId(runId);
  const redact = (text: string) => redactEndpoint(options.redact?.(text) ?? text);
  const directory = await folder(options.root, true);
  const destination = path.join(directory, `${runId}.json`);
  const target = await options.target();
  if (!target || typeof target.fileId !== "string" || !target.fileId) {
    throw new Error("Operation journal requires an observed file ID");
  }
  const inputHash = observationHash({
    input: options.input,
    requireCheckpoint: options.requireCheckpoint === true,
    checkpointRequested: Boolean(options.checkpoint),
  });
  const planHash = observationHash({
    steps: steps.map(({ key, signature }) => ({
      key,
      signature,
    })),
    finalVerifier: options.finalVerify?.toString(),
  });
  if (new Set(steps.map((step) => step.key)).size !== steps.length) {
    throw new Error("Journal step keys must be unique");
  }
  let record: OperationJournal;
  if (options.resume) {
    if (!options.runId) {
      throw new Error("Resume requires the original run ID");
    }
    record = await readJournal(options.root, runId);
    if (record.redacted) {
      throw new Error(
        "This journal required redaction and cannot be automatically resumed; inspect and make a fresh plan",
      );
    }
    if (
      record.engineVersion !== version ||
      record.operation !== options.operation ||
      record.inputHash !== inputHash ||
      record.planHash !== planHash ||
      record.target.fileId !== target.fileId ||
      record.steps.length !== steps.length
    ) {
      throw new Error(
        "Resume target, inputs, step implementation or engine version changed; no write was replayed",
      );
    }
  } else {
    const before: T[] = [];
    for (const step of steps) {
      before.push(step.initial === undefined ? await step.inspect() : step.initial);
    }
    const observed = await options.target();
    if (
      observed.fileId !== target.fileId ||
      (target.revision !== undefined && observed.revision !== target.revision)
    ) {
      throw new Error("File changed while planning; inspect again before starting a run");
    }
    const now = new Date().toISOString();
    record = {
      schemaVersion: 1,
      engineVersion: version,
      runId,
      operation: options.operation,
      inputHash,
      planHash,
      payload: options.payload,
      target,
      state: "planned",
      createdAt: now,
      updatedAt: now,
      redacted: false,
      steps: steps.map((step, index) => ({
        key: step.key,
        label: step.label,
        state: "pending",
        before: before[index],
      })),
    };
  }
  const persist = async (create = false): Promise<void> => {
    record.updatedAt = new Date().toISOString();
    const sanitize = (value: unknown): unknown => {
      if (typeof value === "string") {
        return redact(value);
      }
      if (Array.isArray(value)) {
        return value.map(sanitize);
      }
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            redact(key),
            sanitize(entry),
          ]),
        );
      }
      return value;
    };
    const serialize = () => JSON.stringify(sanitize(record), null, 2);
    if (serialize() !== JSON.stringify(record, null, 2)) {
      record.redacted = true;
    }
    const temporary = path.join(directory, `.${runId}-${randomUUID()}.tmp`);
    await writeFile(temporary, `${serialize()}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    try {
      if (create) {
        await link(temporary, destination);
      } else {
        await rename(temporary, destination);
      }
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") {
          throw error;
        }
      });
    }
  };
  if (!options.resume) {
    await persist(true);
  }
  options.onStep?.(`operation run ${runId}`);
  const traceStarted = Date.now();
  const trace = (
    event: JournalTraceEvent["event"],
    step?: number,
    target?: JournalTarget,
  ): void => {
    if (!options.trace && !options.onTrace) {
      return;
    }
    const entry: JournalTraceEvent = {
      event,
      at: new Date().toISOString(),
      elapsedMs: Date.now() - traceStarted,
      ...(step === undefined
        ? {}
        : {
            step,
          }),
      ...(target
        ? {
            target: {
              fileId: redact(target.fileId),
              revision: target.revision,
            },
          }
        : {}),
    };
    if (options.trace) {
      record.trace ??= [];
      if (record.trace.length < 10000) {
        record.trace.push(entry);
      }
    }
    options.onTrace?.(structuredClone(entry));
  };
  const assertTarget = async () => {
    const actual = await options.target();
    if (actual.fileId !== record.target.fileId) {
      throw new Error("The operation target file changed");
    }
    trace("revision-observed", undefined, actual);
    return actual;
  };
  let lease: WriteLease | undefined;
  try {
    trace("lease-acquire-start", undefined, target);
    lease = await options.coordinate?.(runId, target);
    trace(
      "lease-acquired",
      undefined,
      options.trace || options.onTrace ? await assertTarget() : undefined,
    );
    if (
      options.checkpoint &&
      record.steps.every((step) => step.state === "pending") &&
      record.checkpoint === undefined
    ) {
      record.state = "running";
      await persist();
      await assertTarget();
      const checkpoint = await options.checkpoint(runId);
      if (checkpoint.supported !== false && checkpoint.report?.verified !== true) {
        throw new Error("Checkpoint did not provide verified recovery evidence");
      }
      if (!checkpoint.supported && options.requireCheckpoint) {
        record.state = "failed";
        throw new Error("Required checkpoint API is unavailable; no operation step was applied");
      }
      record.checkpoint = checkpoint;
      await persist();
    }
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index]!;
      const saved = record.steps[index]!;
      await lease?.check();
      trace("lease-check", index);
      const beforeInspection = await assertTarget();
      trace("inspection-start", index, beforeInspection);
      const current = await step.inspect();
      trace("inspection-end", index);
      const afterInspection = await assertTarget();
      if (beforeInspection.revision !== afterInspection.revision) {
        record.state = "conflict";
        throw new Error("File revision changed during step inspection");
      }
      if (saved.state === "completed") {
        if (!step.verify(current, saved.before as T, saved.result)) {
          record.state = "conflict";
          throw new Error(`Previously completed step ${step.label} no longer matches`);
        }
        continue;
      }
      if (step.deferredBefore && saved.state === "pending") {
        saved.before = current;
      }
      const reconciliation = step.reconcile(saved.before as T, current, saved.result, saved.state);
      if (reconciliation === "conflict") {
        record.state = "conflict";
        throw new Error(`External or unexplained changes conflict with ${step.label}`);
      }
      if (reconciliation === "complete") {
        if (!step.verify(current, saved.before as T, saved.result)) {
          record.state = "conflict";
          throw new Error(`Reconciliation lacks verification for ${step.label}`);
        }
        if (saved.state === "pending") {
          saved.skipped = "readback-already-satisfied";
          options.onStep?.(
            `${step.label}: the readback already held before the write; nothing was written`,
          );
        }
        saved.state = "completed";
        saved.after = current;
        await persist();
        continue;
      }
      saved.state = "started";
      saved.targetBefore = afterInspection;
      record.state = "running";
      await persist();
      options.onStep?.(step.label);
      try {
        const beforeApply = await assertTarget();
        if (beforeApply.revision !== afterInspection.revision) {
          saved.state = "pending";
          record.state = "conflict";
          throw new Error("File revision changed after inspection; no step was replayed");
        }
        saved.result = await step.apply(current, beforeApply);
        const after = await step.inspect();
        saved.after = after;
        if (!step.verify(after, saved.before as T, saved.result)) {
          saved.state = "failed";
          record.state = "failed";
          throw new Error(`Independent verification failed for ${step.label}`);
        }
        saved.targetAfter = await assertTarget();
        saved.state = "completed";
        await persist();
      } catch (error) {
        if (saved.state === "started") {
          saved.state = "uncertain";
          record.state = "uncertain";
        }
        saved.error = redact(error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
    if (options.finalVerify && !(await options.finalVerify())) {
      record.state = "failed";
      throw new Error("Final operation verification failed");
    }
    record.state = "verified";
    delete record.error;
    await persist();
    return readJournal(options.root, runId);
  } catch (error) {
    record.error = redact(error instanceof Error ? error.message : String(error));
    if (record.state === "planned" || record.state === "running") {
      record.state = "uncertain";
    }
    try {
      await persist();
    } catch {
      /* The pre-write started marker remains the recovery authority when a later local save fails. */
    }
    throw new JournalRunError(
      runId,
      record.state,
      redact(error instanceof Error ? error.message : String(error)),
    );
  } finally {
    if (lease) {
      trace("lease-release-start");
      try {
        await lease.release();
        trace("lease-released");
      } catch (error) {
        trace("lease-release-failed");
        options.onStep?.(
          `Writer marker release needs inspection: ${redact(error instanceof Error ? error.message : String(error))}`,
        );
      }
      if (options.trace) {
        await persist().catch(() => undefined);
      }
    }
  }
}
