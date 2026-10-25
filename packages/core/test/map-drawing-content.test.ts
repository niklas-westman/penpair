import { describe, expect, it } from "vitest";
import { validateDrawing } from "../src/map-penpot/projection.js";
import type { MapDrawing } from "../src/map-penpot/types.js";

function drawing(): MapDrawing {
  return {
    mapId: "journey-map:example",
    contractHash: "a".repeat(64),
    title: "Example",
    nodes: [
      {
        id: "entry",
        label: "Entry",
        kind: "screen",
        x: 96,
        y: 180,
        width: 240,
        height: 144,
      },
    ],
    edges: [],
    annotations: [
      {
        id: "node:entry",
        nodeId: "entry",
        title: "Entry",
        description: "Full explanation",
        x: 32,
        y: 400,
        width: 548,
        height: 200,
      },
    ],
  };
}

describe("native drawing content boundaries", () => {
  it("keeps legacy drawings without optional content valid", () => {
    const original = drawing();
    delete original.annotations;
    expect(() => validateDrawing(original)).not.toThrow();
  });

  it("rejects invalid annotation bounds and ambiguous identities before publication", () => {
    for (const patch of [
      {
        width: 0,
      },
      {
        y: Number.NaN,
      },
      {
        height: Number.POSITIVE_INFINITY,
      },
      {
        nodeId: "missing",
      },
    ]) {
      const candidate = drawing();
      Object.assign(candidate.annotations![0]!, patch);
      expect(() => validateDrawing(candidate)).toThrow(/annotations/);
    }
    const duplicate = drawing();
    duplicate.annotations!.push({
      ...duplicate.annotations![0]!,
    });
    expect(() => validateDrawing(duplicate)).toThrow(/annotations/);
  });

  it("rejects oversized text and malformed header geometry", () => {
    const oversized = drawing();
    oversized.summary = "x".repeat(241);
    expect(() => validateDrawing(oversized)).toThrow(/text budgets/);
    const malformed = drawing();
    malformed.header = {
      titleBox: {
        x: 32,
        y: 24,
        width: 1120,
        height: 40,
      },
      legendY: Number.NaN,
      height: 180,
    };
    expect(() => validateDrawing(malformed)).toThrow(/header/);
  });
});
