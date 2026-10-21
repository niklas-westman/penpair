import type { ExecuteOptions, PenpotToolClient } from "./client.js";
import { runSnippet, type Snippet, type SnippetResult } from "./snippet.js";
import { switchPage } from "./snippets/read.js";
import { archiveApply, archiveInspect, archiveReadback, type ArchiveParams } from "./snippets/archive.js";

/**
 * A Penpot change done the safe way: look first, change once, read back independently. `verify` compares the three
 * results and returns what is wrong; an empty list means the change is confirmed.
 */
export interface Operation<P> {
  name: string;
  /** The page the operation works on, so the runner can open it. */
  page(params: P): string | undefined;
  inspect(params: P): Snippet;
  apply(params: P): Snippet;
  readback(params: P): Snippet;
  verify(results: { inspect: SnippetResult; apply: SnippetResult; readback: SnippetResult }): string[];
}

export interface OperationOptions extends ExecuteOptions {
  /** Without it only the read-only inspect runs. */
  apply?: boolean;
  /** Wait between the write and the readback: token resolution and layout settle slowly. */
  settleMs?: number;
  onStep?: (message: string) => void;
}

export interface OperationReport {
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
  const { settleMs = 10_000, sleep = defaultSleep, onStep } = options;
  const page = operation.page(params);
  onStep?.(`${operation.name}: inspecting`);
  const inspect = await runOnPage(client, operation.inspect(params), page, { ...options, effect: "read" });
  if (!options.apply) return { operation: operation.name, phase: "inspected", inspect, problems: [], verified: false };
  onStep?.(`${operation.name}: writing once`);
  const apply = await runOnPage(client, operation.apply(params), page, { ...options, effect: "write" });
  onStep?.(`${operation.name}: waiting ${Math.round(settleMs / 1000)} s before reading back`);
  await sleep(settleMs);
  const readback = await runOnPage(client, operation.readback(params), page, { ...options, effect: "read" });
  const problems = operation.verify({ inspect, apply, readback });
  return { operation: operation.name, phase: "applied", inspect, apply, readback, problems, verified: problems.length === 0 };
}

/** Nests the frames that are not part of the live work into one archive board. Frames keep their names, ids and component links. */
export const archiveOperation: Operation<ArchiveParams> = {
  name: "archive",
  page: (params) => params.page,
  inspect: archiveInspect,
  apply: archiveApply,
  readback: archiveReadback,
  verify({ inspect, apply, readback }) {
    const problems: string[] = [];
    const expected = Number(inspect.willMove ?? 0);
    const archive = readback.archive as { children: number } | null | undefined;
    if (expected > 0 && Number(apply.moved ?? 0) !== expected) problems.push(`moved ${apply.moved} frames, expected ${expected}`);
    if (expected > 0 && !archive) problems.push("the archive board is not on the page");
    if (archive && archive.children < expected) problems.push(`the archive holds ${archive.children} frames, expected at least ${expected}`);
    const loose = (readback.loose as string[] | undefined) ?? [];
    if (loose.length > 0) problems.push(`${loose.length} frames are still loose on the page: ${loose.slice(0, 3).join(", ")}`);
    return problems;
  },
};
