import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureBackendSources,
  changedSources,
  matchBackendFrames,
  readBackendPageWhen,
  rootBoardIds,
  verifyBackendPairs,
} from "../src/design-releases/backend-evidence.js";
import type { BackendObjects } from "../src/design-releases/backend-compare.js";
import type { BackendPage, PenpotBackendClient } from "../src/penpot-backend.js";

const pageRoot = "00000000-0000-0000-0000-000000000000";
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function uuid(label: string): string {
  const hex = Buffer.from(label).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Top-level boards, each with one rectangle child, at the given positions. */
function page(
  boards: {
    key: string;
    name: string;
    x: number;
    y: number;
  }[],
): BackendObjects {
  const objects: BackendObjects = {
    [pageRoot]: {
      id: pageRoot,
      type: "frame",
      name: "Root Frame",
      shapes: boards.map((board) => uuid(board.key)),
    },
  };
  for (const board of boards) {
    const id = uuid(board.key);
    const child = uuid(`${board.key}-child`);
    objects[id] = {
      id,
      type: "frame",
      name: board.name,
      parentId: pageRoot,
      frameId: pageRoot,
      x: board.x,
      y: board.y,
      shapes: [
        child,
      ],
    };
    objects[child] = {
      id: child,
      type: "rect",
      name: "Child",
      parentId: id,
      frameId: id,
      x: board.x + 4,
      y: board.y + 4,
      fills: [
        {
          fillColor: "#ffffff",
        },
      ],
    };
  }
  return objects;
}

function clientOf(...answers: BackendObjects[]): PenpotBackendClient & {
  calls: number;
} {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async getPage(_fileId, pageId): Promise<BackendPage> {
      const objects = answers[Math.min(calls++, answers.length - 1)]!;
      return {
        id: pageId,
        name: "page",
        objects,
      };
    },
  };
}

describe("waiting for the backend to show a change", () => {
  it("polls until the page has what it expects", async () => {
    const before = page([
      {
        key: "a",
        name: "A",
        x: 0,
        y: 0,
      },
    ]);
    const after = page([
      {
        key: "a",
        name: "A",
        x: 0,
        y: 0,
      },
      {
        key: "b",
        name: "B",
        x: 0,
        y: 500,
      },
    ]);
    const client = clientOf(before, before, after);
    const read = await readBackendPageWhen(
      client,
      "file",
      "page",
      (objects) => rootBoardIds(objects).length === 2,
      {
        sleep: async () => undefined,
      },
    );
    expect(read.polls).toBe(3);
    expect(rootBoardIds(read.objects)).toHaveLength(2);
  });

  it("says what happened when the backend never catches up", async () => {
    const client = clientOf(
      page([
        {
          key: "a",
          name: "A",
          x: 0,
          y: 0,
        },
      ]),
    );
    await expect(
      readBackendPageWhen(client, "file", "page", () => false, {
        timeoutMs: 0,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("did not show the expected shapes");
  });
});

describe("recording and matching boards from backend data", () => {
  const sourceBoards = [
    {
      key: "s1",
      name: "Screen one",
      x: 100,
      y: 0,
    },
    {
      key: "s2",
      name: "Screen two",
      x: 900,
      y: 0,
    },
  ];

  it("records a source board with a saved subtree, and notices when it changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-backend-evidence-"));
    directories.push(root);
    const objects = page(sourceBoards);
    const evidence = await captureBackendSources(
      clientOf(objects),
      root,
      "file",
      "page",
      [
        uuid("s1"),
        uuid("s2"),
      ],
      ".penpair/native-copy/run/source",
    );
    expect(evidence.map((item) => item.nodes)).toEqual([
      2,
      2,
    ]);
    const saved = JSON.parse(await readFile(path.join(root, evidence[0]!.subtree.path), "utf8"));
    expect(Object.keys(saved.objects)).toHaveLength(2);
    expect(changedSources(evidence, objects)).toEqual([]);
    const edited = page(sourceBoards);
    edited[uuid("s2-child")]!.fills = [
      {
        fillColor: "#000000",
      },
    ];
    expect(changedSources(evidence, edited)).toEqual([
      uuid("s2"),
    ]);
  });

  it("refuses a source that is not a top-level board", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-backend-evidence-"));
    directories.push(root);
    await expect(
      captureBackendSources(
        clientOf(page(sourceBoards)),
        root,
        "file",
        "page",
        [
          uuid("s1-child"),
        ],
        "run",
      ),
    ).rejects.toThrow("not a top-level board");
  });

  it("pairs copies with their originals by name and topology, whatever the order", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-backend-evidence-"));
    directories.push(root);
    const sources = await captureBackendSources(
      clientOf(page(sourceBoards)),
      root,
      "file",
      "page",
      [
        uuid("s1"),
        uuid("s2"),
      ],
      "run",
    );
    const targets = page([
      {
        key: "t2",
        name: "Screen two",
        x: 0,
        y: 1000,
      },
      {
        key: "t1",
        name: "Screen one",
        x: 1000,
        y: 1000,
      },
    ]);
    expect(
      matchBackendFrames(sources, targets, [
        uuid("t2"),
        uuid("t1"),
      ]),
    ).toEqual([
      {
        sourceFrameId: uuid("s1"),
        targetFrameId: uuid("t1"),
      },
      {
        sourceFrameId: uuid("s2"),
        targetFrameId: uuid("t2"),
      },
    ]);
    expect(() =>
      matchBackendFrames(
        sources,
        page([
          {
            key: "t1",
            name: "Screen one",
            x: 0,
            y: 0,
          },
          {
            key: "t2",
            name: "Renamed",
            x: 0,
            y: 0,
          },
        ]),
        [
          uuid("t1"),
          uuid("t2"),
        ],
      ),
    ).toThrow("missing, changed or ambiguous");
  });

  it("verifies each pair on stored data and names the pair that differs", () => {
    const source = page(sourceBoards);
    const target = page([
      {
        key: "t1",
        name: "Screen one",
        x: 100,
        y: 1000,
      },
      {
        key: "t2",
        name: "Screen two",
        x: 900,
        y: 1000,
      },
    ]);
    const pairs = [
      {
        sourceFrameId: uuid("s1"),
        targetFrameId: uuid("t1"),
      },
      {
        sourceFrameId: uuid("s2"),
        targetFrameId: uuid("t2"),
      },
    ];
    expect(verifyBackendPairs(source, target, pairs)).toMatchObject({
      nativeVerified: true,
      problems: [],
      nodes: 4,
    });
    target[uuid("t2-child")]!.fills = [
      {
        fillColor: "#123456",
      },
    ];
    const verdict = verifyBackendPairs(source, target, pairs);
    expect(verdict.nativeVerified).toBe(false);
    expect(verdict.problems[0]).toContain(uuid("s2"));
  });
});
