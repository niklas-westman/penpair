import type { MapIcon } from "../maps/types.js";
import type { ProjectionShape } from "./types.js";

export const nativeMapIcons: Record<MapIcon, string> = {
  screen: "M0 0 L24 0 L24 18 L0 18 L0 0 M6 24 L18 24 M12 18 L12 24",
  action: "M14 0 L2 14 L11 14 L10 24 L22 9 L13 9 L14 0",
  decision: "M12 0 L24 12 L12 24 L0 12 L12 0",
  data: "M0 0 L24 0 L24 24 L0 24 L0 0 M0 8 L24 8 M0 16 L24 16",
  service: "M0 0 L24 0 L24 10 L0 10 L0 0 M0 14 L24 14 L24 24 L0 24 L0 14 M5 5 L8 5 M5 19 L8 19",
  code: "M8 0 L0 12 L8 24 M16 0 L24 12 L16 24",
  check: "M0 12 L8 22 L24 0",
  link: "M0 8 L0 0 L16 0 L16 16 L8 16 M8 8 L24 8 L24 24 L8 24 L8 8",
};

export function defaultMapIcon(kind: string): MapIcon {
  if (kind === "decision") {
    return "decision";
  }
  if (kind === "detail-link") {
    return "link";
  }
  if (/screen|view|page|route/.test(kind)) {
    return "screen";
  }
  if (/data|store|state/.test(kind)) {
    return "data";
  }
  if (/service|api|request/.test(kind)) {
    return "service";
  }
  if (/component|hook|code/.test(kind)) {
    return "code";
  }
  if (/success|outcome|complete/.test(kind)) {
    return "check";
  }
  return "action";
}

function normalizedIcon(content: string | null): string | undefined {
  if (typeof content !== "string" || content.length > 8192) {
    return undefined;
  }
  const tokens = content.match(/[ML]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens || tokens.join("") !== content.replace(/[\s,]/g, "")) {
    return undefined;
  }
  const points: Array<{
    command: string;
    x: number;
    y: number;
  }> = [];
  for (let index = 0; index < tokens.length; index += 3) {
    const command = tokens[index];
    const x = Number(tokens[index + 1]);
    const y = Number(tokens[index + 2]);
    if (
      ![
        "M",
        "L",
      ].includes(command ?? "") ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return undefined;
    }
    points.push({
      command: command!,
      x,
      y,
    });
  }
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const width = Math.max(...points.map((point) => point.x)) - minX;
  const height = Math.max(...points.map((point) => point.y)) - minY;
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return points
    .map(
      (point) =>
        `${point.command}${Math.round(((point.x - minX) / width) * 10000)},${Math.round(((point.y - minY) / height) * 10000)}`,
    )
    .join(" ");
}

export function identifyMapIcon(shape: Pick<ProjectionShape, "content">): MapIcon | undefined {
  const actual = normalizedIcon(shape.content);
  if (!actual) {
    return undefined;
  }
  return (Object.keys(nativeMapIcons) as MapIcon[]).find(
    (icon) => normalizedIcon(nativeMapIcons[icon]) === actual,
  );
}
