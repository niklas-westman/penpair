import type { PenpotToolClient } from "../client.js";
import { exportShapePng, exportShapesPngStable } from "../export.js";
import { selectPage } from "../page-session.js";
import { setTimeout as sleepFor } from "node:timers/promises";
import { saveArtifact } from "./artifact-paths.js";
import { whileEditorBusy } from "./editor-busy.js";
import type { BackendFrameEvidence } from "./backend-evidence.js";
import type { CopiedFramePair, FramePixelDifference } from "./copy-evidence.js";
import { pixelTolerance } from "./copy-evidence.js";
import { decodedPixels, measurePixelDifference } from "./fidelity.js";
import type { ReleaseArtifactRef } from "./types.js";

export type PixelVerification = "none" | "sample" | "all";

/** Boards compared by pixels when sampling: the first, the last and the largest; everything when there are few. */
const sampleSize = 3;

export type PixelAcceptance = "identical" | "within-tolerance" | "localized-with-identical-data";

export interface PixelFinding extends FramePixelDifference {
  acceptedAs?: PixelAcceptance;
}

export interface PixelSampleResult {
  /** The boards that were rendered and compared (source ids). */
  compared: string[];
  /** The boards that needed the slower, settled double render. */
  settled: string[];
  findings: PixelFinding[];
  problems: string[];
}

interface RenderedBoard {
  render: ReleaseArtifactRef;
  hash: string;
  width: number;
  height: number;
  png: Buffer;
}

export function sampledPairs(
  mode: PixelVerification,
  pairs: CopiedFramePair[],
  sources: BackendFrameEvidence[],
): CopiedFramePair[] {
  if (mode === "none") {
    return [];
  }
  if (mode === "all" || pairs.length <= sampleSize) {
    return pairs;
  }
  const nodesOf = (pair: CopiedFramePair): number =>
    sources.find((source) => source.frameId === pair.sourceFrameId)?.nodes ?? 0;
  const largest = pairs.reduce((best, pair) => (nodesOf(pair) > nodesOf(best) ? pair : best));
  return [
    ...new Set([
      pairs[0]!,
      pairs[pairs.length - 1]!,
      largest,
    ]),
  ];
}

async function renderBoards(
  client: PenpotToolClient,
  root: string,
  pageId: string,
  frameIds: string[],
  prefix: string,
  settled: boolean,
  redact: ((text: string) => string) | undefined,
): Promise<Map<string, RenderedBoard>> {
  await selectPage(client, {
    id: pageId,
  });
  const batch =
    frameIds.length > 1
      ? await exportShapesPngStable(client, frameIds, {
          singleRound: !settled,
        })
      : new Map();
  const rendered = new Map<string, RenderedBoard>();
  for (const [index, frameId] of frameIds.entries()) {
    const image =
      batch.get(frameId) ??
      (await exportShapePng(client, frameId, {
        stable: settled,
      }));
    const pixels = await decodedPixels(image.png);
    rendered.set(frameId, {
      render: await saveArtifact(root, `${prefix}/frame-${index}.png`, image.png, redact),
      hash: pixels.hash,
      width: pixels.width,
      height: pixels.height,
      png: image.png,
    });
  }
  return rendered;
}

async function measure(
  pair: CopiedFramePair,
  source: RenderedBoard,
  target: RenderedBoard,
  nativeVerified: boolean,
): Promise<PixelFinding> {
  if (
    source.hash === target.hash &&
    source.width === target.width &&
    source.height === target.height
  ) {
    return {
      sourceFrameId: pair.sourceFrameId,
      targetFrameId: pair.targetFrameId,
      differingPixels: 0,
      totalPixels: source.width * source.height,
      maxChannelDelta: 0,
      withinTolerance: true,
      acceptedAs: "identical",
    };
  }
  const sameSize = source.width === target.width && source.height === target.height;
  const difference = sameSize
    ? await measurePixelDifference(source.png, target.png)
    : {
        differingPixels: Math.max(source.width * source.height, target.width * target.height),
        totalPixels: Math.max(source.width * source.height, target.width * target.height),
        maxChannelDelta: 255,
      };
  const fraction = difference.differingPixels / difference.totalPixels;
  const withinTolerance =
    sameSize &&
    fraction <= pixelTolerance.maxDifferingFraction &&
    difference.maxChannelDelta <= pixelTolerance.maxChannelDelta;
  // Identical stored data with a few localised pixels is rasteriser rounding (hairline strokes), not a different design.
  const localized = sameSize && nativeVerified && fraction <= pixelTolerance.maxDifferingFraction;
  return {
    sourceFrameId: pair.sourceFrameId,
    targetFrameId: pair.targetFrameId,
    ...difference,
    withinTolerance,
    ...(withinTolerance
      ? {
          acceptedAs: "within-tolerance" as const,
        }
      : localized
        ? {
            acceptedAs: "localized-with-identical-data" as const,
          }
        : {}),
  };
}

/**
 * Renders the sampled pairs once per side. A pair that differs beyond what is accepted is rendered again with the settled
 * double render on both sides before it counts as a problem.
 */
export async function comparePairPixels(
  client: PenpotToolClient,
  root: string,
  pages: {
    source: string;
    target: string;
  },
  pairs: CopiedFramePair[],
  prefix: string,
  nativeVerified: boolean,
  redact?: (text: string) => string,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) => sleepFor(milliseconds),
  report: (message: string) => void = () => undefined,
): Promise<PixelSampleResult> {
  const result: PixelSampleResult = {
    compared: pairs.map((pair) => pair.sourceFrameId),
    settled: [],
    findings: [],
    problems: [],
  };
  if (!pairs.length) {
    return result;
  }
  const ids = (select: (pair: CopiedFramePair) => string, subset: CopiedFramePair[]) =>
    subset.map(select);
  const compare = async (subset: CopiedFramePair[], settled: boolean): Promise<PixelFinding[]> => {
    const label = settled ? "settled" : "single";
    report(
      `${settled ? "settled re-render of" : "rendering"} ${subset.length} board pair${subset.length === 1 ? "" : "s"} (source page first, then the copies)`,
    );
    // Renders are reads; a busy editor (a large paste just finished) answers them late, so ask again.
    const sources = await whileEditorBusy(
      () =>
        renderBoards(
          client,
          root,
          pages.source,
          ids((pair) => pair.sourceFrameId, subset),
          `${prefix}/source-${label}`,
          settled,
          redact,
        ),
      pause,
    );
    const targets = await whileEditorBusy(
      () =>
        renderBoards(
          client,
          root,
          pages.target,
          ids((pair) => pair.targetFrameId, subset),
          `${prefix}/target-${label}`,
          settled,
          redact,
        ),
      pause,
    );
    report(`comparing ${subset.length} rendered pair${subset.length === 1 ? "" : "s"}`);
    const findings: PixelFinding[] = [];
    for (const pair of subset) {
      findings.push(
        await measure(
          pair,
          sources.get(pair.sourceFrameId)!,
          targets.get(pair.targetFrameId)!,
          nativeVerified,
        ),
      );
    }
    return findings;
  };
  const first = await compare(pairs, false);
  const unaccepted = pairs.filter((_pair, index) => first[index]!.acceptedAs === undefined);
  const byFrame = new Map(
    first.map((finding) => [
      finding.sourceFrameId,
      finding,
    ]),
  );
  if (unaccepted.length) {
    result.settled = unaccepted.map((pair) => pair.sourceFrameId);
    for (const finding of await compare(unaccepted, true)) {
      byFrame.set(finding.sourceFrameId, finding);
    }
  }
  result.findings = pairs.map((pair) => byFrame.get(pair.sourceFrameId)!);
  for (const finding of result.findings) {
    if (finding.acceptedAs === undefined) {
      result.problems.push(`Exported pixels differ for ${finding.sourceFrameId}`);
    }
  }
  return result;
}
