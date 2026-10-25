import { observationHash } from "../journal.js";
import { routeMapEdges, mapDrawingGeometryProblems } from "../maps/layout.js";
import { buildMapDrawingPlan } from "../maps/render.js";
import { hashMapContract } from "../maps/validation.js";
import type { MapContract } from "../maps/types.js";
import { importMapProposal } from "./import.js";
import { drawingFromPlan, projection, validateDrawing } from "./projection.js";
import type { MapDrawing, NativeMapProjection } from "./types.js";

export interface MapPresentationProposal {
  schemaVersion: 1;
  kind: "map-presentation-proposal";
  mapKind: MapContract["kind"];
  mapId: string;
  baseContractHash: string;
  baselineFingerprint: string;
  observedProjectionHash: string;
  projection: NativeMapProjection;
  hash: string;
}

export function validateNativeMapProjection(raw: unknown): NativeMapProjection {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Saved map projection must be an object");
  }
  const record = raw as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.kind !== "native-map-projection" ||
    typeof record.fileId !== "string" ||
    !record.fileId ||
    typeof record.pageId !== "string" ||
    !record.pageId ||
    typeof record.mapId !== "string" ||
    !record.mapId ||
    typeof record.fingerprint !== "string"
  ) {
    throw new Error("Saved map projection is missing identity or fingerprint");
  }
  const checked = projection(
    {
      fileId: record.fileId,
      pageId: record.pageId,
    },
    record.mapId,
    record,
  );
  if (checked.fingerprint !== record.fingerprint) {
    throw new Error("Saved map projection fingerprint differs from its observations");
  }
  return structuredClone(checked);
}

function sameMap(left: NativeMapProjection, right: NativeMapProjection): boolean {
  return (
    left.fileId === right.fileId &&
    left.pageId === right.pageId &&
    left.boardId === right.boardId &&
    left.mapId === right.mapId
  );
}

export function validateMapPresentationProposal(raw: unknown): MapPresentationProposal {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Map presentation proposal must be an object");
  }
  const record = raw as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.kind !== "map-presentation-proposal" ||
    ![
      "journey-map",
      "integration-map",
    ].includes(String(record.mapKind)) ||
    typeof record.mapId !== "string" ||
    !record.mapId ||
    [
      record.baseContractHash,
      record.baselineFingerprint,
      record.observedProjectionHash,
      record.hash,
    ].some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
  ) {
    throw new Error("Unsupported map presentation proposal or missing hashes");
  }
  const observed = validateNativeMapProjection(record.projection);
  if (
    observed.fingerprint !== record.observedProjectionHash ||
    observed.contractHash !== record.baseContractHash ||
    !observed.boardId ||
    observed.conflicts.length
  ) {
    throw new Error("Presentation proposal observations conflict with their base contract");
  }
  const { hash, ...body } = record;
  if (hash !== observationHash(body)) {
    throw new Error("Map presentation proposal record hash differs");
  }
  return structuredClone(record) as unknown as MapPresentationProposal;
}

export function createMapPresentationProposal(
  map: MapContract,
  drawing: MapDrawing,
  observed: NativeMapProjection,
  baseline: NativeMapProjection,
): MapPresentationProposal {
  const baseHash = hashMapContract(map);
  const before = validateNativeMapProjection(baseline);
  const after = validateNativeMapProjection(observed);
  if (
    drawing.contractHash !== baseHash ||
    before.contractHash !== baseHash ||
    after.contractHash !== baseHash ||
    !sameMap(before, after) ||
    before.fingerprint === after.fingerprint
  ) {
    throw new Error(
      "Presentation proposal requires a changed projection of the same exact contract and board",
    );
  }
  const semantic = importMapProposal(drawing, after, before);
  if (
    semantic.metadataChanges ||
    semantic.changes.length ||
    semantic.edgeChanges.length ||
    semantic.title !== undefined ||
    semantic.findings.length ||
    before.conflicts.length
  ) {
    throw new Error("Semantic edits or unresolved findings require a canonical map proposal");
  }
  const priorShapes = new Map(
    before.shapes.map((shape) => [
      shape.shapeId,
      shape,
    ]),
  );
  if (
    priorShapes.size !== after.shapes.length ||
    after.shapes.some((shape) => {
      const prior = priorShapes.get(shape.shapeId);
      return (
        !prior ||
        prior.role !== shape.role ||
        prior.logicalId !== shape.logicalId ||
        observationHash(prior.appearance) !== observationHash(shape.appearance)
      );
    })
  ) {
    throw new Error(
      "Presentation adoption supports geometry edits of existing managed objects; style or ownership changes need reconciliation",
    );
  }
  const body = {
    schemaVersion: 1 as const,
    kind: "map-presentation-proposal" as const,
    mapKind: map.kind,
    mapId: map.id,
    baseContractHash: baseHash,
    baselineFingerprint: before.fingerprint,
    observedProjectionHash: after.fingerprint,
    projection: after,
  };
  return validateMapPresentationProposal({
    ...body,
    hash: observationHash(body),
  });
}

/** The caller must independently observe the live projection before adopting this saved evidence. */
export function acceptMapPresentationProposal(
  current: MapContract,
  baseline: NativeMapProjection,
  raw: unknown,
  resolvedDrawing?: MapDrawing,
): NativeMapProjection {
  const proposal = validateMapPresentationProposal(raw);
  const before = validateNativeMapProjection(baseline);
  if (
    proposal.mapId !== current.id ||
    proposal.mapKind !== current.kind ||
    hashMapContract(current) !== proposal.baseContractHash ||
    before.contractHash !== proposal.baseContractHash ||
    before.fingerprint !== proposal.baselineFingerprint ||
    !sameMap(before, proposal.projection)
  ) {
    throw new Error("Presentation proposal is stale or belongs to another map");
  }
  const revalidated = createMapPresentationProposal(
    current,
    resolvedDrawing ?? drawingFromPlan(buildMapDrawingPlan(current)),
    proposal.projection,
    before,
  );
  if (revalidated.hash !== proposal.hash) {
    throw new Error("Presentation proposal contains unsupported changes or metadata");
  }
  return structuredClone(proposal.projection);
}

/** Reuse accepted node geometry while preserving the new contract's semantic graph. */
export function preserveMapPresentation(
  drawing: MapDrawing,
  savedProjection: NativeMapProjection,
): MapDrawing {
  validateDrawing(drawing);
  const saved = validateNativeMapProjection(savedProjection);
  if (saved.mapId !== drawing.mapId || !saved.boardBounds || saved.conflicts.length) {
    throw new Error("Cannot preserve presentation from a different or conflicted map");
  }
  const bounds = saved.boardBounds;
  const nodes = drawing.nodes.map((node) => {
    const cards = saved.shapes.filter(
      (shape) => shape.role === "node" && shape.logicalId === node.id,
    );
    const card = cards[0];
    if (!card) {
      return {
        ...node,
      };
    }
    const appearance = card.appearance as
      | {
          name?: unknown;
        }
      | undefined;
    if (
      cards.length !== 1 ||
      typeof appearance?.name !== "string" ||
      !appearance.name.startsWith(`${node.kind}: `)
    ) {
      throw new Error(`Node kind changed or presentation is ambiguous: ${node.id}`);
    }
    return {
      ...node,
      x: card.x - bounds.x,
      y: card.y - bounds.y,
      width: card.width,
      height: card.height,
    };
  });
  const edges = routeMapEdges(nodes, drawing.edges);
  const problems = mapDrawingGeometryProblems(nodes, edges);
  if (problems.length) {
    throw new Error(`Preserved map layout needs reconciliation: ${problems.join("; ")}`);
  }
  const flowBottom = (flow: Pick<MapDrawing, "nodes" | "edges">) =>
    Math.max(
      0,
      ...flow.nodes.map((node) => node.y + node.height),
      ...flow.edges.flatMap((edge) => [
        ...(edge.points ?? []).map((point) => point.y),
        ...(edge.labelBox
          ? [
              edge.labelBox.y + edge.labelBox.height,
            ]
          : []),
      ]),
    );
  const noteOffset = Math.max(
    0,
    flowBottom({
      nodes,
      edges,
    }) - flowBottom(drawing),
  );
  const preserved = {
    ...drawing,
    ...(drawing.annotations
      ? {
          annotations: drawing.annotations.map((annotation) => ({
            ...annotation,
            y: annotation.y + noteOffset,
          })),
        }
      : {}),
    origin: {
      x: bounds.x,
      y: bounds.y,
    },
    nodes,
    edges,
  };
  validateDrawing(preserved);
  return preserved;
}
