import type { MapDrawingAnnotation } from "./types.js";

type AnnotationContent = Pick<
  MapDrawingAnnotation,
  "nodeId" | "title" | "goal" | "summary" | "description" | "width"
>;

export interface MapAnnotationLayout {
  idBox: {
    y: number;
    height: number;
  };
  titleBox?: {
    y: number;
    height: number;
  };
  fields: Array<{
    field: "goal" | "summary" | "description";
    headingY: number;
    headingHeight: number;
    y: number;
    height: number;
  }>;
  height: number;
}

function wordWidth(word: string, fontSize: number): number {
  return Array.from(word).reduce((width, character) => {
    const factor = /\s/.test(character)
      ? 0.35
      : /[il.,'!:;]/.test(character)
        ? 0.35
        : /[MW@#]/.test(character)
          ? 1
          : /[A-Z]/.test(character)
            ? 0.78
            : /[a-z0-9]/.test(character)
              ? 0.62
              : 1;
    return width + factor * fontSize;
  }, 0);
}

/** Conservative word wrapping for Inter notes; native text uses the same reserved boxes. */
export function mapNoteTextHeight(
  text: string,
  width: number,
  fontSize = 14,
  lineHeight = 20,
): number {
  let lines = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    let lineWidth = 0;
    let paragraphLines = 1;
    for (const token of paragraph.split(/(\s+)/).filter(Boolean)) {
      const tokenWidth = wordWidth(token, fontSize);
      if (lineWidth && lineWidth + tokenWidth > width) {
        paragraphLines++;
        lineWidth = 0;
      }
      if (!lineWidth && /^\s+$/.test(token)) {
        continue;
      }
      paragraphLines += Math.max(0, Math.ceil(tokenWidth / width) - 1);
      lineWidth += tokenWidth > width ? tokenWidth % width : tokenWidth;
    }
    lines += paragraphLines;
  }
  return Math.max(1, lines) * lineHeight;
}

export function mapAnnotationLayout(annotation: AnnotationContent): MapAnnotationLayout {
  const width = annotation.width - 40;
  const idBox = {
    y: 20,
    height: 16,
  };
  let y = idBox.y + idBox.height + 8;
  const titleBox = annotation.nodeId
    ? {
        y,
        height: mapNoteTextHeight(annotation.title, width, 16, 24),
      }
    : undefined;
  if (titleBox) {
    y += titleBox.height + 12;
  }
  const fields: Array<{
    field: "goal" | "summary" | "description";
    headingY: number;
    headingHeight: number;
    y: number;
    height: number;
  }> = [];
  for (const field of [
    "goal",
    "summary",
    "description",
  ] as const) {
    const value = annotation[field];
    if (value === undefined) {
      continue;
    }
    const height = mapNoteTextHeight(value, width);
    fields.push({
      field,
      headingY: y,
      headingHeight: 16,
      y: y + 20,
      height,
    });
    y += 20 + height + 14;
  }
  return {
    idBox,
    ...(titleBox
      ? {
          titleBox,
        }
      : {}),
    fields,
    height: y + 6,
  };
}
