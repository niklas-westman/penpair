export type MapKind = "journey-map" | "integration-map";

export type MapOrigin = "observed" | "proposed" | "owner-decision" | "unknown";

export type MapIcon =
  | "screen"
  | "action"
  | "decision"
  | "data"
  | "service"
  | "code"
  | "check"
  | "link";

export interface MapSource {
  id: string;
  kind: "inspection" | "baseline" | "code" | "contract" | "other";
  sha256: string;
  path?: string;
  fileId?: string;
  pageId?: string;
  frameId?: string;
  revision?: number;
}

export interface MapNode {
  id: string;
  label: string;
  summary?: string;
  description?: string;
  icon?: MapIcon;
  kind: string;
  origin: MapOrigin;
  requirementIds?: string[];
  sourceIds?: string[];
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  origin: MapOrigin;
  requirementIds?: string[];
}

export interface MapRequirement {
  id: string;
  text: string;
  origin: MapOrigin;
  sourceIds?: string[];
}

export interface MapFinding {
  id: string;
  message: string;
  severity: "blocking" | "warning" | "info";
  status: "open" | "resolved";
  resolution?: string;
}

export interface MapContract {
  schemaVersion: 1;
  kind: MapKind;
  id: string;
  title: string;
  goal: string;
  summary?: string;
  description?: string;
  sources: MapSource[];
  nodes: MapNode[];
  edges: MapEdge[];
  requirements: MapRequirement[];
  findings: MapFinding[];
  journey?: {
    path: string;
    sha256: string;
  };
  presentation?: {
    fontFamily: string;
  };
}

export interface JourneyMap extends MapContract {
  kind: "journey-map";
}

export interface IntegrationMap extends MapContract {
  kind: "integration-map";
}

export interface ArtifactReview {
  schemaVersion: 1;
  kind: "artifact-review";
  id: string;
  artifactKind: MapKind | "design-release" | "design-evidence";
  artifactId: string;
  artifactHash: string;
  by: string;
  note: string;
  recordedAt: string;
  artifacts?: Array<{
    path: string;
    sha256: string;
  }>;
  hash: string;
}

export interface MapProposal {
  schemaVersion: 1;
  kind: "map-proposal";
  baseHash: string;
  proposedHash: string;
  proposedMap: MapContract;
  reason: string;
  hash: string;
}

export interface MapDrawingNode extends MapNode {
  cardTitle: string;
  cardSummary?: string;
  annotationId?: string;
  detail?: MapDetailTarget;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapDrawingEdge extends MapEdge {
  labelBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  points: Array<{
    x: number;
    y: number;
  }>;
}

export interface MapDetailTarget {
  sourceId: string;
  path: string;
  sha256: string;
  fileId: string;
  pageId: string;
  frameId: string;
  mapId: string;
  contractHash: string;
}

export interface MapDetailContext {
  nodeId: string;
  sourceId: string;
  path: string;
  sha256: string;
  fileId: string;
  pageId: string;
  frameId: string;
  mapId?: string;
  mapHash?: string;
  ready: boolean;
  review: "separate-artifact";
  contents: "not-inlined";
}

export interface MapDrawingPlan {
  schemaVersion: 1;
  kind: "map-drawing-plan";
  mapKind: MapKind;
  mapId: string;
  mapHash: string;
  title: string;
  goal: string;
  summary?: string;
  description?: string;
  headerSummary?: string;
  header: {
    titleBox: MapDrawingBox;
    summaryBox?: MapDrawingBox;
    legendY: number;
    height: number;
  };
  annotations: MapDrawingAnnotation[];
  fontFamily: string;
  width: number;
  height: number;
  nodes: MapDrawingNode[];
  edges: MapDrawingEdge[];
  complete: boolean;
  reasons: string[];
}

export interface MapDrawingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapDrawingAnnotation extends MapDrawingBox {
  id: string;
  nodeId?: string;
  title: string;
  goal?: string;
  summary?: string;
  description?: string;
}

export interface MapContext {
  schemaVersion: 1;
  kind: "map-context";
  mapKind: MapKind;
  mapId: string;
  mapHash: string;
  title: string;
  goal: string;
  summary?: string;
  description?: string;
  reviewed: boolean;
  ready: boolean;
  freshness: "matches-supplied-inputs" | "stale" | "unassessed";
  reasons: string[];
  nodes: MapNode[];
  edges: MapEdge[];
  requirements: MapRequirement[];
  findings: MapFinding[];
  sources: MapSource[];
  truncated: boolean;
  details: MapDetailContext[];
  implementation: "not-assessed";
}
