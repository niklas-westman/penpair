import type { ExecuteOptions, PenpotToolClient } from "./client.js";
import { runSnippet, type Snippet, type SnippetResult } from "./snippet.js";
import { switchPage } from "./snippets/read.js";
import { archiveApply, archiveInspect, archiveReadback, type ArchiveParams } from "./snippets/archive.js";
import { PenpairError } from "./errors.js";
import { UncertainExecutionError } from "./client.js";
import { observationHash, readJournalTarget, runJournaledSteps, type JournalOptions } from "./journal.js";
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
  verify(results: { inspect: SnippetResult; apply: SnippetResult; readback: SnippetResult }): string[];
  /** Explicit reconciliation of a partial write; absent it, only unchanged inputs or independently verified final state may resume. */
  reconcile?(results: { before: SnippetResult; current: SnippetResult; readback: SnippetResult }): "complete" | "pending" | "conflict";
}

export interface OperationOptions extends ExecuteOptions {
  journal?: Omit<JournalOptions, "operation" | "input" | "target">;
  /** Without it only the read-only inspect runs. */
  apply?: boolean;
  /** Wait between the write and the readback: token resolution and layout settle slowly. */
  settleMs?: number;
  onStep?: (message: string) => void;
}

export interface OperationReport {
  journal?: { runId: string; state: string };
  outcome: "inspected" | "verified" | "failed";
  operation: string;
  phase: "inspected" | "applied";
  inspect: SnippetResult;
  apply?: SnippetResult;
  readback?: SnippetResult;
  problems: string[];
  verified: boolean;
}

const defaultSleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Runs a snippet; if the editor shows another page, opens the right one, waits, and tries once more. */
export async function runOnPage(
  client: PenpotToolClient,
  s: Snippet,
  page: string | undefined,
  { settleMs = 3_000, sleep = defaultSleep, onStep, ...execute }: OperationOptions = {},
): Promise<SnippetResult> {
  const first = await runSnippet(client, s, execute);
  if (!first.wrongPage || !page) return first;
  onStep?.(`opening page ${page}`);
  await runSnippet(client, switchPage(page), execute);
  await sleep(settleMs);
  const second = await runSnippet(client, s, execute);
  if (second.wrongPage) throw new Error(`${s.name}: the editor still shows another page than ${page}`);
  return second;
}

export async function runOperation<P>(
  client: PenpotToolClient,
  operation: Operation<P>,
  params: P,
  options: OperationOptions = {},
): Promise<OperationReport> {
  if (options.apply && options.journal) return journaledOperation(client, operation, params, options);
  const { settleMs = 10_000, sleep = defaultSleep, onStep } = options;
  const page = operation.page(params);
  onStep?.(`${operation.name}: inspecting`);
  const inspect = await runOnPage(client, operation.inspect(params), page, { ...options, effect: "read" });
  if (inspect.ok !== true) throw new PenpairError("tool-failed", `${operation.name}: inspect did not return an explicit ok result; nothing was applied`);
  if (!options.apply) return { operation: operation.name, outcome: "inspected", phase: "inspected", inspect, problems: [], verified: false };
  onStep?.(`${operation.name}: writing once`);
  const apply = await runOnPage(client, operation.apply(params, inspect), page, { ...options, effect: "write" });
  if (apply.ok !== true) throw new UncertainExecutionError(String((apply.execution as { runId?: string } | undefined)?.runId ?? "unknown"), `${operation.name}: apply returned no explicit acknowledgment`);
  onStep?.(`${operation.name}: waiting ${Math.round(settleMs / 1000)} s before reading back`);
  await sleep(settleMs);
  let readback: SnippetResult | undefined;
  let problems: string[];
  try {
    readback = await runOnPage(client, operation.readback(params), page, { ...options, effect: "read" });
    problems = verificationProblems(operation, { inspect, apply, readback });
  } catch (error) {
    problems = [`Independent verification failed: ${error instanceof Error ? error.message : String(error)}`];
  }
  return { operation: operation.name, phase: "applied", outcome: problems.length === 0 ? "verified" : "failed", inspect, apply, readback, problems, verified: problems.length === 0 };
}

function verificationProblems<P>(operation: Operation<P>, results: { inspect: SnippetResult; apply: SnippetResult; readback: SnippetResult }): string[] {
  const { readback } = results;
  const observations = Object.keys(readback).filter((key) => !["ok", "readOnly", "execution", "problems"].includes(key));
  if (Array.isArray(readback.problems) && readback.problems.length > 0 && readback.problems.every((problem) => typeof problem === "string")) return readback.problems as string[];
  if (readback.ok !== true || observations.length === 0) return ["Readback did not provide explicit observations of the resulting state"];
  const result = operation.verify(results);
  return Array.isArray(result) && result.every((problem) => typeof problem === "string") ? result : ["Verifier must return a list of problems"];
}

async function journaledOperation<P>(client: PenpotToolClient, operation: Operation<P>, params: P, options: OperationOptions): Promise<OperationReport> {
  const initialTarget = await readJournalTarget(client);
  const guarded = guardFile(client, { id: initialTarget.fileId });
  const page = operation.page(params);
  const observe = async () => {
    const inspection = await runOnPage(guarded, operation.inspect(params), page, { ...options, effect: "read" });
    const readback = await runOnPage(guarded, operation.readback(params), page, { ...options, effect: "read" });
    if (inspection.ok !== true || readback.ok !== true) throw new Error("Operation inspection/readback did not acknowledge its observations");
    return { inspection, readback };
  };
  type Observation = Awaited<ReturnType<typeof observe>>;
  const verify = (current: Observation, before: Observation, result?: unknown) => verificationProblems(operation, { inspect: before.inspection, apply: result as SnippetResult ?? { ok: true, reconciled: true }, readback: current.readback }).length === 0;
  const record = await runJournaledSteps([{ key: "apply", label: operation.name,
    signature: [operation.inspect(params).code, operation.apply(params).code, operation.readback(params).code, operation.verify.toString(), operation.reconcile?.toString()].join("\n"),
    inspect: observe,
    apply: async (current) => {
      const result = await runOnPage(guarded, operation.apply(params, current.inspection), page, { ...options, effect: "write" });
      if (result.ok !== true) throw new Error("Apply returned no explicit acknowledgment");
      await (options.sleep ?? defaultSleep)(options.settleMs ?? 10_000);
      return result;
    }, verify,
    reconcile: (before, current, result) => {
      if (verify(current, before, result)) return "complete";
      if (operation.reconcile) return operation.reconcile({ before: before.inspection, current: current.inspection, readback: current.readback });
      return observationHash(before.inspection, true) === observationHash(current.inspection, true) ? "pending" : "conflict";
    },
  }], { ...options.journal!, operation: operation.name, input: params, payload: { params }, target: () => readJournalTarget(guarded), onStep: options.onStep ?? options.journal!.onStep, redact: options.redact ?? options.journal!.redact });
  const saved = record.steps[0]!;
  return { operation: operation.name, phase: "applied", outcome: "verified", inspect: (saved.before as Observation).inspection, apply: saved.result as SnippetResult | undefined, readback: (saved.after as Observation).readback, problems: [], verified: true, journal: { runId: record.runId, state: record.state } };
}

/** Nests the frames that are not part of the live work into one archive board. Frames keep their names, ids and component links. */
export const archiveOperation: Operation<ArchiveParams> = {
  name: "archive",
  page: (params) => params.page,
  inspect: archiveInspect,
  apply: (params, inspected) => archiveApply({ ...params, expectedPlan: inspected?.plan as ArchiveParams["expectedPlan"], expectedArchiveId: inspected?.archiveId as ArchiveParams["expectedArchiveId"] }),
  readback: archiveReadback,
  verify({ inspect, apply, readback }) {
    const problems: string[] = [];
    if (!Number.isInteger(inspect.willMove) || Number(inspect.willMove) < 0 || !Array.isArray(inspect.plan) || !Array.isArray(readback.insideIds) || !Array.isArray(readback.loose))
      return ["Archive verification is missing movement counts or the independent loose-frame listing"];
    const expected = Number(inspect.willMove ?? 0);
    const archive = readback.archive as { children: number } | null | undefined;
    if (inspect.plan.length !== expected || inspect.plan.some((shape: { id?: string }) => !shape.id || !(readback.insideIds as string[]).includes(shape.id))) problems.push("the inspected frames are not all in the archive");
    if (expected > 0 && !archive) problems.push("the archive board is not on the page");
    if (archive && archive.children < expected) problems.push(`the archive holds ${archive.children} frames, expected at least ${expected}`);
    const loose = (readback.loose as string[] | undefined) ?? [];
    if (loose.length > 0) problems.push(`${loose.length} frames are still loose on the page: ${loose.slice(0, 3).join(", ")}`);
    return problems;
  },
  reconcile({ before, current, readback }) {
    if (!Array.isArray(before.plan) || !Array.isArray(current.plan) || !Array.isArray(readback.insideIds)) return "conflict";
    if (observationHash(before, true) === observationHash(current, true)) return "pending";
    const original = before.plan as { id: string; name: string; w: number; h: number; x: number; y: number }[];
    const remaining = current.plan as typeof original;
    const intended = new Map(original.map((shape) => [shape.id, shape]));
    if (remaining.some((shape) => !intended.has(shape.id) || observationHash(shape) !== observationHash(intended.get(shape.id)))) return "conflict";
    const accounted = new Set([...remaining.map((shape) => shape.id), ...readback.insideIds as string[]]);
    if (original.some((shape) => !accounted.has(shape.id))) return "conflict";
    if (remaining.length > 0 && (!before.archiveId || before.archiveId !== current.archiveId)) return "conflict";
    if (Array.isArray(before.insideIds) && before.insideIds.some((id) => !(readback.insideIds as unknown[]).includes(id))) return "conflict";
    return remaining.length === 0 ? "complete" : "pending";
  },
};
