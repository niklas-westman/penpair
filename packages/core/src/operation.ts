import { waitForStableLayout, type LayoutOptions, type LayoutResult } from "./layout.js";
import { commandSleep } from "./command-result.js";
import type { ExecuteOptions, PenpotToolClient } from "./client.js";
import { runSnippet, type Snippet, type SnippetResult } from "./snippet.js";
import { withPageSession, pinPageSnippet, selectPage, rememberPage } from "./page-session.js";
import {
  archiveApply,
  archiveInspect,
  archiveReadback,
  type ArchiveParams,
} from "./snippets/archive.js";
import { PenpairError } from "./errors.js";
import { UncertainExecutionError } from "./client.js";
import {
  observationHash,
  readJournalTarget,
  runJournaledSteps,
  type JournalOptions,
} from "./journal.js";
import { guardRevision, writeCoordinator } from "./coordination.js";
import { guardFile } from "./file-guard.js";

/**
 * A Penpot change done the safe way: look first, change once, read back independently. `verify` compares the three
 * results and returns what is wrong; an empty list means the change is confirmed.
 */
export interface Operation<P> {
  name: string;
  /** The page the operation works on, so the runner can open it. */
  page(params: P): string | undefined;
  inspect(params: P): Snippet;
  apply(params: P, inspected?: SnippetResult): Snippet;
  readback(params: P): Snippet;
  verify(results: {
    inspect: SnippetResult;
    apply: SnippetResult;
    readback: SnippetResult;
  }): string[];
  /** Explicit reconciliation of a partial write; absent it, only unchanged inputs or independently verified final state may resume. */
  reconcile?(results: {
    before: SnippetResult;
    current: SnippetResult;
    readback: SnippetResult;
  }): "complete" | "pending" | "conflict";
}

export interface OperationOptions extends ExecuteOptions {
  /** Explicit opt-out is for callers that provide their own settling evidence. */
  layout?: false | LayoutOptions;
  journal?: Omit<JournalOptions, "operation" | "input" | "target">;
  /** Without it only the read-only inspect runs. */
  apply?: boolean;
  /** Wait between the write and the readback: token resolution and layout settle slowly. */
  settleMs?: number;
  onStep?: (message: string) => void;
}

export interface OperationReport {
  complete?: boolean;
  redacted?: boolean;
  layout?: LayoutResult;
  journal?: {
    runId: string;
    state: string;
  };
  outcome: "inspected" | "verified" | "failed";
  operation: string;
  phase: "inspected" | "applied";
  inspect: SnippetResult;
  apply?: SnippetResult;
  readback?: SnippetResult;
  problems: string[];
  verified: boolean;
}

const defaultSleep = commandSleep;

/** Runs once on the expected page; page transitions require independently observed IDs. */
export async function runOnPage(
  client: PenpotToolClient,
  s: Snippet,
  page: string | undefined,
  { settleMs: _settleMs, sleep = defaultSleep, onStep, ...execute }: OperationOptions = {},
): Promise<SnippetResult> {
  return withPageSession(client, async () => {
    const started = Date.now();
    const remaining = () => ({
      ...execute,
      ...(execute.timeoutMs
        ? {
            timeoutMs: Math.max(1, execute.timeoutMs - (Date.now() - started)),
          }
        : {}),
    });
    const first = await runSnippet(client, pinPageSnippet(client, s), remaining());
    if (!first.wrongPage || !page) {
      if (typeof first.fileId === "string" && typeof first.pageId === "string") {
        rememberPage(client, {
          fileId: first.fileId,
          pageId: first.pageId,
        });
      }
      return first;
    }
    onStep?.(`opening page ${page}`);
    await selectPage(
      client,
      {
        name: page,
      },
      {
        ...remaining(),
        sleep,
      },
    );
    const second = await runSnippet(client, pinPageSnippet(client, s), remaining());
    if (second.wrongPage) {
      throw new Error(`${s.name}: the editor still shows another page than ${page}`);
    }
    return second;
  });
}

export async function runOperation<P>(
  client: PenpotToolClient,
  operation: Operation<P>,
  params: P,
  options: OperationOptions = {},
): Promise<OperationReport> {
  return withPageSession(client, () => runOperationInSession(client, operation, params, options));
}
async function runOperationInSession<P>(
  client: PenpotToolClient,
  operation: Operation<P>,
  params: P,
  options: OperationOptions,
): Promise<OperationReport> {
  if (
    options.settleMs !== undefined &&
    (!Number.isFinite(options.settleMs) || options.settleMs < 0 || options.settleMs > 30000)
  ) {
    throw new Error("Minimum settle delay must be from 0 to 30000 ms");
  }
  if (options.apply && options.journal) {
    return journaledOperation(client, operation, params, options);
  }
  const { settleMs = 0, sleep = defaultSleep, onStep } = options;
  const page = operation.page(params);
  onStep?.(`${operation.name}: inspecting`);
  const inspect = await runOnPage(client, operation.inspect(params), page, {
    ...options,
    effect: "read",
  });
  if (inspect.ok !== true) {
    throw new PenpairError(
      "tool-failed",
      `${operation.name}: inspect did not return an explicit ok result; nothing was applied`,
    );
  }
  if (!options.apply) {
    return {
      operation: operation.name,
      outcome: "inspected",
      phase: "inspected",
      inspect,
      problems: [],
      verified: false,
    };
  }
  onStep?.(`${operation.name}: writing once`);
  const apply = await runOnPage(client, operation.apply(params, inspect), page, {
    ...options,
    effect: "write",
  });
  if (apply.ok !== true) {
    throw new UncertainExecutionError(
      String(
        (
          apply.execution as
            | {
                runId?: string;
              }
            | undefined
        )?.runId ?? "unknown",
      ),
      `${operation.name}: apply returned no explicit acknowledgment`,
    );
  }
  if (settleMs > 0) {
    await sleep(settleMs);
  }
  let layout: LayoutResult | undefined;
  let readback: SnippetResult | undefined;
  let problems: string[];
  try {
    layout = await settleOperation(client, options, inspect);
    readback = await runOnPage(client, operation.readback(params), page, {
      ...options,
      effect: "read",
    });
    problems = verificationProblems(operation, {
      inspect,
      apply,
      readback,
    });
  } catch (error) {
    problems = [
      `Independent verification failed: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  return {
    layout,
    operation: operation.name,
    phase: "applied",
    outcome: problems.length === 0 ? "verified" : "failed",
    inspect,
    apply,
    readback,
    problems,
    verified: problems.length === 0,
  };
}

function verificationProblems<P>(
  operation: Operation<P>,
  results: {
    inspect: SnippetResult;
    apply: SnippetResult;
    readback: SnippetResult;
  },
): string[] {
  const { readback } = results;
  const observations = Object.keys(readback).filter(
    (key) =>
      ![
        "ok",
        "readOnly",
        "execution",
        "problems",
      ].includes(key),
  );
  if (
    Array.isArray(readback.problems) &&
    readback.problems.length > 0 &&
    readback.problems.every((problem) => typeof problem === "string")
  ) {
    return readback.problems as string[];
  }
  if (readback.ok !== true || observations.length === 0) {
    return [
      "Readback did not provide explicit observations of the resulting state",
    ];
  }
  const result = operation.verify(results);
  return Array.isArray(result) && result.every((problem) => typeof problem === "string")
    ? result
    : [
        "Verifier must return a list of problems",
      ];
}

/** Roots the inspection names as `layoutRoots`: existing shapes, so they can be observed before and after the write. */
function inspectedRoots(inspected: SnippetResult | undefined): string[] {
  const roots = inspected?.layoutRoots;
  if (!Array.isArray(roots) || roots.some((id) => typeof id !== "string" || !id.trim())) {
    return [];
  }
  return [
    ...new Set(roots as string[]),
  ];
}

async function settleOperation(
  client: PenpotToolClient,
  options: OperationOptions,
  inspected?: SnippetResult,
): Promise<LayoutResult | undefined> {
  if (options.layout === false) {
    return undefined;
  }
  const { scope, ...layout } = options.layout ?? {};
  const explicit = layout.shapeIds?.length || layout.shapeId;
  if (scope === "inspected" && !explicit) {
    const roots = inspectedRoots(inspected);
    if (roots.length === 0) {
      return {
        stable: true,
        method: "skipped",
        samples: 0,
        reason:
          "the inspection named no layoutRoots; pass --layout-root, report layoutRoots from the inspect script, or use --layout-scope page for a whole-page sample",
      };
    }
    layout.shapeIds = roots;
  }
  options.onStep?.("waiting for bounded layout completion");
  const result = await waitForStableLayout(client, {
    sleep: options.sleep,
    ...layout,
  });
  if (!result.stable) {
    throw new PenpairError(
      "incomplete-output",
      `Layout did not settle: ${result.reason ?? "unknown reason"}`,
    );
  }
  return result;
}

async function journaledOperation<P>(
  client: PenpotToolClient,
  operation: Operation<P>,
  params: P,
  options: OperationOptions,
): Promise<OperationReport> {
  const page = operation.page(params);
  const planned = await runOnPage(client, operation.inspect(params), page, {
    ...options,
    effect: "read",
  });
  await settleOperation(client, options, planned);
  const initialTarget = await readJournalTarget(client);
  const guarded = guardFile(client, {
    id: initialTarget.fileId,
  });
  const observe = async () => {
    const inspection = await runOnPage(guarded, operation.inspect(params), page, {
      ...options,
      effect: "read",
    });
    const layout = await settleOperation(guarded, options, inspection);
    const readback = await runOnPage(guarded, operation.readback(params), page, {
      ...options,
      effect: "read",
    });
    if (inspection.ok !== true || readback.ok !== true) {
      throw new Error("Operation inspection/readback did not acknowledge its observations");
    }
    return {
      inspection,
      readback,
      layout,
    };
  };
  type Observation = Awaited<ReturnType<typeof observe>>;
  const verify = (current: Observation, before: Observation, result?: unknown) =>
    verificationProblems(operation, {
      inspect: before.inspection,
      apply: (result as SnippetResult) ?? {
        ok: true,
        reconciled: true,
      },
      readback: current.readback,
    }).length === 0;
  const record = await runJournaledSteps(
    [
      {
        key: "apply",
        label: operation.name,
        signature: [
          operation.inspect(params).code,
          operation.apply(params).code,
          operation.readback(params).code,
          operation.verify.toString(),
          operation.reconcile?.toString(),
          settleOperation.toString(),
          inspectedRoots.toString(),
          waitForStableLayout.toString(),
        ].join("\n"),
        inspect: observe,
        apply: async (current, target) => {
          const result = await runOnPage(
            guardRevision(guarded, target),
            operation.apply(params, current.inspection),
            page,
            {
              ...options,
              effect: "write",
            },
          );
          if (result.ok !== true) {
            throw new Error("Apply returned no explicit acknowledgment");
          }
          await (options.sleep ?? defaultSleep)(options.settleMs ?? 0);
          return result;
        },
        verify,
        reconcile: (before, current, result) => {
          if (verify(current, before, result)) {
            return "complete";
          }
          if (operation.reconcile) {
            return operation.reconcile({
              before: before.inspection,
              current: current.inspection,
              readback: current.readback,
            });
          }
          return observationHash(before.inspection, true) ===
            observationHash(current.inspection, true)
            ? "pending"
            : "conflict";
        },
      },
    ],
    {
      ...options.journal!,
      coordinate: writeCoordinator(guarded, {
        root: options.journal!.root,
        operation: operation.name,
        forceLock: options.journal!.forceLock,
        warn: options.onStep,
      }),
      operation: operation.name,
      input: {
        params,
        layout: options.layout ?? {},
        minimumWaitMs: options.settleMs ?? 0,
      },
      payload: {
        params,
      },
      target: () => readJournalTarget(guarded),
      onStep: options.onStep ?? options.journal!.onStep,
      redact: options.redact ?? options.journal!.redact,
    },
  );
  const saved = record.steps[0]!;
  return {
    layout: (saved.after as Observation).layout,
    operation: operation.name,
    phase: "applied",
    outcome: record.redacted ? "failed" : "verified",
    ...(record.redacted
      ? {
          redacted: true,
          complete: false,
        }
      : {}),
    inspect: (saved.before as Observation).inspection,
    apply: saved.result as SnippetResult | undefined,
    readback: (saved.after as Observation).readback,
    problems: record.redacted
      ? [
          "Journal evidence required credential redaction; completeness cannot be confirmed",
        ]
      : [],
    verified: !record.redacted,
    journal: {
      runId: record.runId,
      state: record.state,
    },
  };
}

/** Nests the frames that are not part of the live work into one archive board. Frames keep their names, ids and component links. */
export const archiveOperation: Operation<ArchiveParams> = {
  name: "archive",
  page: (params) => params.page,
  inspect: archiveInspect,
  apply: (params, inspected) =>
    archiveApply({
      ...params,
      expectedPlan: inspected?.plan as ArchiveParams["expectedPlan"],
      expectedArchiveId: inspected?.archiveId as ArchiveParams["expectedArchiveId"],
    }),
  readback: archiveReadback,
  verify({ inspect, apply, readback }) {
    const problems: string[] = [];
    if (
      !Number.isInteger(inspect.willMove) ||
      Number(inspect.willMove) < 0 ||
      !Array.isArray(inspect.plan) ||
      !Array.isArray(readback.insideIds) ||
      !Array.isArray(readback.loose)
    ) {
      return [
        "Archive verification is missing movement counts or the independent loose-frame listing",
      ];
    }
    const expected = Number(inspect.willMove ?? 0);
    const archive = readback.archive as
      | {
          children: number;
        }
      | null
      | undefined;
    if (
      inspect.plan.length !== expected ||
      inspect.plan.some(
        (shape: { id?: string }) =>
          !shape.id || !(readback.insideIds as string[]).includes(shape.id),
      )
    ) {
      problems.push("the inspected frames are not all in the archive");
    }
    if (expected > 0 && !archive) {
      problems.push("the archive board is not on the page");
    }
    if (archive && archive.children < expected) {
      problems.push(`the archive holds ${archive.children} frames, expected at least ${expected}`);
    }
    const loose = (readback.loose as string[] | undefined) ?? [];
    if (loose.length > 0) {
      problems.push(
        `${loose.length} frames are still loose on the page: ${loose.slice(0, 3).join(", ")}`,
      );
    }
    return problems;
  },
  reconcile({ before, current, readback }) {
    if (
      !Array.isArray(before.plan) ||
      !Array.isArray(current.plan) ||
      !Array.isArray(readback.insideIds)
    ) {
      return "conflict";
    }
    if (observationHash(before, true) === observationHash(current, true)) {
      return "pending";
    }
    const original = before.plan as {
      id: string;
      name: string;
      w: number;
      h: number;
      x: number;
      y: number;
    }[];
    const remaining = current.plan as typeof original;
    const intended = new Map(
      original.map((shape) => [
        shape.id,
        shape,
      ]),
    );
    if (
      remaining.some(
        (shape) =>
          !intended.has(shape.id) ||
          observationHash(shape) !== observationHash(intended.get(shape.id)),
      )
    ) {
      return "conflict";
    }
    const accounted = new Set([
      ...remaining.map((shape) => shape.id),
      ...(readback.insideIds as string[]),
    ]);
    if (original.some((shape) => !accounted.has(shape.id))) {
      return "conflict";
    }
    if (remaining.length > 0 && (!before.archiveId || before.archiveId !== current.archiveId)) {
      return "conflict";
    }
    if (
      Array.isArray(before.insideIds) &&
      before.insideIds.some((id) => !(readback.insideIds as unknown[]).includes(id))
    ) {
      return "conflict";
    }
    return remaining.length === 0 ? "complete" : "pending";
  },
};
