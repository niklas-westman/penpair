import { mapAnnotationLayout } from "../maps/annotation-layout.js";
import { mapLabelHeight } from "../maps/layout.js";
import { mapOriginLabels, mapOriginLegend } from "./status-labels.js";
import type { MapDrawing, ProjectionShape } from "./types.js";

export const nativeMapRoles = [
  "node",
  "label",
  "edge",
  "edge-label",
  "title",
  "badge",
  "legend",
  "map-summary",
  "map-full-summary",
  "map-goal",
  "map-description",
  "summary",
  "full-label",
  "full-summary",
  "description",
  "annotation-panel",
  "annotation-id",
  "annotation-heading",
  "icon-well",
  "icon",
  "port-in",
  "port-out",
] as const;

export interface NativeMapTextEntry {
  role: ProjectionShape["role"];
  logicalId: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  strong?: boolean;
  semantic?: {
    scope: "map" | "node";
    field: "title" | "goal" | "label" | "summary" | "description";
    nodeId?: string;
    compact?: boolean;
  };
}

export function nativeMapTextEntries(drawing: MapDrawing): NativeMapTextEntry[] {
  const result: NativeMapTextEntry[] = [];
  const add = (
    role: NativeMapTextEntry["role"],
    logicalId: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize = 14,
    color = "#101828",
    semantic?: NativeMapTextEntry["semantic"],
    strong = false,
  ) => {
    result.push({
      role,
      logicalId,
      text,
      x,
      y,
      width,
      height,
      fontSize,
      color,
      ...(semantic
        ? {
            semantic,
          }
        : {}),
      ...(strong
        ? {
            strong,
          }
        : {}),
    });
  };
  const titleBox = drawing.header?.titleBox ?? {
    x: 32,
    y: 24,
    width: 900,
    height: 40,
  };
  add(
    "title",
    drawing.mapId,
    drawing.title,
    titleBox.x,
    titleBox.y,
    titleBox.width,
    titleBox.height,
    24,
    "#101828",
    {
      scope: "map",
      field: "title",
    },
    true,
  );
  const headerText =
    drawing.headerSummary ??
    drawing.summary ??
    (drawing.goal && drawing.goal.length <= 240 ? drawing.goal : undefined);
  if (headerText) {
    const box = drawing.header?.summaryBox ?? {
      x: 32,
      y: 72,
      width: 900,
      height: mapLabelHeight(headerText, 900),
    };
    add(
      "map-summary",
      drawing.mapId,
      headerText,
      box.x,
      box.y,
      box.width,
      box.height,
      14,
      "#667085",
      {
        scope: "map",
        field: drawing.summary !== undefined ? "summary" : "goal",
      },
    );
  }
  if (drawing.nodes.some((node) => node.origin)) {
    add(
      "legend",
      drawing.mapId,
      mapOriginLegend,
      32,
      drawing.header?.legendY ?? (headerText ? 132 : 72),
      1000,
      20,
      10,
      "#667085",
    );
  }
  for (const node of drawing.nodes) {
    const modern = node.cardTitle !== undefined;
    const title = modern
      ? node.cardTitle!
      : (node.kind === "decision" ? "Decision: " : node.kind === "detail-link" ? "Details: " : "") +
        node.label;
    add(
      "label",
      node.id,
      title,
      node.x + 64,
      node.y + 18,
      node.width - 80,
      32,
      14,
      "#101828",
      {
        scope: "node",
        field: "label",
        nodeId: node.id,
        compact: modern && title !== node.label,
      },
      true,
    );
    const summary = node.cardSummary ?? node.summary;
    if (summary) {
      add(
        "summary",
        node.id,
        summary,
        node.x + 64,
        node.y + 50,
        node.width - 80,
        48,
        12,
        "#667085",
        {
          scope: "node",
          field: "summary",
          nodeId: node.id,
          compact: summary !== node.summary,
        },
      );
    }
    if (node.origin) {
      add(
        "badge",
        node.id,
        mapOriginLabels[node.origin],
        node.x + 16,
        node.y + node.height - 24,
        node.width - 32,
        16,
        10,
        "#667085",
      );
    }
  }
  for (const edge of drawing.edges) {
    if (edge.label && edge.labelBox) {
      add(
        "edge-label",
        edge.id,
        edge.label,
        edge.labelBox.x,
        edge.labelBox.y,
        edge.labelBox.width,
        edge.labelBox.height,
        12,
        "#667085",
      );
    }
  }
  for (const annotation of drawing.annotations ?? []) {
    const node = annotation.nodeId
      ? drawing.nodes.find((candidate) => candidate.id === annotation.nodeId)
      : undefined;
    const id = node?.id ?? drawing.mapId;
    const layout = mapAnnotationLayout(annotation);
    const x = annotation.x + 20;
    const width = annotation.width - 40;
    add(
      "annotation-id",
      annotation.id,
      node ? `Node · ${node.id}` : "Map context",
      x,
      annotation.y + layout.idBox.y,
      width,
      layout.idBox.height,
      10,
      "#667085",
    );
    if (node && layout.titleBox) {
      add(
        "full-label",
        node.id,
        node.label,
        x,
        annotation.y + layout.titleBox.y,
        width,
        layout.titleBox.height,
        16,
        "#101828",
        {
          scope: "node",
          field: "label",
          nodeId: node.id,
        },
        true,
      );
    }
    for (const fieldLayout of layout.fields) {
      const field = fieldLayout.field;
      const value = annotation[field]!;
      add(
        "annotation-heading",
        `${annotation.id}:${field}`,
        field[0]!.toUpperCase() + field.slice(1),
        x,
        annotation.y + fieldLayout.headingY,
        width,
        fieldLayout.headingHeight,
        11,
        "#667085",
        undefined,
        true,
      );
      const role = node
        ? field === "summary"
          ? "full-summary"
          : "description"
        : field === "goal"
          ? "map-goal"
          : field === "summary"
            ? "map-full-summary"
            : "map-description";
      add(
        role,
        id,
        value,
        x,
        annotation.y + fieldLayout.y,
        width,
        fieldLayout.height,
        14,
        "#344054",
        {
          scope: node ? "node" : "map",
          field,
          ...(node
            ? {
                nodeId: node.id,
              }
            : {}),
        },
      );
    }
  }
  return result;
}

export function nativeMapShapeKeys(drawing: MapDrawing): Set<string> {
  return new Set([
    ...nativeMapTextEntries(drawing).map((entry) => `${entry.role}:${entry.logicalId}`),
    ...drawing.nodes.flatMap((node) =>
      [
        "node",
        "icon-well",
        "icon",
        "port-in",
        "port-out",
      ].map((role) => `${role}:${node.id}`),
    ),
    ...drawing.edges.flatMap((edge) => [
      `edge:${edge.id}`,
      ...(edge.label
        ? [
            `edge-label:${edge.id}`,
          ]
        : []),
    ]),
    ...(drawing.annotations ?? []).map((annotation) => `annotation-panel:${annotation.id}`),
  ]);
}
