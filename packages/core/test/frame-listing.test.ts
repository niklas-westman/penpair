import { describe, expect, it } from "vitest";
import { frames, type FramesParams } from "../src/snippets/read.js";
import { compiles } from "../src/snippet.js";
import { projectConfigSchema } from "../src/instance/config-schema.js";

interface Shape {
  id: string;
  name?: string;
  type: string;
  width?: number;
  height?: number;
  children?: Shape[];
}

async function list(
  children: Shape[],
  recursive = true,
  selection: Partial<FramesParams> = {},
  lookup?: (id: string) => Shape | null,
) {
  const generated = frames({
    page: "Release",
    recursive,
    ...selection,
  });
  expect(compiles(generated.code)).toBeUndefined();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const page = {
    id: "page",
    name: "Release",
    getShapeById: lookup,
    root: {
      children,
    },
  };
  return new AsyncFunction("penpot", generated.code)({
    currentPage: page,
    currentFile: {
      id: "file",
      name: "File",
      revn: 1,
      pages: [
        page,
      ],
    },
  });
}

const board = (id: string, children: Shape[] = []): Shape => ({
  id,
  name: id,
  type: "board",
  width: 100.4,
  height: 200.6,
  children,
});

describe("bounded page frame listing", () => {
  it("looks up only explicit IDs and never traverses unrelated descendants", async () => {
    const unrelated = board("section");
    Object.defineProperty(unrelated, "children", {
      get() {
        throw new Error("must not traverse unrelated section");
      },
    });
    const lookups: string[] = [];
    const result = await list(
      [
        unrelated,
      ],
      true,
      {
        frameIds: [
          "FRAME-A",
          "missing",
          "text",
        ],
      },
      (id) => {
        lookups.push(id);
        return id === "frame-a"
          ? board(id)
          : id === "text"
            ? {
                id,
                type: "text",
              }
            : null;
      },
    );
    expect(lookups).toEqual([
      "frame-a",
      "missing",
      "text",
    ]);
    expect(result).toMatchObject({
      ok: true,
      complete: true,
      truncated: false,
      frames: [
        {
          id: "frame-a",
        },
      ],
    });
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]).not.toHaveProperty("topLevel");
  });

  it("merges top-level names for mixed selection without duplicating an ID or walking its children", async () => {
    const root = board("frame-a");
    Object.defineProperty(root, "children", {
      get() {
        throw new Error("must not traverse selected board");
      },
    });
    const result = await list(
      [
        root,
        board("named"),
      ],
      true,
      {
        frameIds: [
          "frame-a",
        ],
        includeTopLevel: true,
      },
      () => root,
    );
    expect(result.frames.map((frame: { id: string }) => frame.id)).toEqual([
      "frame-a",
      "named",
    ]);
    expect(result.frames[0].topLevel).toBe(true);
  });

  it("rejects unsupported or inconsistent ID lookup without scanning the page", async () => {
    expect(
      await list([], true, {
        frameIds: [
          "frame-a",
        ],
      }),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("lookup is unavailable"),
    });
    expect(
      await list(
        [],
        true,
        {
          frameIds: [
            "frame-a",
          ],
        },
        () => board("different"),
      ),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("different shape"),
    });
    for (const ids of [
      [],
      [
        "",
      ],
      [
        "a",
        "A",
      ],
      [
        "a".repeat(65),
      ],
      Array.from(
        {
          length: 1001,
        },
        (_, index) => String(index),
      ),
    ]) {
      expect(() =>
        frames({
          page: "Release",
          frameIds: ids,
        }),
      ).toThrow("Frame ID selection");
    }
  });

  it("tracks parent boards and top-level identity through groups at any depth", async () => {
    const result = await list([
      board("section", [
        {
          id: "group",
          type: "group",
          children: [
            board("nested"),
          ],
        },
      ]),
      {
        id: "root-group",
        type: "group",
        children: [
          board("grouped-board"),
        ],
      },
    ]);
    expect(result).toMatchObject({
      complete: true,
      truncated: false,
      visited: 5,
    });
    expect(result.frames).toEqual([
      {
        id: "section",
        name: "section",
        width: 100,
        height: 201,
        parentBoardId: null,
        topLevel: true,
      },
      {
        id: "nested",
        name: "nested",
        width: 100,
        height: 201,
        parentBoardId: "section",
        topLevel: false,
      },
      {
        id: "grouped-board",
        name: "grouped-board",
        width: 100,
        height: 201,
        parentBoardId: null,
        topLevel: false,
      },
    ]);
    const topLevel = await list(
      [
        board("section", [
          board("nested"),
        ]),
      ],
      false,
    );
    expect(topLevel.frames.map((frame: { id: string }) => frame.id)).toEqual([
      "section",
    ]);
  });

  it("bounds both wide and deep trees and reports truncation", async () => {
    const wide = await list(
      Array.from(
        {
          length: 10001,
        },
        (_, index) => board(`b-${index}`),
      ),
    );
    expect(wide).toMatchObject({
      visited: 10000,
      truncated: true,
      complete: false,
    });
    let deep = board("leaf");
    for (let index = 0; index < 10000; index++) {
      deep = board(`b-${index}`, [
        deep,
      ]);
    }
    const result = await list([
      deep,
    ]);
    expect(result).toMatchObject({
      visited: 10000,
      truncated: true,
      complete: false,
    });
    const exact = await list(
      Array.from(
        {
          length: 10000,
        },
        (_, index) => board(`b-${index}`),
      ),
    );
    expect(exact).toMatchObject({
      visited: 10000,
      truncated: false,
      complete: true,
    });
  });

  it("preserves the complete legacy top-level listing beyond the recursive budget", async () => {
    const roots: Shape[] = Array.from(
      {
        length: 10000,
      },
      (_, index) => ({
        id: `text-${index}`,
        type: "text",
      }),
    );
    roots.push(
      board("last-board", [
        board("nested"),
      ]),
    );
    const result = await list(roots, false);
    expect(result.frames.map((frame: { id: string }) => frame.id)).toEqual([
      "last-board",
    ]);
    expect(result.truncated).toBeUndefined();
  });

  it("prints required-one selectors and UUID validation in the config schema", () => {
    const entry = projectConfigSchema.properties.baselines.properties.frames.items;
    expect(entry.required).toEqual([
      "id",
    ]);
    expect(entry.anyOf).toEqual([
      {
        required: [
          "frame",
        ],
      },
      {
        required: [
          "frameId",
        ],
      },
    ]);
    const pattern = new RegExp(entry.properties.frameId.pattern);
    expect(pattern.test("10216397-acdf-805e-8008-d69b71f841d4")).toBe(true);
    expect(pattern.test("not-a-uuid")).toBe(false);
  });
});
