import { describe, expect, it } from "vitest";
import {
  compareBackendSubtrees,
  subtreeSignature,
  type BackendObjects,
} from "../src/design-releases/backend-compare.js";
import type { BackendShape } from "../src/penpot-backend.js";

/** A board with a rectangle, a text, a path and a component instance, placed at (x, y); ids carry a prefix. */
function board(prefix: string, x: number, y: number): BackendObjects {
  const id = (name: string) => `${prefix}-${name}`.padEnd(36, "0").replace(/[^0-9a-f-]/g, "a");
  const root = id("board");
  const shape = (name: string, type: string, extra: Record<string, unknown>): BackendShape => ({
    id: id(name),
    name,
    type,
    parentId: root,
    frameId: root,
    ...extra,
  });
  const rectangle = shape("rectangle", "rect", {
    x: x + 10,
    y: y + 20,
    width: 50,
    height: 30,
    selrect: {
      x: x + 10,
      y: y + 20,
      width: 50,
      height: 30,
      x1: x + 10,
      y1: y + 20,
      x2: x + 60,
      y2: y + 50,
    },
    points: [
      {
        x: x + 10,
        y: y + 20,
      },
      {
        x: x + 60,
        y: y + 20,
      },
    ],
    fills: [
      {
        fillColor: "#ff0000",
        fillOpacity: 1,
      },
    ],
    strokes: [],
  });
  const text = shape("label", "text", {
    x: x + 5,
    y: y + 5,
    width: 40,
    height: 12,
    content: {
      type: "root",
      children: [
        {
          text: "Hello",
        },
      ],
    },
    positionData: [
      {
        x: x + 5,
        y: y + 5,
        width: 40,
        height: 12,
        x1: 0,
        y1: 1.5,
        x2: 40,
        y2: 12,
      },
    ],
  });
  const path = shape("icon", "path", {
    x: null,
    y: null,
    content: `M${x + 1},${y + 2}L${x + 11.5},${y + 2}C${x + 12},${y + 3},${x + 13},${y + 4},${x + 14},${y + 5}Z`,
  });
  const instance = shape("button", "frame", {
    x: x + 70,
    y: y + 5,
    componentId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    componentFile: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    shapeRef: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    touched: [
      "layout-padding",
    ],
  });
  const frame: BackendShape = {
    id: root,
    name: "Screen",
    type: "frame",
    parentId: "00000000-0000-0000-0000-000000000000",
    frameId: "00000000-0000-0000-0000-000000000000",
    x,
    y,
    width: 200,
    height: 100,
    fills: null,
    shapes: [
      rectangle.id,
      text.id,
      path.id,
      instance.id,
    ],
  };
  return Object.fromEntries(
    [
      frame,
      rectangle,
      text,
      path,
      instance,
    ].map((item) => [
      item.id,
      item,
    ]),
  );
}

function pair(mutate?: (target: BackendObjects, rootId: string) => void) {
  const source = board("s", 9000, 2884);
  const target = board("t", 994, 1000);
  const targetRoot = "t-board".padEnd(36, "0").replace(/[^0-9a-f-]/g, "a");
  mutate?.(target, targetRoot);
  return compareBackendSubtrees(
    source,
    "s-board".padEnd(36, "0").replace(/[^0-9a-f-]/g, "a"),
    target,
    targetRoot,
  );
}

const byName = (objects: BackendObjects, name: string): BackendShape =>
  Object.values(objects).find((shape) => shape.name === name)!;

describe("comparing a copy with its original through backend data", () => {
  it("accepts a copy that only moved, with float noise and empty-versus-null differences", () => {
    const comparison = pair((target) => {
      byName(target, "rectangle").width = 50.0000000000002;
      byName(target, "Screen").fills = [];
    });
    expect(comparison.problems).toEqual([]);
    expect(comparison.nodes).toBe(5);
    expect(Object.keys(comparison.nodeMap)).toHaveLength(5);
  });

  it("ignores Penpair's own plugin-data marker on the copy", () => {
    expect(
      pair((target) => {
        byName(target, "Screen").pluginData = {
          penpair: {
            "native-copy": "run",
          },
        };
      }).problems,
    ).toEqual([]);
  });

  it.each([
    [
      "a changed fill colour",
      (target: BackendObjects) => {
        (
          byName(target, "rectangle").fills as {
            fillColor: string;
          }[]
        )[0]!.fillColor = "#00ff00";
      },
    ],
    [
      "changed text",
      (target: BackendObjects) => {
        const content = byName(target, "label").content as {
          children: {
            text: string;
          }[];
        };
        content.children[0]!.text = "Hellp";
      },
    ],
    [
      "a changed size",
      (target: BackendObjects) => {
        byName(target, "rectangle").width = 51;
      },
    ],
    [
      "a shifted child that moved relative to the board",
      (target: BackendObjects) => {
        byName(target, "rectangle").x = (byName(target, "rectangle").x as number) + 5;
      },
    ],
    [
      "a changed path number",
      (target: BackendObjects) => {
        const path = byName(target, "icon");
        const original = path.content as string;
        path.content = original.replace("1005.5", "1015.5");
        expect(path.content).not.toBe(original);
      },
    ],
    [
      "a different component reference",
      (target: BackendObjects) => {
        byName(target, "button").shapeRef = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
      },
    ],
    [
      "lost override bookkeeping",
      (target: BackendObjects) => {
        byName(target, "button").touched = [];
      },
    ],
    [
      "a renamed layer",
      (target: BackendObjects) => {
        byName(target, "rectangle").name = "Rectangle";
      },
    ],
  ])("reports %s", (_label, mutate) => {
    expect(pair(mutate).problems.length).toBeGreaterThan(0);
  });

  it("reports a copy with a different number of shapes", () => {
    const comparison = pair((target) => {
      const removed = byName(target, "icon");
      delete target[removed.id];
      const root = byName(target, "Screen");
      root.shapes = (root.shapes as string[]).filter((id) => id !== removed.id);
    });
    expect(comparison.problems[0]).toContain("4 shapes where the original has 5");
  });

  it("pairs a board with its copy by topology, not by ids or position", () => {
    const source = board("s", 9000, 2884);
    const target = board("t", 994, 1000);
    const sourceRoot = "s-board".padEnd(36, "0").replace(/[^0-9a-f-]/g, "a");
    const targetRoot = "t-board".padEnd(36, "0").replace(/[^0-9a-f-]/g, "a");
    expect(subtreeSignature(source, sourceRoot)).toBe(subtreeSignature(target, targetRoot));
    byName(target, "icon").type = "rect";
    expect(subtreeSignature(source, sourceRoot)).not.toBe(subtreeSignature(target, targetRoot));
  });
});
