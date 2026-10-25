import { observationHash } from "../journal.js";

export interface CopyRequest {
  fileId: string;
  sourcePage: string;
  frameIds: string[];
  releaseVersion: string;
}

export interface CopyPreview {
  arranged?: boolean;
  destinationNamed?: boolean;
  fileId: string;
  revision: number;
  sourcePageId: string;
  sourcePageName: string;
  destinationPageId: string | null;
  destinationName: string;
  destinationRootIds: string[];
  destinationBounds: {
    bottom: number;
  };
  sourceFrames: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    nodeCount: number;
  }>;
  createdPageOwner: string | null;
}

export interface CopyObservation {
  pageId: string;
  rootIds: string[];
  selectionIds: string[];
  rootFrames: Array<{
    id: string;
    name: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    nodeCount: number;
    copyRunId: string | null;
  }>;
}

export function validateCopyRequest(request: CopyRequest): void {
  const text = (value: unknown): value is string =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    !/[\x00-\x1f\x7f]/.test(value);
  if (
    !text(request.fileId) ||
    !text(request.sourcePage) ||
    !Array.isArray(request.frameIds) ||
    !request.frameIds.length ||
    request.frameIds.length > 100 ||
    request.frameIds.some((id) => !text(id)) ||
    new Set(request.frameIds).size !== request.frameIds.length
  ) {
    throw new Error("Copy requires a pinned file, source page and 1–100 distinct board IDs");
  }
  if (
    !text(request.releaseVersion) ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(request.releaseVersion)
  ) {
    throw new Error("Copy release version must be a safe semantic version, for example 1.2.0");
  }
}

export function readCopyPreview(raw: Record<string, unknown>, request: CopyRequest): CopyPreview {
  if (
    raw.ok !== true ||
    raw.fileId !== request.fileId ||
    !Number.isInteger(raw.revision) ||
    typeof raw.sourcePageId !== "string" ||
    typeof raw.sourcePageName !== "string" ||
    !(raw.destinationPageId === null || typeof raw.destinationPageId === "string") ||
    raw.destinationName !== `release/${request.releaseVersion}` ||
    !Array.isArray(raw.destinationRootIds) ||
    raw.destinationRootIds.some((id) => typeof id !== "string") ||
    !Array.isArray(raw.sourceFrames) ||
    raw.sourceFrames.length !== request.frameIds.length ||
    !raw.destinationBounds ||
    typeof raw.destinationBounds !== "object" ||
    !Number.isFinite(
      (
        raw.destinationBounds as {
          bottom?: unknown;
        }
      ).bottom,
    )
  ) {
    throw new Error(
      "Copy inspection did not establish the complete source and destination identities",
    );
  }
  const frames = raw.sourceFrames as CopyPreview["sourceFrames"];
  if (
    frames.some(
      (frame, index) =>
        !frame ||
        frame.id !== request.frameIds[index] ||
        typeof frame.name !== "string" ||
        ![
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          frame.nodeCount,
        ].every(Number.isFinite),
    )
  ) {
    throw new Error("Copy inspection returned incomplete board evidence");
  }
  return raw as unknown as CopyPreview;
}

export function copyRequestHash(request: CopyRequest): string {
  return observationHash(request);
}
