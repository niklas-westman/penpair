import { requireResolvedMapDetails } from "./details.js";
import { mapOriginLabels, mapOriginLegend } from "./status-labels.js";
import { hashMapContract } from "../maps/validation.js";
import { createMapProposal } from "../maps/proposal.js";
import type { MapContract, MapProposal } from "../maps/types.js";
import { readMapPathPoints } from "./path-geometry.js";
import { validateDrawing } from "./projection.js";
import type { MapDrawing, NativeMapProjection, NativeMapProposal } from "./types.js";

export function importMapProposal(
  drawing: MapDrawing,
  observed: NativeMapProjection,
  baseline?: NativeMapProjection,
): NativeMapProposal {
  validateDrawing(drawing);
  requireResolvedMapDetails(drawing);
  if (observed.mapId !== drawing.mapId || observed.contractHash !== drawing.contractHash) {
    throw new Error("Projection does not match base contract");
  }
  const changes: NativeMapProposal["changes"] = [];
  const presentation: NativeMapProposal["presentation"] = [];
  const edgeChanges: NativeMapProposal["edgeChanges"] = [];
  const findings = [
    ...observed.conflicts,
  ];
  const expectedKeys = new Set([
    `title:${drawing.mapId}`,
    ...(drawing.nodes.some((node) => node.origin)
      ? [
          `legend:${drawing.mapId}`,
        ]
      : []),
    ...drawing.nodes.flatMap((node) => [
      `node:${node.id}`,
      `label:${node.id}`,
      ...(node.origin
        ? [
            `badge:${node.id}`,
          ]
        : []),
    ]),
    ...drawing.edges.flatMap((edge) => [
      `edge:${edge.id}`,
      ...(edge.label
        ? [
            `edge-label:${edge.id}`,
          ]
        : []),
    ]),
  ]);
  for (const shape of observed.shapes) {
    if (!expectedKeys.delete(`${shape.role}:${shape.logicalId}`)) {
      findings.push(`Unmapped managed object requires reconciliation: ${shape.shapeId}`);
    }
  }
  for (const missing of expectedKeys) {
    findings.push(`Missing managed object: ${missing}`);
  }
  if (
    drawing.nodes.some((node) => node.origin) &&
    observed.shapes.find((shape) => shape.role === "legend")?.label !== mapOriginLegend
  ) {
    findings.push("Origin legend changed; reconcile against the canonical evidence contract");
  }
  for (const node of drawing.nodes) {
    for (const clickable of observed.shapes.filter(
      (shape) =>
        shape.logicalId === node.id &&
        [
          "node",
          "label",
          "badge",
        ].includes(shape.role),
    )) {
      if (
        (node.detail &&
          (clickable.interactions?.length !== 1 ||
            clickable.interactions[0]?.trigger !== "click" ||
            clickable.interactions[0]?.type !== "navigate-to" ||
            clickable.interactions[0]?.destinationId !== node.detail.frameId ||
            clickable.interactions[0]?.destinationPageId !== node.detail.pageId ||
            clickable.interactions[0]?.destinationMapHash !== node.detail.contractHash ||
            clickable.interactions[0]?.destinationMapId !== node.detail.mapId)) ||
        (!node.detail && clickable.interactions?.length)
      ) {
        findings.push(
          `Native interaction changed; reconcile the pinned detail contract: ${node.id}`,
        );
      }
    }
    if (node.origin) {
      const status = mapOriginLabels[node.origin];
      if (
        observed.shapes.find((shape) => shape.role === "badge" && shape.logicalId === node.id)
          ?.label !== status
      ) {
        findings.push(`Origin badge changed; update evidence in canonical contract: ${node.id}`);
      }
    }

    const labels = observed.shapes.filter(
      (shape) => shape.role === "label" && shape.logicalId === node.id,
    );
    const card = observed.shapes.find(
      (shape) => shape.role === "node" && shape.logicalId === node.id,
    );
    if (labels.length !== 1 || !card || !labels[0]?.label) {
      findings.push(`Missing or ambiguous node: ${node.id}`);
      continue;
    }
    const label =
      node.kind === "decision"
        ? labels[0].label.replace(/^Decision: /, "")
        : node.kind === "detail-link"
          ? labels[0].label.replace(/^Details: /, "")
          : labels[0].label;
    if (label !== node.label) {
      changes.push({
        nodeId: node.id,
        label,
      });
    }
    presentation.push({
      nodeId: node.id,
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
    });
  }
  for (const edge of drawing.edges) {
    const paths = observed.shapes.filter(
      (shape) => shape.role === "edge" && shape.logicalId === edge.id,
    );
    const path = paths[0];
    const previous = baseline?.shapes.find(
      (shape) => shape.role === "edge" && shape.logicalId === edge.id,
    );
    const labels = observed.shapes.filter(
      (shape) => shape.role === "edge-label" && shape.logicalId === edge.id,
    );
    if (paths.length !== 1 || labels.length > 1 || !path) {
      findings.push(`Relationship needs explicit reconciliation: ${edge.id}`);
      continue;
    }
    let from = path.from;
    let to = path.to;
    if (!previous || path.content !== previous.content) {
      const vertices = readMapPathPoints(path.content);
      const start = vertices?.[0];
      const end = vertices?.at(-1);
      const matchEndpoint = (
        coordinates:
          | {
              x: number;
              y: number;
            }
          | undefined,
        side: "from" | "to",
      ) =>
        observed.shapes.filter(
          (shape) =>
            shape.role === "node" &&
            (((Math.abs(shape.x + (side === "from" ? shape.width : 0) - coordinates?.x!) < 0.01 ||
              (side === "from" && Math.abs(shape.x - coordinates?.x!) < 0.01)) &&
              Math.abs(shape.y + shape.height / 2 - coordinates?.y!) < 0.01) ||
              (side === "to" &&
                Math.abs(shape.x + shape.width / 2 - coordinates?.x!) < 0.01 &&
                Math.abs(shape.y - coordinates?.y!) < 0.01)),
        );
      const validPath = vertices !== undefined;
      const starts = validPath ? matchEndpoint(start, "from") : [];
      const ends = validPath ? matchEndpoint(end, "to") : [];
      if (starts.length !== 1 || ends.length !== 1) {
        findings.push(`Relationship endpoints are ambiguous: ${edge.id}`);
        continue;
      }
      from = starts[0]?.logicalId;
      to = ends[0]?.logicalId;
    }
    if (
      !drawing.nodes.some((node) => node.id === from) ||
      !drawing.nodes.some((node) => node.id === to)
    ) {
      findings.push(`Relationship references unknown nodes: ${edge.id}`);
      continue;
    }
    const label = labels[0]?.label ?? "";
    if (from !== edge.from || to !== edge.to || label !== edge.label) {
      edgeChanges.push({
        edgeId: edge.id,
        from: from!,
        to: to!,
        label,
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "native-map-proposal",
    baseContractHash: drawing.contractHash,
    observedProjectionHash: observed.fingerprint,
    mapId: drawing.mapId,
    ...(observed.shapes.find((shape) => shape.role === "title")?.label !== drawing.title
      ? {
          title: observed.shapes.find((shape) => shape.role === "title")?.label ?? drawing.title,
        }
      : {}),
    changes,
    edgeChanges,
    presentation,
    findings,
  };
}

/** Convert a native observation into the canonical reviewed proposal format. */
export function nativeProposalToMapProposal(
  map: MapContract,
  drawing: MapDrawing,
  observed: NativeMapProjection,
  baseline?: NativeMapProjection,
): MapProposal {
  if (
    hashMapContract(map) !== drawing.contractHash ||
    (map.id !== drawing.mapId && `${map.kind}:${map.id}` !== drawing.mapId)
  ) {
    throw new Error("Native import requires the exact canonical base contract");
  }
  const imported = importMapProposal(drawing, observed, baseline);
  const proposedMap: MapContract = {
    ...map,
    title: imported.title ?? map.title,
    nodes: map.nodes.map((node) => {
      const change = imported.changes.find((change) => change.nodeId === node.id);
      return change
        ? {
            ...node,
            label: change.label,
            origin: "proposed",
          }
        : {
            ...node,
          };
    }),
    edges: map.edges.map((edge) => {
      const change = imported.edgeChanges.find((change) => change.edgeId === edge.id);
      return change
        ? {
            ...edge,
            from: change.from,
            to: change.to,
            label: change.label,
            origin: "proposed",
          }
        : {
            ...edge,
          };
    }),
    findings: [
      ...map.findings,
      ...imported.findings.map((message, index) => ({
        id: `native-${observed.fingerprint.slice(0, 12)}-${index}`,
        message,
        severity: "blocking" as const,
        status: "open" as const,
      })),
    ],
  };
  return createMapProposal(
    map,
    proposedMap,
    `Imported native map edits from projection ${observed.fingerprint}; presentation remains separate`,
  );
}
