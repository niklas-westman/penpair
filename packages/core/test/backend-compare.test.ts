import { describe, expect, it } from "vitest";
import {
  compareBackendSubtrees,
  subtreeSignature,
  type BackendObjects,
} from "../src/design-releases/backend-compare.js";
import type { BackendShape } from "../src/penpot-backend.js";

/** A board with a rectangle, a text, a path and a component instance, placed at (x, y); ids carry a prefix. */
function board(prefix: string, x: number, y: number, layout = false): BackendObjects {
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
    ...(layout
      ? {
          layout: "flex",
        }
      : {}),
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

function pair(mutate?: (target: BackendObjects, rootId: string) => void, layout = false) {
  const source = board("s", 9000, 2884, layout);
  const target = board("t", 994, 1000, layout);
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

  describe("a size or position that an automatic layout explains", () => {
    const widen = (target: BackendObjects) => {
      byName(target, "rectangle").width = 80;
    };

    it("is not a problem under an auto-layout board, and is listed as layout-driven", () => {
      const result = pair(widen, true);
      expect(result.problems).toEqual([]);
      expect(result.layoutDriven).toEqual([
        byName(board("s", 9000, 2884, true), "rectangle").id,
      ]);
    });

    it("is a problem when no layout is above it", () => {
      const result = pair(widen, false);
      expect(result.problems.join(" ")).toContain("width differs");
      expect(result.layoutDriven).toEqual([]);
      expect(result.differingAttributes).toEqual([
        "width",
      ]);
    });

    it("never hides another difference on the same shape", () => {
      const result = pair((target) => {
        widen(target);
        (
          byName(target, "rectangle").fills as {
            fillColor: string;
          }[]
        )[0]!.fillColor = "#00ff00";
      }, true);
      expect(result.differingAttributes).toContain("fills");
      expect(result.problems.join(" ")).toContain("fills differs");
    });

    it("counts text that sizes itself to its content, even outside a layout", () => {
      const grow = (target: BackendObjects) => {
        byName(target, "label").width = 90;
      };
      const fixed = board("s", 9000, 2884);
      byName(fixed, "label").growType = "fixed";
      expect(pair(grow, false).problems.join(" ")).toContain("width differs");
      const auto = (objects: BackendObjects) => {
        byName(objects, "label").growType = "auto-width";
      };
      const source = board("s", 9000, 2884);
      auto(source);
      const target = board("t", 994, 1000);
      auto(target);
      grow(target);
      const rootOf = (prefix: string) =>
        `${prefix}-board`.padEnd(36, "0").replace(/[^0-9a-f-]/g, "a");
      const result = compareBackendSubtrees(source, rootOf("s"), target, rootOf("t"));
      expect(result.problems).toEqual([]);
      expect(result.layoutDriven).toHaveLength(1);
    });

    it("counts a path that moved with its shape, but not a drawing that changed on its own", () => {
      const move = (target: BackendObjects) => {
        const path = byName(target, "icon");
        path.content = (path.content as string).replace("995", "996");
        (
          path as unknown as {
            selrect: {
              x: number;
            };
          }
        ).selrect = {
          x: 1,
        };
      };
      expect(pair(move, true).problems).toEqual([]);
      const redraw = (target: BackendObjects) => {
        const path = byName(target, "icon");
        path.content = (path.content as string).replace("995", "996");
      };
      const redrawn = pair(redraw, true);
      expect(redrawn.differingAttributes).toContain("content");
      expect(redrawn.problems.join(" ")).toContain("path content differs");
    });

    it("does not excuse a different name, type or arrangement", () => {
      expect(
        pair((target) => {
          byName(target, "rectangle").name = "Renamed";
        }, true).problems.length,
      ).toBeGreaterThan(0);
    });
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
