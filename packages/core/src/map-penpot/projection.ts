import { nativeMapIcons } from "./icons.js";
import { validateMapDrawingContent } from "./content-validation.js";
import { nativeMapRoles } from "./content.js";
import type { PenpotToolClient } from "../client.js";
import { observationHash } from "../journal.js";
import { selectPage, withPageSession } from "../page-session.js";
import { runSnippet, type SnippetResult } from "../snippet.js";
import type { MapDrawingPlan } from "../maps/types.js";
import { inspectMapSnippet } from "./snippets.js";
import type { MapDrawing, MapTarget, NativeMapProjection, ProjectionReadOptions } from "./types.js";

export function drawingFromPlan(plan: MapDrawingPlan): MapDrawing {
  if (!plan.complete) {
    throw new Error(`Map requires smaller detail boards: ${plan.reasons.join("; ")}`);
  }
  return {
    mapId: `${plan.mapKind}:${plan.mapId}`,
    contractHash: plan.mapHash,
    title: plan.title,
    goal: plan.goal,
    ...(plan.summary !== undefined
      ? {
          summary: plan.summary,
        }
      : {}),
    ...(plan.description !== undefined
      ? {
          description: plan.description,
        }
      : {}),
    ...(plan.headerSummary !== undefined
      ? {
          headerSummary: plan.headerSummary,
        }
      : {}),
    header: plan.header,
    annotations: plan.annotations,
    fontFamily: plan.fontFamily,
    nodes: plan.nodes,
    edges: plan.edges,
  };
}

export function validateDrawing(drawing: MapDrawing): void {
  validateMapDrawingContent(drawing);
  if (
    !drawing.mapId ||
    !/^[a-f0-9]{64}$/.test(drawing.contractHash) ||
    !drawing.title ||
    drawing.title.length > 1000
  ) {
    throw new Error("Map identity, title and SHA-256 contract hash are required");
  }
  if (drawing.nodes.length > 1000 || drawing.edges.length > 2000) {
    throw new Error("Map exceeds graph limits");
  }
  if (
    drawing.origin &&
    ![
      drawing.origin.x,
      drawing.origin.y,
    ].every(Number.isFinite)
  ) {
    throw new Error("Map origin must be finite");
  }
  const identifiers = new Set(drawing.nodes.map((node) => node.id));
  if (
    identifiers.size !== drawing.nodes.length ||
    drawing.nodes.some(
      (node) =>
        !node.id ||
        (node.icon !== undefined && !Object.hasOwn(nativeMapIcons, node.icon)) ||
        (node.summary !== undefined &&
          (typeof node.summary !== "string" || node.summary.length > 240)) ||
        (node.description !== undefined &&
          (typeof node.description !== "string" || node.description.length > 4000)) ||
        (node.detail !== undefined &&
          (node.kind !== "detail-link" ||
            !node.detail.fileId ||
            !node.detail.pageId ||
            !node.detail.frameId ||
            !node.detail.path ||
            !/^[a-f0-9]{64}$/.test(node.detail.sha256))) ||
        (node.origin !== undefined &&
          ![
            "observed",
            "proposed",
            "owner-decision",
            "unknown",
          ].includes(node.origin)) ||
        !node.label ||
        node.label.length > 4000 ||
        ![
          node.x,
          node.y,
          node.width,
          node.height,
        ].every(Number.isFinite) ||
        node.width < 64 ||
        node.height < 32,
    )
  ) {
    throw new Error("Map nodes need unique IDs, bounded labels and finite positive geometry");
  }
  if (
    new Set(drawing.edges.map((edge) => edge.id)).size !== drawing.edges.length ||
    drawing.edges.some(
      (edge) =>
        !edge.id ||
        !identifiers.has(edge.from) ||
        !identifiers.has(edge.to) ||
        typeof edge.label !== "string" ||
        edge.label.length > 4000 ||
        (edge.labelBox !== undefined &&
          (![
            edge.labelBox.x,
            edge.labelBox.y,
            edge.labelBox.width,
            edge.labelBox.height,
          ].every(Number.isFinite) ||
            edge.labelBox.width <= 0 ||
            edge.labelBox.height <= 0)) ||
        (edge.points !== undefined &&
          (!Array.isArray(edge.points) ||
            edge.points.length < 2 ||
            edge.points.length > 32 ||
            edge.points.some(
              (point) =>
                ![
                  point.x,
                  point.y,
                ].every(Number.isFinite),
            ))),
    )
  ) {
    throw new Error("Map edges need unique IDs and existing endpoints");
  }
}

export function projection(
  target: MapTarget,
  mapId: string,
  result: SnippetResult,
): NativeMapProjection {
  if (
    !Array.isArray(result.shapes) ||
    !Array.isArray(result.conflicts) ||
    !(result.boardId === null || typeof result.boardId === "string") ||
    !(
      result.boardBounds === null ||
      (typeof result.boardBounds === "object" &&
        result.boardBounds &&
        [
          "x",
          "y",
          "width",
          "height",
        ].every((key) => Number.isFinite((result.boardBounds as Record<string, unknown>)[key])))
    ) ||
    !(result.contractHash === null || typeof result.contractHash === "string")
  ) {
    throw new Error("Native map inspection returned incomplete evidence");
  }
  if (
    result.shapes.some(
      (shape) =>
        !shape ||
        typeof shape !== "object" ||
        typeof shape.shapeId !== "string" ||
        typeof shape.logicalId !== "string" ||
        !nativeMapRoles.includes(shape.role) ||
        ![
          shape.x,
          shape.y,
          shape.width,
          shape.height,
        ].every(Number.isFinite) ||
        !(shape.label === null || typeof shape.label === "string") ||
        !(shape.content === null || typeof shape.content === "string"),
    ) ||
    result.conflicts.some((conflict) => typeof conflict !== "string")
  ) {
    throw new Error("Native map inspection returned malformed shape evidence");
  }
  const observed = {
    boardId: result.boardId,
    boardBounds: result.boardBounds as NativeMapProjection["boardBounds"],
    contractHash: result.contractHash,
    shapes: result.shapes,
    conflicts: result.conflicts,
  };
  return {
    schemaVersion: 1,
    kind: "native-map-projection",
    ...target,
    boardId: result.boardId,
    boardBounds: result.boardBounds as NativeMapProjection["boardBounds"],
    mapId,
    contractHash: result.contractHash,
    fingerprint: observationHash(observed),
    shapes: result.shapes as NativeMapProjection["shapes"],
    conflicts: result.conflicts as string[],
  };
}

export async function readProjection(
  client: PenpotToolClient,
  target: MapTarget,
  mapId: string,
  options: ProjectionReadOptions = {},
): Promise<NativeMapProjection> {
  return withPageSession(client, async () => {
    await selectPage(
      client,
      {
        id: target.pageId,
      },
      options,
    );
    return projection(
      target,
      mapId,
      await runSnippet(client, inspectMapSnippet(target, mapId), options),
    );
  });
}
