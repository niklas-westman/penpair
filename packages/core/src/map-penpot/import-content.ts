import { nativeMapTextEntries } from "./content.js";
import { defaultMapIcon, identifyMapIcon } from "./icons.js";
import type { MapDrawing, NativeMapProjection, NativeMapProposal } from "./types.js";

export function importNativeContent(
  drawing: MapDrawing,
  observed: NativeMapProjection,
  findings: string[],
): Pick<NativeMapProposal, "changes" | "metadataChanges"> {
  const entries = nativeMapTextEntries(drawing);
  const changes: NativeMapProposal["changes"] = [];
  const metadataChanges: NonNullable<NativeMapProposal["metadataChanges"]> = {};
  const read = (
    scope: "map" | "node",
    field: "title" | "goal" | "label" | "summary" | "description",
    nodeId?: string,
  ): string | null | undefined => {
    const relevant = entries.filter(
      (entry) =>
        entry.semantic?.scope === scope &&
        entry.semantic.field === field &&
        entry.semantic.nodeId === nodeId,
    );
    const changed = relevant.flatMap((entry) => {
      const actual = observed.shapes.find(
        (shape) => shape.role === entry.role && shape.logicalId === entry.logicalId,
      );
      const text = actual?.label?.trim() ?? "";
      return text !== entry.text
        ? [
            {
              text,
              compact: entry.semantic?.compact === true,
            },
          ]
        : [];
    });
    if (!relevant.length) {
      const roles =
        scope === "map"
          ? field === "goal"
            ? [
                "map-goal",
              ]
            : field === "summary"
              ? [
                  "map-summary",
                ]
              : [
                  "map-description",
                ]
          : field === "label"
            ? [
                "label",
                "full-label",
              ]
            : field === "summary"
              ? [
                  "summary",
                  "full-summary",
                ]
              : [
                  "description",
                ];
      const actual = observed.shapes.find(
        (shape) =>
          roles.includes(shape.role) &&
          shape.logicalId === (nodeId ?? drawing.mapId) &&
          !entries.some(
            (entry) =>
              entry.role === shape.role &&
              entry.logicalId === shape.logicalId &&
              entry.semantic &&
              entry.semantic.field !== field,
          ),
      );
      return actual?.label?.trim() || undefined;
    }
    if (!changed.length) {
      return undefined;
    }
    const full = changed.find((change) => !change.compact);
    const selected = full ?? changed[0]!;
    if (selected.compact && selected.text.endsWith("…")) {
      findings.push(
        `Edit the full ${field} annotation for ${nodeId ?? drawing.mapId}; compact text is incomplete`,
      );
      return undefined;
    }
    if (
      changed.some(
        (change) =>
          change.text !== selected.text && !selected.text.startsWith(change.text.replace(/…$/, "")),
      )
    ) {
      findings.push(`Conflicting compact/full ${field} edits: ${nodeId ?? drawing.mapId}`);
    }
    return selected.text || null;
  };
  for (const field of [
    "title",
    "goal",
    "summary",
    "description",
  ] as const) {
    const value = read("map", field);
    if (value === undefined) {
      continue;
    }
    if (field === "goal" || field === "title") {
      if (!value) {
        findings.push("Map goal cannot be empty");
      } else {
        metadataChanges[field] = value;
      }
    } else {
      metadataChanges[field] = value;
    }
  }
  for (const node of drawing.nodes) {
    const change: NativeMapProposal["changes"][number] = {
      nodeId: node.id,
    };
    for (const field of [
      "label",
      "summary",
      "description",
    ] as const) {
      let value = read("node", field, node.id);
      if (value === undefined) {
        continue;
      }
      if (field === "label") {
        if (!value) {
          findings.push(`Node title cannot be empty: ${node.id}`);
          continue;
        }
        if (node.cardTitle === undefined) {
          value =
            node.kind === "decision"
              ? value.replace(/^Decision: /, "")
              : node.kind === "detail-link"
                ? value.replace(/^Details: /, "")
                : value;
        }
        change.label = value;
      } else {
        change[field] = value;
      }
    }
    const icon = observed.shapes.find(
      (shape) => shape.role === "icon" && shape.logicalId === node.id,
    );
    const key = icon ? identifyMapIcon(icon) : undefined;
    if (!key) {
      findings.push(`Unrecognized or missing native icon: ${node.id}`);
    } else if (
      icon?.iconKey &&
      icon.iconKey !== key &&
      icon.iconKey !== (node.icon ?? defaultMapIcon(node.kind))
    ) {
      findings.push(`Icon metadata and glyph disagree: ${node.id}`);
    } else if (key !== (node.icon ?? defaultMapIcon(node.kind))) {
      change.icon = key;
    }
    if (Object.keys(change).length > 1) {
      changes.push(change);
    }
  }
  return {
    changes,
    ...(Object.keys(metadataChanges).length
      ? {
          metadataChanges,
        }
      : {}),
  };
}
