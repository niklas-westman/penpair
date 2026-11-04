import { setTimeout as sleepFor } from "node:timers/promises";
import { observationHash } from "../journal.js";
import type { PenpotBackendClient } from "../penpot-backend.js";
import { saveArtifact } from "./artifact-paths.js";
import {
  compareBackendSubtrees,
  subtreeSignature,
  type BackendObjects,
} from "./backend-compare.js";
import type { CopiedFramePair } from "./copy-evidence.js";
import type { ReleaseArtifactRef } from "./types.js";

const pageRootId = "00000000-0000-0000-0000-000000000000";
const defaultConsistencyTimeoutMs = 90_000;
const defaultPollIntervalMs = 1_000;

/** What is recorded about one source board when the copy is planned; the full subtree is kept as an artifact. */
export interface BackendFrameEvidence {
  frameId: string;
  name: string;
  /** Topology of the subtree; pairs a board with its copy without any position or id. */
  signature: string;
  /** Hash of the whole stored subtree, so an unchanged original can be proven later. */
  subtreeHash: string;
  nodes: number;
  subtree: ReleaseArtifactRef;
}

export interface BackendPageRead {
  objects: BackendObjects;
  polls: number;
  waitedMs: number;
}

export interface BackendWaitOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** The shapes of one board and everything below it. */
export function subtreeObjects(objects: BackendObjects, rootId: string): BackendObjects {
  const subtree: BackendObjects = {};
  const visit = (id: string): void => {
    const shape = objects[id];
    if (!shape) {
      throw new Error(`The backend page has no shape ${id}`);
    }
    subtree[id] = shape;
    for (const child of shape.shapes ?? []) {
      visit(child);
    }
  };
  visit(rootId);
  return subtree;
}

/** Top-level boards of a page, in their stored order. */
export function rootBoardIds(objects: BackendObjects): string[] {
  return objects[pageRootId]?.shapes ?? [];
}

/** Reads a page until `ready` accepts it; the backend can trail the editor by a few seconds after a write. */
export async function readBackendPageWhen(
  backend: PenpotBackendClient,
  fileId: string,
  pageId: string,
  ready: (objects: BackendObjects) => boolean,
  options: BackendWaitOptions = {},
): Promise<BackendPageRead> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? defaultConsistencyTimeoutMs;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      sleepFor(milliseconds, undefined, {
        signal: options.signal,
      }));
  for (let polls = 1; ; polls++) {
    const page = await backend.getPage(fileId, pageId, options.signal);
    if (ready(page.objects)) {
      return {
        objects: page.objects,
        polls,
        waitedMs: Date.now() - started,
      };
    }
    if (Date.now() - started >= timeoutMs) {
      throw new Error(
        `The Penpot backend did not show the expected shapes within ${Math.round(timeoutMs / 1000)} s; the editor change may not have been saved yet. Reconcile the run before resuming.`,
      );
    }
    await sleep(options.intervalMs ?? defaultPollIntervalMs);
  }
}

/** Records the source boards from the backend and keeps each subtree as evidence. */
export async function captureBackendSources(
  backend: PenpotBackendClient,
  root: string,
  fileId: string,
  pageId: string,
  frameIds: string[],
  prefix: string,
  redact?: (text: string) => string,
  signal?: AbortSignal,
): Promise<BackendFrameEvidence[]> {
  const page = await backend.getPage(fileId, pageId, signal);
  const evidence: BackendFrameEvidence[] = [];
  for (const [index, frameId] of frameIds.entries()) {
    const board = page.objects[frameId];
    if (!board || !rootBoardIds(page.objects).includes(frameId) || typeof board.name !== "string") {
      throw new Error(`Source board ${frameId} is not a top-level board on the source page`);
    }
    const subtree = subtreeObjects(page.objects, frameId);
    evidence.push({
      frameId,
      name: board.name,
      signature: subtreeSignature(page.objects, frameId),
      subtreeHash: observationHash(subtree),
      nodes: Object.keys(subtree).length,
      subtree: await saveArtifact(
        root,
        `${prefix}/frame-${index}.json`,
        JSON.stringify({
          rootId: frameId,
          objects: subtree,
        }),
        redact,
      ),
    });
  }
  return evidence;
}

/** The ids of source boards whose stored subtree no longer matches what was planned. */
export function changedSources(
  sources: BackendFrameEvidence[],
  currentObjects: BackendObjects,
): string[] {
  return sources
    .filter((source) => {
      try {
        return (
          observationHash(subtreeObjects(currentObjects, source.frameId)) !== source.subtreeHash
        );
      } catch {
        return true;
      }
    })
    .map((source) => source.frameId);
}

/** Pairs each source with the one new board that has its name and topology. */
export function matchBackendFrames(
  sources: BackendFrameEvidence[],
  targetObjects: BackendObjects,
  targetRootIds: string[],
): CopiedFramePair[] {
  if (!sources.length || sources.length !== targetRootIds.length) {
    throw new Error("Copied frame count does not match the requested sources");
  }
  const sourceKeys = sources.map((source) => `${source.name}\u0000${source.signature}`);
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    throw new Error("Source boards are ambiguous; copy matching cannot assign unique identities");
  }
  const targets = targetRootIds.map((id) => ({
    id,
    key: `${targetObjects[id]?.name}\u0000${subtreeSignature(targetObjects, id)}`,
  }));
  return sources.map((source, index) => {
    const matches = targets.filter((target) => target.key === sourceKeys[index]);
    if (matches.length !== 1) {
      throw new Error("Copied board content is missing, changed or ambiguous");
    }
    return {
      sourceFrameId: source.frameId,
      targetFrameId: matches[0]!.id,
    };
  });
}

export interface BackendVerdict {
  nativeVerified: boolean;
  problems: string[];
  nodeMap: Record<string, string>;
  nodes: number;
}

/** Every pair compared attribute by attribute on the backend's stored data. */
export function verifyBackendPairs(
  sourceObjects: BackendObjects,
  targetObjects: BackendObjects,
  pairs: CopiedFramePair[],
): BackendVerdict {
  const problems: string[] = [];
  const nodeMap: Record<string, string> = {};
  let nodes = 0;
  for (const pair of pairs) {
    const comparison = compareBackendSubtrees(
      sourceObjects,
      pair.sourceFrameId,
      targetObjects,
      pair.targetFrameId,
    );
    nodes += comparison.nodes;
    Object.assign(nodeMap, comparison.nodeMap);
    for (const problem of comparison.problems) {
      problems.push(`Native fidelity for ${pair.sourceFrameId}: ${problem}`);
    }
  }
  return {
    nativeVerified: problems.length === 0,
    problems,
    nodeMap,
    nodes,
  };
}
