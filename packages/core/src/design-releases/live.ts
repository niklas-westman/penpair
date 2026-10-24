import type { PenpotToolClient } from "../client.js";
import { captureInspection, inspectionFields, type InspectionCapture } from "../inspection.js";
import { selectPage } from "../page-session.js";
import { observationHash } from "../journal.js";
import { runSnippet, snippet } from "../snippet.js";
import { guardFile } from "../file-guard.js";
import { readArtifact } from "./artifact-paths.js";
import { inspectionContentHash } from "./fidelity.js";
import { inspectReleaseSnippet } from "./snippets.js";
import type { DesignRelease, ReleaseSource } from "./types.js";

export interface ReleaseObservation {
  pageId: string | null;
  overviewFrameId: string | null;
  marker: null | {
    schemaVersion: 1;
    owner: string;
    releaseId: string;
    productVersion: string;
    ownerKey: string;
    status: string;
    bundleHash?: string;
    reviewHash?: string;
  };
}

export function releaseClient(client: PenpotToolClient, release: DesignRelease): PenpotToolClient {
  return guardFile(
    client,
    {
      id: release.fileId,
    },
    {
      mode: "strict",
    },
  );
}

export async function observeRelease(
  client: PenpotToolClient,
  release: DesignRelease,
): Promise<ReleaseObservation> {
  const result = await runSnippet(client, inspectReleaseSnippet(release));
  if (
    !(result.pageId === null || typeof result.pageId === "string") ||
    !(result.overviewFrameId === null || typeof result.overviewFrameId === "string") ||
    !(result.marker === null || typeof result.marker === "object")
  ) {
    throw new Error("Release ownership observation is incomplete");
  }
  return {
    pageId: result.pageId,
    overviewFrameId: result.overviewFrameId,
    marker: result.marker,
  } as ReleaseObservation;
}

export async function captureReleaseScreen(
  client: PenpotToolClient,
  fileId: string,
  pageId: string,
  frameId: string,
): Promise<InspectionCapture> {
  await selectPage(client, {
    id: pageId,
  });
  const page = await runSnippet(
    client,
    snippet("release-page-name", "return {ok:true,pageName:penpot.currentPage.name};", {}, "read"),
  );
  if (typeof page.pageName !== "string" || !page.pageName) {
    throw new Error("Release page name unavailable");
  }
  const capture = await captureInspection(client, {
    page: page.pageName,
    shapeId: frameId,
    fields: [
      ...inspectionFields,
    ],
    depth: 256,
    maxNodes: 20000,
    documentBytes: 16 * 1024 * 1024,
  });
  if (
    !capture.complete ||
    capture.kind !== "shape-inspection" ||
    capture.fileId !== fileId ||
    capture.pageId !== pageId ||
    capture.nodes?.[0]?.id !== frameId
  ) {
    throw new Error("Incomplete or mismatched release screen inspection");
  }
  return capture as InspectionCapture;
}

export function dependencyFingerprint(raw: unknown): string {
  const value = raw as InspectionCapture;
  if (
    value.schemaVersion !== 1 ||
    value.kind !== "token-inspection" ||
    value.complete !== true ||
    !Array.isArray(value.reasons) ||
    value.reasons.length ||
    !Array.isArray(value.sets) ||
    !Array.isArray(value.themes) ||
    (value.counts?.unknownFields ?? 0) !== 0
  ) {
    throw new Error("Token dependency evidence is incomplete or unknown");
  }
  return observationHash({
    sets: value.sets,
    themes: value.themes,
  });
}

export async function assertSourceUnchanged(
  client: PenpotToolClient,
  root: string,
  release: DesignRelease,
  source: ReleaseSource,
): Promise<InspectionCapture> {
  const capture = await captureReleaseScreen(client, release.fileId, source.pageId, source.frameId);
  if (inspectionContentHash(capture) !== source.contentHash) {
    throw new Error(`Pinned release source changed: ${source.id}`);
  }
  const usesTokens = capture.nodes?.some(
    (node) => node.tokens && typeof node.tokens === "object" && Object.keys(node.tokens).length > 0,
  );
  if (usesTokens && !source.dependencies) {
    throw new Error("Token-bound source requires a pinned dependency inspection");
  }
  if (source.dependencies) {
    const before = JSON.parse((await readArtifact(root, source.dependencies)).toString("utf8"));
    if (before.fileId !== release.fileId) {
      throw new Error("Dependency snapshot belongs to another file");
    }
    const current = await captureInspection(client, {
      kind: "tokens",
      maxNodes: 20000,
      documentBytes: 16 * 1024 * 1024,
    });
    if (dependencyFingerprint(current) !== dependencyFingerprint(before)) {
      throw new Error("Source token dependencies changed since the pinned snapshot");
    }
  }
  return capture;
}
