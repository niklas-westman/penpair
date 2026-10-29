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
  "annotation-rule",
  "annotation-id",
  "annotation-heading",
  "icon-well",
  "badge-well",
  "icon",
  "port-in",
  "port-out",
] as const;

const originColors = {
  observed: "#0B5D45",
  proposed: "#4A5461",
  "owner-decision": "#F6F7F8",
  unknown: "#8791A0",
} as const;

export const mapOriginInk = originColors;

/** Pill background behind each status label. */
export const mapOriginPills = {
  observed: "#D9F7EE",
  proposed: "#E4E7EB",
  "owner-decision": "#20262E",
  unknown: "#F6F7F8",
} as const;

export const mapBadgeWidth = (label: string): number => Math.ceil(label.length * 7.4 + 28);

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
  center?: boolean;
  /** `role:logicalId` of the flex board this text lives in, when it is not a direct child of the map board. */
  parent?: string;
  semantic?: {
    scope: "map" | "node";
    field: "title" | "goal" | "label" | "summary" | "description";
    nodeId?: string;
    compact?: boolean;
  };
}

export function nativeMapTextEntries(drawing: MapDrawing): NativeMapTextEntry[] {
  const result: NativeMapTextEntry[] = [];
  let parent: string | undefined;
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
    center = false,
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
      ...(center
        ? {
            center,
          }
        : {}),
      ...(parent
        ? {
            parent,
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
    32,
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
      16,
      "#475467",
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
      12,
      "#667085",
    );
  }
  for (const node of drawing.nodes) {
    const modern = node.cardTitle !== undefined;
    const title = modern
      ? node.cardTitle!
      : (node.kind === "decision" ? "Decision: " : node.kind === "detail-link" ? "Details: " : "") +
        node.label;
    parent = `node:${node.id}`;
    add(
      "label",
      node.id,
      title,
      node.x + 20,
      node.y + 24,
      node.width - 40,
      44,
      16,
      "#101828",
      {
        scope: "node",
        field: "label",
        nodeId: node.id,
        compact: modern && title !== node.label,
      },
      true,
      true,
    );
    const summary = node.cardSummary ?? node.summary;
    if (summary) {
      add(
        "summary",
        node.id,
        summary,
        node.x + 20,
        node.y + 224,
        node.width - 40,
        48,
        12,
        "#667085",
        {
          scope: "node",
          field: "summary",
          nodeId: node.id,
          compact: summary !== node.summary,
        },
        false,
        true,
      );
    }
    if (node.origin) {
      parent = `badge-well:${node.id}`;
      const width = mapBadgeWidth(mapOriginLabels[node.origin]);
      add(
        "badge",
        node.id,
        mapOriginLabels[node.origin],
        node.x + (node.width - width) / 2,
        node.y + node.height - 40,
        width,
        16,
        12,
        originColors[node.origin],
        undefined,
        false,
        true,
      );
    }
  }
  parent = undefined;
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
    parent = `annotation-panel:${annotation.id}`;
    const x = annotation.x;
    const width = annotation.width;
    add(
      "annotation-id",
      annotation.id,
      node ? "Node note" : "Notes",
      x,
      annotation.y + layout.idBox.y,
      width,
      layout.idBox.height,
      12,
      "#0B5D45",
      undefined,
      true,
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
        20,
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
        12,
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
        16,
        "#20262E",
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
  parent = undefined;
  return result;
}

export function nativeMapShapeKeys(drawing: MapDrawing): Set<string> {
  return new Set([
    ...nativeMapTextEntries(drawing).map((entry) => `${entry.role}:${entry.logicalId}`),
    ...drawing.nodes.flatMap((node) =>
      [
        "node",
        "icon-well",
        ...(node.origin
          ? [
              "badge-well",
            ]
          : []),
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
    ...(drawing.annotations ?? []).flatMap((annotation) => [
      `annotation-panel:${annotation.id}`,
      `annotation-rule:${annotation.id}`,
    ]),
  ]);
}
