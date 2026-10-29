import { mapCardAnchorHeight } from "../maps/card-metrics.js";
import { nativeMapShapeKeys, nativeMapTextEntries } from "./content.js";
import { defaultMapIcon, identifyMapIcon } from "./icons.js";
import { mapOriginLabels, mapOriginLegend } from "./status-labels.js";
import { redactEndpoint } from "../endpoint.js";
import { MapExportEvidenceError } from "./evidence-error.js";
import { resolveMapDetails } from "./details.js";
import type { PenpotToolClient } from "../client.js";
import { exportShapePng, type ExportResult } from "../export.js";
import { runOperation, type Operation } from "../operation.js";
import { routeMapEdges, mapDrawingGeometryProblems } from "../maps/layout.js";
import { preserveMapPresentation } from "./presentation.js";
import { withPageSession } from "../page-session.js";
import { readMapPathPoints } from "./path-geometry.js";
import { inspectMapSnippet, publishMapSnippet } from "./snippets.js";
import { validateDrawing, projection, readProjection } from "./projection.js";
import type {
  MapDrawing,
  MapTarget,
  NativeMapProjection,
  PublishMapOptions,
  PublishMapResult,
} from "./types.js";

export function verificationProblems(drawing: MapDrawing, observed: NativeMapProjection): string[] {
  const problems = [
    ...observed.conflicts,
  ];
  if (!observed.boardId || observed.contractHash !== drawing.contractHash) {
    problems.push("Map board or contract identity differs");
  }
  const expectedKeys = nativeMapShapeKeys(drawing);
  for (const shape of observed.shapes) {
    if (!expectedKeys.delete(`${shape.role}:${shape.logicalId}`)) {
      problems.push(`Unexpected shape ${shape.shapeId}`);
    }
  }
  if (expectedKeys.size) {
    problems.push("Managed shapes are missing");
  }
  if (
    drawing.nodes.some((node) => node.origin) &&
    observed.shapes.find((shape) => shape.role === "legend")?.label !== mapOriginLegend
  ) {
    problems.push("Origin legend differs");
  }
  for (const shape of observed.shapes) {
    const style = shape.appearance as Record<string, unknown> | undefined;
    const radius = shape.role === "node" ? 12 : shape.role === "icon-well" ? 8 : undefined;
    if (
      radius !== undefined &&
      [
        "borderRadiusTopLeft",
        "borderRadiusTopRight",
        "borderRadiusBottomLeft",
        "borderRadiusBottomRight",
      ].some((corner) => typeof style?.[corner] === "number" && style[corner] !== radius)
    ) {
      problems.push(`Native rounded corners differ: ${shape.role}:${shape.logicalId}`);
    }
    if (
      (typeof style?.opacity === "number" && style.opacity !== 1) ||
      (typeof style?.blendMode === "string" && style.blendMode !== "normal")
    ) {
      problems.push(`Native decorative opacity/blend differs: ${shape.role}:${shape.logicalId}`);
    }
  }
  const bounds = observed.boardBounds;
  if (bounds) {
    for (const shape of observed.shapes.filter((shape) => shape.role !== "edge")) {
      if (
        shape.x < bounds.x ||
        shape.y < bounds.y ||
        shape.x + shape.width > bounds.x + bounds.width + 0.01 ||
        shape.y + shape.height > bounds.y + bounds.height + 0.01
      ) {
        problems.push(`Map content exceeds board bounds: ${shape.logicalId}`);
      }
    }
  }

  for (const node of drawing.nodes) {
    const label = observed.shapes.find(
      (shape) => shape.role === "label" && shape.logicalId === node.id,
    );
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
        node.detail &&
        (clickable.interactions?.length !== 1 ||
          clickable.interactions[0]?.trigger !== "click" ||
          clickable.interactions[0]?.type !== "navigate-to" ||
          clickable.interactions[0]?.destinationId !== node.detail.frameId ||
          clickable.interactions[0]?.destinationPageId !== node.detail.pageId ||
          clickable.interactions[0]?.destinationMapHash !== node.detail.contractHash ||
          clickable.interactions[0]?.destinationMapId !== node.detail.mapId)
      ) {
        problems.push(`Detail link destination differs or is unobservable: ${node.id}`);
      }
      if (!node.detail && clickable.interactions?.length) {
        problems.push(`Unexpected native interaction: ${node.id}`);
      }
    }
    if (node.origin) {
      const status = mapOriginLabels[node.origin];
      if (
        observed.shapes.find((shape) => shape.role === "badge" && shape.logicalId === node.id)
          ?.label !== status
      ) {
        problems.push(`Origin badge differs: ${node.id}`);
      }
    }
    const icon = observed.shapes.find(
      (shape) => shape.role === "icon" && shape.logicalId === node.id,
    );
    if (!icon || identifyMapIcon(icon) !== (node.icon ?? defaultMapIcon(node.kind))) {
      problems.push(`Native icon differs: ${node.id}`);
    }
    const card = observed.shapes.find(
      (shape) => shape.role === "node" && shape.logicalId === node.id,
    );
    if (
      card &&
      label &&
      (label.x < card.x ||
        label.y < card.y ||
        label.x + label.width > card.x + card.width + 0.01 ||
        label.y + label.height > card.y + card.height + 0.01)
    ) {
      problems.push(`Node label exceeds card bounds: ${node.id}`);
    }
  }
  if (observed.shapes.find((shape) => shape.role === "title")?.label !== drawing.title) {
    problems.push("Map title differs");
  }
  for (const entry of nativeMapTextEntries(drawing)) {
    const actual = observed.shapes.find(
      (shape) => shape.role === entry.role && shape.logicalId === entry.logicalId,
    );
    if (actual?.label !== entry.text) {
      problems.push(`Native text differs: ${entry.role}:${entry.logicalId}`);
    }
    if (!entry.parent && actual && actual.height > entry.height + 0.01) {
      problems.push(`Native text exceeds reserved space: ${entry.role}:${entry.logicalId}`);
    }
  }
  const title = observed.shapes.find((shape) => shape.role === "title");
  const legend = observed.shapes.find((shape) => shape.role === "legend");
  if (
    title &&
    (title.height > (drawing.header?.titleBox.height ?? 48) ||
      (legend && title.y + title.height > legend.y))
  ) {
    problems.push("Map title exceeds the reserved header space");
  }

  for (const edge of drawing.edges) {
    const path = observed.shapes.find(
      (shape) => shape.role === "edge" && shape.logicalId === edge.id,
    );
    if (path?.from !== edge.from || path.to !== edge.to) {
      problems.push(`Relationship differs: ${edge.id}`);
    }
    const edgeLabel = observed.shapes.find(
      (shape) => shape.role === "edge-label" && shape.logicalId === edge.id,
    );
    if (edge.label && edgeLabel?.label !== edge.label) {
      problems.push(`Relationship label differs: ${edge.id}`);
    }
    if (edge.labelBox && edgeLabel && edgeLabel.height > edge.labelBox.height + 0.01) {
      problems.push(`Relationship label exceeds reserved space: ${edge.id}`);
    }

    const from = observed.shapes.find(
      (shape) => shape.role === "node" && shape.logicalId === edge.from,
    );
    const to = observed.shapes.find(
      (shape) => shape.role === "node" && shape.logicalId === edge.to,
    );
    const vertices = readMapPathPoints(path?.content);
    const start = vertices?.[0];
    const end = vertices?.at(-1);
    const close = (left: number | undefined, right: number) =>
      left !== undefined && Number.isFinite(left) && Math.abs(left - right) < 0.01;
    if (
      !from ||
      !to ||
      !vertices ||
      !(close(start?.x, from.x + from.width) || close(start?.x, from.x)) ||
      !close(start?.y, from.y + mapCardAnchorHeight / 2) ||
      !(
        (close(end?.x, to.x) && close(end?.y, to.y + mapCardAnchorHeight / 2)) ||
        (edge.from === edge.to && close(end?.x, to.x + to.width / 2) && close(end?.y, to.y))
      )
    ) {
      problems.push(`Relationship native geometry differs: ${edge.id}`);
    }
  }
  if (bounds) {
    const nodes = observed.shapes
      .filter((shape) => shape.role === "node")
      .map((shape) => ({
        id: shape.logicalId,
        x: shape.x - bounds.x,
        y: shape.y - bounds.y,
        width: shape.width,
        height: mapCardAnchorHeight,
      }));
    const edges = drawing.edges.flatMap((edge) => {
      const path = observed.shapes.find(
        (shape) => shape.role === "edge" && shape.logicalId === edge.id,
      );
      const points = readMapPathPoints(path?.content);
      const label = observed.shapes.find(
        (shape) => shape.role === "edge-label" && shape.logicalId === edge.id,
      );
      return points && label
        ? [
            {
              id: edge.id,
              points: points.map((point) => ({
                x: point.x - bounds.x,
                y: point.y - bounds.y,
              })),
              labelBox: {
                x: label.x - bounds.x,
                y: label.y - bounds.y,
                width: label.width,
                height: label.height,
              },
            },
          ]
        : [];
    });
    problems.push(...mapDrawingGeometryProblems(nodes, edges));
  }
  return problems;
}

export async function publishMap(
  client: PenpotToolClient,
  target: MapTarget,
  drawing: MapDrawing,
  options: PublishMapOptions = {},
): Promise<PublishMapResult> {
  const configuredRedact = options.redact ?? options.journal?.redact;
  const redact = (text: string) => redactEndpoint(configuredRedact ? configuredRedact(text) : text);
  const requireProtectedValuesAbsent = (value: unknown) => {
    const encoded = JSON.stringify(value);
    if (redact(encoded) !== encoded) {
      throw new Error("Native map contains protected values; publication refused");
    }
  };
  requireProtectedValuesAbsent(drawing);
  validateDrawing(drawing);
  if (drawing.nodes.some((node) => node.detail)) {
    if (!options.journal?.root) {
      throw new Error("Pinned detail publication needs its project root");
    }
    drawing = await resolveMapDetails(options.journal.root, drawing);
  }
  drawing = {
    ...drawing,
    edges: drawing.edges.every((edge) => edge.points && edge.labelBox)
      ? drawing.edges
      : routeMapEdges(drawing.nodes, drawing.edges),
  };
  requireProtectedValuesAbsent(drawing);
  const geometryProblems = mapDrawingGeometryProblems(
    drawing.nodes,
    drawing.edges as Required<Pick<MapDrawing["edges"][number], "id" | "points" | "labelBox">>[],
  );
  if (geometryProblems.length) {
    throw new Error(`Map layout requires review: ${geometryProblems.join("; ")}`);
  }
  if (options.apply && !options.journal) {
    throw new Error("Map publication requires a durable operation journal");
  }
  return withPageSession(client, async () => {
    const before = await readProjection(client, target, drawing.mapId, options);
    requireProtectedValuesAbsent(before);
    if (before.conflicts.length) {
      throw new Error(before.conflicts.join("; "));
    }
    if (
      options.apply &&
      before.boardId &&
      !options.journal?.resume &&
      (!options.expected ||
        options.expected.fingerprint !== before.fingerprint ||
        options.expected.mapId !== drawing.mapId ||
        options.expected.fileId !== target.fileId ||
        options.expected.pageId !== target.pageId)
    ) {
      throw new Error(
        "Existing map requires matching prior projection; import and reconcile edits first",
      );
    }
    // Build the full write during preview too; size limits fail before a journal or remote mutation.
    publishMapSnippet(
      target,
      before.boardId ? preserveMapPresentation(drawing, before) : drawing,
      before,
    );
    const operation: Operation<MapDrawing> = {
      name: "publish-map",
      page: () => undefined,
      inspect: () => inspectMapSnippet(target, drawing.mapId),
      apply: (_drawing, inspected) => {
        const observed = inspected
          ? projection(target, drawing.mapId, inspected)
          : {
              ...before,
              boardId: null,
              boardBounds: null,
              contractHash: null,
              shapes: [],
              conflicts: [],
            };
        const projectedDrawing = observed.boardId
          ? preserveMapPresentation(drawing, observed)
          : drawing;
        requireProtectedValuesAbsent(projectedDrawing);
        requireProtectedValuesAbsent(observed);
        return publishMapSnippet(target, projectedDrawing, observed);
      },
      readback: () => inspectMapSnippet(target, drawing.mapId),
      verify: ({ readback }) =>
        verificationProblems(drawing, projection(target, drawing.mapId, readback)),
    };
    const report = await runOperation(client, operation, drawing, options);
    const observed = report.readback ? projection(target, drawing.mapId, report.readback) : before;
    let image: ExportResult | undefined;
    if (options.apply && report.verified && options.export !== false && observed.boardId) {
      try {
        image = await exportShapePng(client, observed.boardId, {
          ...options,
          stable: true,
        });
      } catch (error) {
        const detail = redact(error instanceof Error ? error.message : String(error));
        if (report.journal?.runId) {
          throw new MapExportEvidenceError(report.journal.runId, detail);
        }
        throw error;
      }
    }
    return {
      report,
      projection: observed,
      ...(image
        ? {
            image,
          }
        : {}),
      visualReviewRequired: Boolean(options.apply),
    };
  });
}
