import type { ArtifactReview, MapKind, MapContext } from "../maps/types.js";
import type { BaselineCase } from "../baselines-config.js";
import type { ExportOptions } from "../export.js";

export interface ReleaseArtifactRef {
  path: string;
  sha256: string;
}

export interface ReleaseComparisonReference {
  record: ReleaseArtifactRef;
  bundle: ReleaseArtifactRef;
}

export interface ReleaseComparisonCase {
  id: string;
  fileId: string;
  pageId: string;
  frameId: string;
  sha256: string;
  scale: number;
  route: string;
  intent: BaselineCase;
  threshold: number;
}

export interface ReleaseComparisonProof {
  reference: ReleaseComparisonReference;
  designHash: string;
  fileId: string;
  caseIds: string[];
  caseThresholds: Record<string, number>;
  cases: ReleaseComparisonCase[];
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

export interface LegacyDesignReleasePlanInput {
  schemaVersion: 1;
  kind: "design-release-plan";
  id: string;
  title: string;
  productVersion: string;
  fileId: string;
  screens: ReleaseScreenInput[];
  contracts: ReleaseContractInput[];
}

export interface ReleaseBaseReference {
  release: ReleaseArtifactRef;
  bundle: ReleaseArtifactRef;
}

export interface ReleaseMemberApproval {
  record: ReleaseArtifactRef;
  recordId: string;
  image: ReleaseArtifactRef;
}

export interface ReleaseMemberInput extends ReleaseScreenInput {
  comparisonThreshold?: number;
  approval?: ReleaseMemberApproval;
  route?: string;
  case?: BaselineCase;
}

export interface ReleaseMember {
  comparisonThreshold?: number;
  id: string;
  disposition: "changed" | "retained" | "adopted";
  source: ReleaseSource;
  origin?: {
    releaseId: string;
    productVersion: string;
    bundle: ReleaseArtifactRef;
  };
  approval?: ReleaseMemberApproval;
  route?: string;
  case?: BaselineCase;
}

export interface ReleaseMemberEvidence {
  id: string;
  inspection: ReleaseArtifactRef;
  render: ReleaseArtifactRef;
  contentHash: string;
  decodedPixelsHash: string;
  width: number;
  height: number;
}

export interface DeltaDesignReleasePlanInput {
  schemaVersion: 2;
  kind: "design-release-plan";
  id: string;
  title: string;
  productVersion: string;
  fileId: string;
  base?: ReleaseBaseReference;
  changes: {
    add: ReleaseMemberInput[];
    replace: ReleaseMemberInput[];
    remove: Array<{
      id: string;
      reason: string;
    }>;
  };
  contracts: ReleaseContractInput[];
}

export type DesignReleasePlanInput = LegacyDesignReleasePlanInput | DeltaDesignReleasePlanInput;

export interface DesignReleaseAdoptionInput {
  schemaVersion: 2;
  kind: "design-release-adoption";
  id: string;
  title: string;
  productVersion: string;
  fileId: string;
  screens: ReleaseMemberInput[];
  contracts: ReleaseContractInput[];
}

export interface ReceiptInput {
  approval?: ReleaseMemberApproval;
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
  schemaVersion: 1 | 2;
  base?: ReleaseBaseReference;
  members?: ReleaseMember[];
  changes?: {
    added: string[];
    replaced: string[];
    removed: Array<{
      id: string;
      reason: string;
    }>;
  };
  memberEvidence?: ReleaseMemberEvidence[];
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
  comparison?: ReleaseArtifactRef;
  receipts?: ReceiptInput[];
  apply?: boolean;
  runId?: string;
  resume?: boolean;
  exportOptions?: ExportOptions;
  onStep?: (message: string) => void;
  pointerPath?: string;
  redact?: (text: string) => string;
}

export interface ReleaseCheck {
  workflow?: import("./status-types.js").ReleaseStatus;
  valid: boolean;
  finalized: boolean;
  live: boolean;
  designHash: string;
  reasons: string[];
  implementation: DesignRelease["implementation"]["status"];
}

export interface ReleaseContext {
  releaseReference?: ReleaseComparisonReference;
  implementationAssessment?: import("./status-types.js").ReleaseImplementationStatus;
  caseThresholds?: Record<string, number>;
  workflow?: import("./status-types.js").ReleaseStatus;
  caseIds?: string[];
  schemaVersion: 1 | 2;
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
    effectivePageId?: string;
    effectiveFrameId?: string;
    disposition?: ReleaseMember["disposition"];
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
      page?: string;
      pageId?: string;
      route?: string;
      case?: BaselineCase;
      threshold?: number;
    }>;
  };
  truncated: boolean;
}
