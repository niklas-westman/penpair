import type { PenpotToolClient } from "../client.js";
import type { InspectionCapture } from "../inspection.js";
import { exportShapePng, exportShapesPngStable, type ExportResult } from "../export.js";
import { selectPage, withPageSession } from "../page-session.js";
import { observationHash } from "../journal.js";
import { saveArtifact } from "./artifact-paths.js";
import { captureReleaseScreen } from "./live.js";
import {
  compareNativeCopy,
  decodedPixels,
  deriveNodeMap,
  measurePixelDifference,
  type PixelDifference,
  type NativeFidelityOptions,
} from "./fidelity.js";
import { readFile } from "node:fs/promises";
import { artifactPath } from "./artifact-paths.js";
import type { ReleaseArtifactRef } from "./types.js";
import { capturePhase, type ProgressOptions } from "../capture-progress.js";

interface CopyEvidenceProgressOptions extends ProgressOptions {
  phase?: "prepare" | "verify";
  /**
   * stable: two identical renders (the settled reference, default).
   * single: one render; the caller compares both sides and re-renders only the pairs that differ.
   * none: structure only, for proving an original did not change.
   */
  render?: "stable" | "single" | "none";
}

export interface CopyFrameEvidence {
  frameId: string;
  name: string;
  inspection: InspectionCapture;
  inspectionRef: ReleaseArtifactRef;
  render: ReleaseArtifactRef;
  pixels: {
    hash: string;
    width: number;
    height: number;
  };
}

export interface CopiedFramePair {
  sourceFrameId: string;
  targetFrameId: string;
}

export interface CopyEvidenceComparison {
  nativeVerified: boolean;
  pixelsMatch: boolean;
  nodeMap: Record<string, string>;
  problems: string[];
}

const structureOnlyPixels = {
  hash: "",
  width: 0,
  height: 0,
};

interface OrderedNode {
  path: string;
  node: Record<string, unknown>;
}

/** Capture immutable native observations and a stable render; this does not approve a release. */
export async function captureCopyEvidence(
  client: PenpotToolClient,
  root: string,
  fileId: string,
  pageId: string,
  frameIds: string[],
  prefix: string,
  redact?: (text: string) => string,
  options: CopyEvidenceProgressOptions = {},
): Promise<CopyFrameEvidence[]> {
  if (
    !frameIds.length ||
    frameIds.length > 100 ||
    new Set(frameIds).size !== frameIds.length ||
    frameIds.some((frameId) => typeof frameId !== "string" || !frameId || frameId.length > 256)
  ) {
    throw new Error("Copy evidence needs one to 100 distinct frame IDs");
  }

  // Concurrent renders are about three times faster; any frame that does not settle falls back to the one-by-one export below.
  const batchRendered =
    (options.render ?? "stable") !== "none" && frameIds.length > 1
      ? await capturePhase(options, "design-release copy", options.phase ?? "prepare", async () => {
          await selectPage(client, {
            id: pageId,
          });
          return exportShapesPngStable(client, frameIds, {
            singleRound: options.render === "single",
          });
        })
      : new Map<string, ExportResult>();

  // Plugin calls run concurrently, so shapes are read four at a time instead of one by one.
  const inspectedAhead = await inspectConcurrently(client, fileId, pageId, frameIds);

  const evidence: CopyFrameEvidence[] = [];
  for (const [index, frameId] of frameIds.entries()) {
    let frameName = frameId;
    const progress = {
      signal: options.signal,
      onProgress: options.onProgress
        ? (event: import("../capture-progress.js").CaptureProgress) => {
            if (event.frame && event.frame !== frameId) {
              frameName = event.frame;
            }
            options.onProgress?.({
              ...event,
              command: "design-release copy",
              frame: frameName,
              index: index + 1,
              total: frameIds.length,
            });
          }
        : undefined,
    };
    const captured = await capturePhase(
      progress,
      "design-release copy",
      options.phase ?? "prepare",
      async () => {
        const { inspection, image } = await captureFramePair(
          client,
          fileId,
          pageId,
          frameId,
          progress,
          options.render ?? "stable",
          batchRendered.get(frameId),
          inspectedAhead.get(frameId),
        );
        const first = orderedNodes(inspection, frameId)[0]!.node;
        if (typeof first.name !== "string") {
          throw new Error("Copy frame name was not observed");
        }
        const pixels = image ? await decodedPixels(image.png) : structureOnlyPixels;
        const stem = `${prefix}/frame-${index}`;
        const inspectionRef = await saveArtifact(
          root,
          `${stem}.json`,
          JSON.stringify(inspection),
          redact,
        );
        const render = image
          ? await saveArtifact(root, `${stem}.png`, image.png, redact)
          : inspectionRef;
        frameName = first.name;
        return {
          frameId,
          name: first.name,
          inspection,
          inspectionRef,
          render,
          pixels,
        };
      },
      frameId,
    );
    evidence.push(captured);
  }
  return evidence;
}

/** Retry only an inconsistent read pair, never a mutation or an identity/stability failure. */
async function captureFramePair(
  client: PenpotToolClient,
  fileId: string,
  pageId: string,
  frameId: string,
  options: ProgressOptions,
  render: "stable" | "single" | "none",
  prerendered?: ExportResult,
  inspectedAhead?: InspectionCapture,
): Promise<{
  inspection: InspectionCapture;
  image?: ExportResult;
}> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const inspection =
      attempt === 0 && inspectedAhead
        ? inspectedAhead
        : await capturePhase(
            options,
            "design-release copy",
            "selection",
            () => captureReleaseScreen(client, fileId, pageId, frameId),
            frameId,
          );
    if (render === "none") {
      return {
        inspection,
      };
    }
    if (
      prerendered &&
      prerendered.capture.fileId === fileId &&
      prerendered.capture.pageId === pageId &&
      prerendered.capture.frameId === frameId
    ) {
      if (prerendered.capture.revision === inspection.revision) {
        return {
          inspection,
          image: prerendered,
        };
      }
      // Penpot saves in the background and moves the revision without changing content; unchanged structure keeps the render valid.
      const again = await captureReleaseScreen(client, fileId, pageId, frameId);
      if (observationHash(again.nodes) === observationHash(inspection.nodes)) {
        return {
          inspection,
          image: prerendered,
        };
      }
      if (process.env.PENPAIR_TRACE_EXPORT) {
        console.error(`export-trace ${frameId} structure changed after the batch render`);
      }
    }
    if (process.env.PENPAIR_TRACE_EXPORT && !prerendered) {
      console.error(`export-trace ${frameId} no batch render; exporting one by one`);
    }
    const frameName = orderedNodes(inspection, frameId)[0]?.node.name;
    const image = await exportShapePng(client, frameId, {
      stable: true,
      ...(options.signal
        ? {
            signal: options.signal,
          }
        : {}),
      ...(options.onProgress
        ? {
            onProgress: (event) =>
              options.onProgress?.({
                ...event,
                command: "design-release copy",
                frame: typeof frameName === "string" ? frameName : frameId,
              }),
          }
        : {}),
    });
    if (
      !image.stable ||
      image.capture.fileId !== fileId ||
      image.capture.pageId !== pageId ||
      image.capture.frameId !== frameId
    ) {
      throw new Error("Copy source changed or stable render identity was not established");
    }
    if (image.capture.revision === inspection.revision) {
      return {
        inspection,
        image,
      };
    }
  }
  throw new Error("Copy source changed during both bounded inspection/render attempts");
}

/** Observe topology without claiming complete native fidelity for unsupported shape content. */
function orderedNodes(inspection: InspectionCapture, frameId: string): OrderedNode[] {
  if (
    inspection.kind !== "shape-inspection" ||
    !inspection.complete ||
    !Array.isArray(inspection.nodes) ||
    !inspection.nodes.length ||
    inspection.nodes.length > 20000
  ) {
    throw new Error("Copy matching requires a complete bounded shape inspection");
  }
  const nodes = new Map<string, Record<string, unknown>>();
  for (const node of inspection.nodes) {
    if (typeof node.id !== "string" || !node.id || nodes.has(node.id)) {
      throw new Error("Copy matching encountered duplicate or missing shape IDs");
    }
    nodes.set(node.id, node);
  }
  const root = nodes.get(frameId);
  if (!root || root.parentId !== null || root.type !== "board") {
    throw new Error("Copy matching requires the requested native board root");
  }

  const ordered: OrderedNode[] = [];
  const visited = new Set<string>();
  const pending: Array<{
    node: Record<string, unknown>;
    path: string;
    parent: string | null;
  }> = [
    {
      node: root,
      path: "root",
      parent: null,
    },
  ];
  while (pending.length) {
    const entry = pending.pop()!;
    const id = String(entry.node.id);
    const childIds = entry.node.childIds;
    if (
      visited.has(id) ||
      entry.node.parentId !== entry.parent ||
      !Array.isArray(childIds) ||
      entry.node.childrenTotal !== childIds.length
    ) {
      throw new Error("Copy matching encountered incomplete or inconsistent hierarchy");
    }
    visited.add(id);
    ordered.push({
      path: entry.path,
      node: entry.node,
    });
    for (let index = childIds.length - 1; index >= 0; index--) {
      const childId = childIds[index];
      const child = typeof childId === "string" ? nodes.get(childId) : undefined;
      if (!child || child.index !== index) {
        throw new Error("Copy matching encountered an unknown or reordered child");
      }
      pending.push({
        node: child,
        path: `${entry.path}/${index}`,
        parent: id,
      });
    }
  }
  if (visited.size !== nodes.size) {
    throw new Error("Copy matching includes detached shape observations");
  }
  return ordered;
}

function matchingFingerprint(evidence: CopyFrameEvidence): string {
  const ordered = orderedNodes(evidence.inspection, evidence.frameId);
  const rootGeometry = ordered[0]!.node.geometry as Record<string, unknown> | undefined;
  if (!rootGeometry) {
    throw new Error("Copy root geometry is unavailable");
  }
  const fingerprint = ordered.map(({ path, node }) => {
    const geometry = node.geometry as Record<string, unknown> | undefined;
    if (!geometry || typeof node.name !== "string" || typeof node.type !== "string") {
      throw new Error("Copy matching needs observed names, types and geometry");
    }
    const normalized: Record<string, number> = {};
    for (const axis of [
      "x",
      "y",
      "width",
      "height",
      "rotation",
    ]) {
      const value = geometry[axis];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("Copy matching geometry must be finite and observable");
      }
      const origin = axis === "x" || axis === "y" ? rootGeometry[axis] : 0;
      if (typeof origin !== "number" || !Number.isFinite(origin)) {
        throw new Error("Copy matching root position must be observable");
      }
      normalized[axis] = Math.round((value - origin) * 1e6) / 1e6;
    }
    return {
      path,
      name: node.name,
      type: node.type,
      geometry: normalized,
    };
  });
  return observationHash(fingerprint);
}

/** Matching identifies newly observed boards; names alone never establish a transfer identity. */
export function matchCopiedFrames(
  sources: CopyFrameEvidence[],
  targets: CopyFrameEvidence[],
): CopiedFramePair[] {
  if (!sources.length || sources.length > 100 || sources.length !== targets.length) {
    throw new Error("Copied frame count does not match the requested sources");
  }
  if (
    new Set(sources.map((source) => source.frameId)).size !== sources.length ||
    new Set(targets.map((target) => target.frameId)).size !== targets.length ||
    targets.some((target) => sources.some((source) => source.frameId === target.frameId))
  ) {
    throw new Error("Source and copied frame identities must be distinct");
  }
  const sourceFingerprints = sources.map(matchingFingerprint);
  const targetFingerprints = targets.map(matchingFingerprint);
  if (new Set(sourceFingerprints).size !== sourceFingerprints.length) {
    throw new Error("Source boards are ambiguous; copy matching cannot assign unique identities");
  }
  return sources.map((source, index) => {
    const matches = targets.filter(
      (_target, targetIndex) => targetFingerprints[targetIndex] === sourceFingerprints[index],
    );
    if (matches.length !== 1) {
      throw new Error("Copied board content is missing, changed or ambiguous");
    }
    return {
      sourceFrameId: source.frameId,
      targetFrameId: matches[0]!.frameId,
    };
  });
}

/** Validate observable structure and exact pixels separately; unknown native content never passes. */
export function compareCopyEvidence(
  sources: CopyFrameEvidence[],
  targets: CopyFrameEvidence[],
  pairs: CopiedFramePair[],
): CopyEvidenceComparison {
  if (
    !sources.length ||
    sources.length > 100 ||
    pairs.length !== sources.length ||
    targets.length !== sources.length ||
    new Set(pairs.map((pair) => pair.sourceFrameId)).size !== pairs.length ||
    new Set(pairs.map((pair) => pair.targetFrameId)).size !== pairs.length ||
    new Set(sources.map((source) => source.frameId)).size !== sources.length ||
    new Set(targets.map((target) => target.frameId)).size !== targets.length
  ) {
    throw new Error("Copy verification requires complete distinct source-to-target pairs");
  }
  const observations = pairs.map((pair) => {
    const source = sources.find((item) => item.frameId === pair.sourceFrameId);
    const target = targets.find((item) => item.frameId === pair.targetFrameId);
    if (
      !source ||
      !target ||
      source.frameId === target.frameId ||
      source.inspection.fileId !== target.inspection.fileId
    ) {
      throw new Error("Copy verification pair refers to an unknown or original frame");
    }
    return {
      source,
      target,
    };
  });
  const nodeMap: Record<string, string> = {};
  const mappedTargets = new Set<string>();
  for (const { source, target } of observations) {
    const before = orderedNodes(source.inspection, source.frameId);
    const after = orderedNodes(target.inspection, target.frameId);
    if (before.length !== after.length) {
      throw new Error("Copy hierarchy node counts differ");
    }
    for (const [index, entry] of before.entries()) {
      const copied = after[index]!;
      const from = String(entry.node.id);
      const to = String(copied.node.id);
      if (
        entry.path !== copied.path ||
        entry.node.type !== copied.node.type ||
        from === to ||
        Object.hasOwn(nodeMap, from) ||
        mappedTargets.has(to)
      ) {
        throw new Error("Copy topology or independent shape identity differs");
      }
      nodeMap[from] = to;
      mappedTargets.add(to);
    }
  }
  if (Object.keys(nodeMap).some((id) => mappedTargets.has(id))) {
    throw new Error("Copied descendants overlap original source identities");
  }

  const problems: string[] = [];
  let nativeVerified = true;
  let pixelsMatch = true;
  for (const { source, target } of observations) {
    try {
      // A native copy compares component instances by identity and says so in its result; release verification does not.
      deriveNodeMap(source.inspection, target.inspection, copyFidelity);
      compareNativeCopy(source.inspection, target.inspection, nodeMap, copyFidelity);
      const before = orderedNodes(source.inspection, source.frameId);
      const after = orderedNodes(target.inspection, target.frameId);
      if (before.some((entry, index) => entry.node.name !== after[index]!.node.name)) {
        throw new Error("Native copy changed a board or descendant name");
      }
    } catch (error) {
      nativeVerified = false;
      problems.push(
        `Native fidelity for ${source.frameId}: ${error instanceof Error ? error.message : "unavailable"}`,
      );
    }
    if (
      source.pixels.hash !== target.pixels.hash ||
      source.pixels.width !== target.pixels.width ||
      source.pixels.height !== target.pixels.height
    ) {
      pixelsMatch = false;
      problems.push(`Exported pixels differ for ${source.frameId}`);
    }
  }
  return {
    nativeVerified,
    pixelsMatch,
    nodeMap,
    problems,
  };
}

/** Pairs whose renders differ beyond the tolerance; only these pay for a settled, double render. */
export function pixelMismatchedPairs(
  sources: CopyFrameEvidence[],
  targets: CopyFrameEvidence[],
  pairs: CopiedFramePair[],
  differences: FramePixelDifference[],
): CopiedFramePair[] {
  const tolerated = new Set(
    differences.filter((entry) => entry.withinTolerance).map((entry) => entry.sourceFrameId),
  );
  return pairs.filter((pair) => {
    const source = sources.find((item) => item.frameId === pair.sourceFrameId);
    const target = targets.find((item) => item.frameId === pair.targetFrameId);
    if (!source || !target) {
      return false;
    }
    const identical =
      source.pixels.hash === target.pixels.hash &&
      source.pixels.width === target.pixels.width &&
      source.pixels.height === target.pixels.height;
    return !identical && !tolerated.has(pair.sourceFrameId);
  });
}

/** Swap in the settled render of a frame, provided the structure observed with it is the structure already on record. */
export function withSettledPixels(
  evidence: CopyFrameEvidence[],
  settled: CopyFrameEvidence[],
): CopyFrameEvidence[] {
  return evidence.map((frame) => {
    const replacement = settled.find((item) => item.frameId === frame.frameId);
    if (!replacement) {
      return frame;
    }
    if (observationHash(replacement.inspection.nodes) !== observationHash(frame.inspection.nodes)) {
      throw new Error(`Frame ${frame.frameId} changed while its render was being settled`);
    }
    return {
      ...frame,
      render: replacement.render,
      pixels: replacement.pixels,
    };
  });
}

/** Structure-only proof that an original is unchanged; used when its pixels were not re-rendered. */
export function sourceStructureHash(evidence: CopyFrameEvidence[]): string {
  return observationHash(
    evidence.map((frame) => ({
      frameId: frame.frameId,
      name: frame.name,
      fileId: frame.inspection.fileId,
      pageId: frame.inspection.pageId,
      nodes: frame.inspection.nodes,
    })),
  );
}

/** A source preservation hash excludes capture revisions, timestamps and transport metrics. */
export function sourceEvidenceHash(evidence: CopyFrameEvidence[]): string {
  return observationHash(
    evidence.map((frame) => ({
      frameId: frame.frameId,
      name: frame.name,
      fileId: frame.inspection.fileId,
      pageId: frame.inspection.pageId,
      nodes: frame.inspection.nodes,
      pixels: frame.pixels,
    })),
  );
}

/**
 * Pasted vector shapes can differ from the original by a few anti-aliased pixels with no visible change.
 * A frame within these bounds counts as matching; the measured difference is always reported.
 */
const copyFidelity: NativeFidelityOptions = {
  componentIdentity: true,
};

export const pixelTolerance = {
  maxDifferingFraction: 0.0005,
  maxChannelDelta: 16,
} as const;

export interface FramePixelDifference extends PixelDifference {
  sourceFrameId: string;
  targetFrameId: string;
  withinTolerance: boolean;
}

/** Measures every pair whose pixel hashes differ; identical frames need no measurement. */
export async function measureFramePixelDifferences(
  root: string,
  sources: CopyFrameEvidence[],
  targets: CopyFrameEvidence[],
  pairs: CopiedFramePair[],
): Promise<FramePixelDifference[]> {
  const measured: FramePixelDifference[] = [];
  for (const pair of pairs) {
    const source = sources.find((item) => item.frameId === pair.sourceFrameId);
    const target = targets.find((item) => item.frameId === pair.targetFrameId);
    if (!source || !target || source.pixels.hash === target.pixels.hash) {
      continue;
    }
    if (
      source.pixels.width !== target.pixels.width ||
      source.pixels.height !== target.pixels.height
    ) {
      continue;
    }
    const [first, second] = await Promise.all([
      readFile(await artifactPath(root, source.render.path)),
      readFile(await artifactPath(root, target.render.path)),
    ]);
    const difference = await measurePixelDifference(first, second);
    measured.push({
      sourceFrameId: pair.sourceFrameId,
      targetFrameId: pair.targetFrameId,
      ...difference,
      withinTolerance:
        difference.differingPixels / difference.totalPixels <=
          pixelTolerance.maxDifferingFraction &&
        difference.maxChannelDelta <= pixelTolerance.maxChannelDelta,
    });
  }
  return measured;
}

/** Component instances are verified by identity and observed values; override bookkeeping stays unobservable, and the result says so. */
export function componentInstanceCount(evidence: CopyFrameEvidence[]): number {
  let count = 0;
  for (const frame of evidence) {
    for (const node of frame.inspection.nodes as unknown as Record<string, unknown>[]) {
      const component = node.component as Record<string, unknown> | undefined;
      if (component?.isComponentInstance === true) {
        count++;
      }
    }
  }
  return count;
}

const inspectionConcurrency = 4;

/** A frame whose concurrent read failed is simply read again by the sequential path, so errors are not lost. */
export async function inspectConcurrently(
  client: PenpotToolClient,
  fileId: string,
  pageId: string,
  frameIds: string[],
): Promise<Map<string, InspectionCapture>> {
  const inspected = new Map<string, InspectionCapture>();
  if (frameIds.length < 2) {
    return inspected;
  }
  await withPageSession(client, async () => {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < frameIds.length) {
        const frameId = frameIds[next++]!;
        try {
          inspected.set(frameId, await captureReleaseScreen(client, fileId, pageId, frameId));
        } catch {
          /* The sequential pass reads this frame again and reports any real failure. */
        }
      }
    };
    await Promise.all(
      Array.from(
        {
          length: inspectionConcurrency,
        },
        worker,
      ),
    );
  });
  return inspected;
}
