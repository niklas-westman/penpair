/** Parse the absolute M/L subset emitted by Penpot, including compact/comma SVG normalization. */
export function readMapPathPoints(content: string | null | undefined):
  | Array<{
      x: number;
      y: number;
    }>
  | undefined {
  if (typeof content !== "string" || content.length > 65536) {
    return undefined;
  }
  let offset = 0;
  const number = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  const skipSeparators = () => {
    while (offset < content.length && /[\s,]/.test(content[offset]!)) {
      offset++;
    }
  };
  const readCoordinate = () => {
    skipSeparators();
    number.lastIndex = offset;
    const match = number.exec(content);
    if (!match) {
      return undefined;
    }
    offset = number.lastIndex;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : undefined;
  };
  const points: Array<{
    x: number;
    y: number;
  }> = [];
  while (offset < content.length) {
    skipSeparators();
    if (offset === content.length) {
      break;
    }
    const command = content[offset];
    if (command === "M" || command === "L") {
      if (points.length === 0 ? command !== "M" : command !== "L") {
        return undefined;
      }
      offset++;
    } else if (points.length === 0) {
      return undefined;
    }
    const x = readCoordinate();
    const y = readCoordinate();
    if (x === undefined || y === undefined || points.length >= 32) {
      return undefined;
    }
    points.push({
      x,
      y,
    });
  }
  return points.length >= 2 ? points : undefined;
}
