import type { MapIcon, MapDrawingPlan } from "../maps/types.js";
import type { ExecuteOptions } from "../client.js";
import type { OperationOptions, OperationReport } from "../operation.js";
import type { ExportResult } from "../export.js";

export interface NativeDrawingNode {
  id: string;
  label: string;
  summary?: string;
  description?: string;
  icon?: MapIcon;
  cardTitle?: string;
  cardSummary?: string;
  annotationId?: string;
  kind: string;
  requirementIds?: string[];
  detail?: {
    mapId?: string;
    contractHash?: string;
    sourceId: string;
    path: string;
    sha256: string;
    fileId: string;
    pageId: string;
    frameId: string;
  };
  origin?: "observed" | "proposed" | "owner-decision" | "unknown";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeDrawingEdge {
  labelBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  points?: {
    x: number;
    y: number;
  }[];
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface MapDrawing {
  mapId: string;
  contractHash: string;
  title: string;
  goal?: string;
  summary?: string;
  description?: string;
  headerSummary?: string;
  header?: MapDrawingPlan["header"];
  annotations?: MapDrawingPlan["annotations"];
  fontFamily?: string;
  origin?: {
    x: number;
    y: number;
  };
  nodes: NativeDrawingNode[];
  edges: NativeDrawingEdge[];
}

export interface MapTarget {
  fileId: string;
  pageId: string;
  boardId?: string;
}

export interface ProjectionShape {
  shapeId: string;
  logicalId: string;
  role:
    | "node"
    | "label"
    | "edge"
    | "edge-label"
    | "title"
    | "badge"
    | "legend"
    | "map-summary"
    | "map-full-summary"
    | "map-goal"
    | "map-description"
    | "summary"
    | "full-label"
    | "full-summary"
    | "description"
    | "annotation-panel"
    | "annotation-id"
    | "annotation-heading"
    | "icon-well"
    | "icon"
    | "port-in"
    | "port-out";
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string | null;
  appearance?: unknown;
  iconKey?: string | null;
  interactions?:
    | {
        trigger: string;
        type: string;
        destinationId: string | null;
        destinationPageId?: string | null;
        destinationMapHash?: string | null;
        destinationMapId?: string | null;
      }[]
    | null;
  from?: string;
  to?: string;
}

export interface NativeMapProjection {
  schemaVersion: 1;
  kind: "native-map-projection";
  fileId: string;
  pageId: string;
  boardId: string | null;
  boardBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  mapId: string;
  contractHash: string | null;
  fingerprint: string;
  shapes: ProjectionShape[];
  conflicts: string[];
}

export interface PublishMapOptions extends OperationOptions {
  /** Required for writes; the standard operation journal persists the pre-write snapshot. */
  journal?: OperationOptions["journal"];
  /** Last independently observed projection. Required before replacing an existing map. */
  expected?: NativeMapProjection;
  /** Export remains evidence awaiting human/agent visual inspection. */
  export?: boolean;
}

export interface PublishMapResult {
  report: OperationReport;
  projection: NativeMapProjection;
  image?: ExportResult;
  visualReviewRequired: boolean;
}

export interface NativeMapProposal {
  schemaVersion: 1;
  kind: "native-map-proposal";
  baseContractHash: string;
  observedProjectionHash: string;
  mapId: string;
  title?: string;
  metadataChanges?: {
    title?: string;
    goal?: string;
    summary?: string | null;
    description?: string | null;
  };
  changes: {
    nodeId: string;
    label?: string;
    summary?: string | null;
    description?: string | null;
    icon?: MapIcon | null;
  }[];
  edgeChanges: {
    edgeId: string;
    from: string;
    to: string;
    label: string;
  }[];
  presentation: {
    nodeId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  findings: string[];
}

export type ProjectionReadOptions = ExecuteOptions;
