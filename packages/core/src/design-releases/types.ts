import type { ArtifactReview, MapKind, MapContext } from "../maps/types.js";
import type { ExportOptions } from "../export.js";

export interface ReleaseArtifactRef {
  path: string;
  sha256: string;
}

export interface ReleaseScreenInput {
  id: string;
  label: string;
  pageId: string;
  frameId: string;
  inspection: ReleaseArtifactRef;
  render?: ReleaseArtifactRef;
  dependencies?: ReleaseArtifactRef;
}

export interface ReleaseSource extends ReleaseScreenInput {
  contentHash: string;
}

export interface ReleaseContractInput extends ReleaseArtifactRef {
  review?: ArtifactReview;
}

export interface ReleaseContract extends ReleaseContractInput {
  kind: MapKind;
  id: string;
}

export interface DesignReleasePlanInput {
  schemaVersion: 1;
  kind: "design-release-plan";
  id: string;
  title: string;
  productVersion: string;
  fileId: string;
  screens: ReleaseScreenInput[];
  contracts: ReleaseContractInput[];
}

export interface ReceiptInput {
  sourceId: string;
  targetFrameId: string;
}

export interface ReleaseReceipt extends ReceiptInput {
  sourceFrameId: string;
  targetPageId: string;
  nodeMap: Record<string, string>;
  sourceContentHash: string;
  targetContentHash: string;
  sourceInspection: ReleaseArtifactRef;
  targetInspection: ReleaseArtifactRef;
  originalRender: ReleaseArtifactRef;
  targetRender: ReleaseArtifactRef;
  decodedPixelsHash: string;
  width: number;
  height: number;
}

export interface ReleaseFidelity {
  schemaVersion: 1;
  kind: "design-release-fidelity";
  verifiedAt: string;
  receiptsHash: string;
  exactDecodedPixels: true;
  nativeStructure: true;
}

export interface ReleaseMapEvidence {
  kind: MapKind;
  id: string;
  boardId: string;
  contractHash: string;
  projection: ReleaseArtifactRef;
  render: ReleaseArtifactRef;
}

export interface ReleaseOverviewEvidence {
  contentHash: string;
  render: ReleaseArtifactRef;
  decodedPixelsHash: string;
}

export interface DesignRelease {
  schemaVersion: 1;
  kind: "design-release";
  id: string;
  title: string;
  productVersion: string;
  fileId: string;
  status: "planned" | "awaiting-copy" | "verified" | "final";
  sources: ReleaseSource[];
  contracts: ReleaseContract[];
  target: {
    name: string;
    ownerKey: string;
    pageId?: string;
    overviewFrameId?: string;
  };
  receipts: ReleaseReceipt[];
  maps: ReleaseMapEvidence[];
  overview?: ReleaseOverviewEvidence;
  fidelity?: ReleaseFidelity;
  reviews: ArtifactReview[];
  implementation: {
    status: "not-assessed" | "in-progress" | "verified";
    evidence: ReleaseArtifactRef[];
  };
  createdAt: string;
  finalized?: {
    bundle: ReleaseArtifactRef;
    markerHash: string;
    reviewHash: string;
  };
}

export interface ReleaseOptions {
  apply?: boolean;
  runId?: string;
  resume?: boolean;
  exportOptions?: ExportOptions;
  onStep?: (message: string) => void;
  pointerPath?: string;
  redact?: (text: string) => string;
}

export interface ReleaseCheck {
  valid: boolean;
  finalized: boolean;
  live: boolean;
  designHash: string;
  reasons: string[];
  implementation: DesignRelease["implementation"]["status"];
}

export interface ReleaseContext {
  schemaVersion: 1;
  kind: "release-context";
  id: string;
  productVersion: string;
  designHash: string;
  finalized: boolean;
  ready: boolean;
  reasons: string[];
  implementation: DesignRelease["implementation"];
  screens: Array<{
    id: string;
    label: string;
    sourceFrameId: string;
    targetFrameId: string | null;
  }>;
  contracts: ReleaseContract[];
  mapContexts: MapContext[];
  mapTargets: Array<{
    kind: MapKind;
    id: string;
    fileId: string;
    pageId: string;
    frameId: string;
    contractHash: string;
  }>;
  nextActions: string[];
  proposedBaselines: {
    page: string;
    root: string;
    format: "webp";
    frames: Array<{
      id: string;
      frameId: string;
    }>;
  };
  truncated: boolean;
}
