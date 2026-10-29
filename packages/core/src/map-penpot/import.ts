import { mapCardAnchorHeight } from "../maps/card-metrics.js";
import { nativeMapShapeKeys, nativeMapTextEntries } from "./content.js";
import { importNativeContent } from "./import-content.js";
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
  const presentation: NativeMapProposal["presentation"] = [];
  const edgeChanges: NativeMapProposal["edgeChanges"] = [];
  const findings = [
    ...observed.conflicts,
  ];
  const expectedKeys = nativeMapShapeKeys(drawing);
  for (const shape of observed.shapes) {
    if (
      !expectedKeys.delete(`${shape.role}:${shape.logicalId}`) &&
      !(
        [
          "summary",
          "full-summary",
          "description",
        ].includes(shape.role) && drawing.nodes.some((node) => node.id === shape.logicalId)
      ) &&
      !(
        [
          "map-summary",
          "map-goal",
          "map-description",
        ].includes(shape.role) && shape.logicalId === drawing.mapId
      )
    ) {
      findings.push(`Unmapped managed object requires reconciliation: ${shape.shapeId}`);
    }
  }
  for (const missing of expectedKeys) {
    if (
      ![
        "summary",
        "full-summary",
        "description",
        "map-summary",
        "map-description",
      ].some((role) => missing.startsWith(role + ":"))
    ) {
      findings.push(`Missing managed object: ${missing}`);
    }
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
          "summary",
          "icon-well",
          "icon",
          "port-in",
          "port-out",
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
    presentation.push({
      nodeId: node.id,
      x: card.x,
      y: card.y,
      width: card.width,
      height: mapCardAnchorHeight,
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
              Math.abs(shape.y + mapCardAnchorHeight / 2 - coordinates?.y!) < 0.01) ||
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
  for (const entry of nativeMapTextEntries(drawing).filter(
    (entry) =>
      !entry.semantic &&
      ![
        "edge-label",
        "badge",
        "legend",
      ].includes(entry.role),
  )) {
    if (
      observed.shapes.find(
        (shape) => shape.role === entry.role && shape.logicalId === entry.logicalId,
      )?.label !== entry.text
    ) {
      findings.push(`Derived annotation label changed: ${entry.role}:${entry.logicalId}`);
    }
  }
  const content = importNativeContent(drawing, observed, findings);
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
    ...content,
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
    ...(imported.metadataChanges?.goal !== undefined
      ? {
          goal: imported.metadataChanges.goal,
        }
      : {}),
    nodes: map.nodes.map((node) => {
      const change = imported.changes.find((change) => change.nodeId === node.id);
      if (!change) {
        return {
          ...node,
        };
      }
      const next = {
        ...node,
        origin: "proposed" as const,
        ...(change.label !== undefined
          ? {
              label: change.label,
            }
          : {}),
      };
      for (const field of [
        "summary",
        "description",
        "icon",
      ] as const) {
        if (change[field] === null) {
          delete next[field];
        } else if (change[field] !== undefined) {
          Object.assign(next, {
            [field]: change[field],
          });
        }
      }
      return next;
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
  for (const field of [
    "summary",
    "description",
  ] as const) {
    const value = imported.metadataChanges?.[field];
    if (value === null) {
      delete proposedMap[field];
    } else if (value !== undefined) {
      proposedMap[field] = value;
    }
  }
  return createMapProposal(
    map,
    proposedMap,
    `Imported native map edits from projection ${observed.fingerprint}; presentation remains separate`,
  );
}
