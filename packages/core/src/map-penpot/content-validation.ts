import type { MapDrawing } from "./types.js";

function text(value: unknown, maximum: number): boolean {
  return value === undefined || (typeof value === "string" && value.length <= maximum);
}

function box(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const bounds = value as Record<string, unknown>;
  return (
    [
      "x",
      "y",
      "width",
      "height",
    ].every((key) => Number.isFinite(bounds[key])) &&
    Number(bounds.x) >= 0 &&
    Number(bounds.y) >= 0 &&
    Number(bounds.width) >= 64 &&
    Number(bounds.height) > 0
  );
}

/** Reject malformed content geometry before a publication can contact Penpot. */
export function validateMapDrawingContent(drawing: MapDrawing): void {
  if (
    !text(drawing.goal, 8000) ||
    !text(drawing.summary, 240) ||
    !text(drawing.description, 8000)
  ) {
    throw new Error("Map descriptions exceed their supported text budgets");
  }
  if (
    drawing.header &&
    (!box(drawing.header.titleBox) ||
      (drawing.header.summaryBox !== undefined && !box(drawing.header.summaryBox)) ||
      !Number.isFinite(drawing.header.legendY) ||
      drawing.header.legendY < 0 ||
      !Number.isFinite(drawing.header.height) ||
      drawing.header.height <= 0)
  ) {
    throw new Error("Map header requires finite positive geometry");
  }
  if (drawing.annotations === undefined) {
    return;
  }
  const nodeIds = new Set(drawing.nodes.map((node) => node.id));
  if (
    !Array.isArray(drawing.annotations) ||
    drawing.annotations.length > 1001 ||
    new Set(drawing.annotations.map((annotation) => annotation?.id)).size !==
      drawing.annotations.length ||
    drawing.annotations.some(
      (annotation) =>
        !annotation ||
        typeof annotation.id !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(annotation.id) ||
        !box(annotation) ||
        (annotation.nodeId !== undefined && !nodeIds.has(annotation.nodeId)) ||
        typeof annotation.title !== "string" ||
        !annotation.title.trim() ||
        annotation.title.length > 4000 ||
        !text(annotation.goal, 8000) ||
        !text(annotation.summary, 240) ||
        !text(annotation.description, annotation.nodeId ? 4000 : 8000),
    )
  ) {
    throw new Error("Map annotations require unique identities, bounded text and finite geometry");
  }
}
