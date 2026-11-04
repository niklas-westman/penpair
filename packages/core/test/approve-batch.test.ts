import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { approveFrames, parseApproveFrames } from "../src/approve-batch.js";
import type { PenpotToolClient } from "../src/client.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const fast = {
  sleep: async () => undefined,
  settleMs: 0,
  attempts: 1,
  layout: false as const,
};

function png(tag: string): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
  ]).copy(bytes);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(10, 16);
  bytes.writeUInt32BE(20, 20);
  return Buffer.concat([
    bytes,
    Buffer.from(tag),
  ]);
}

function editor(ids: string[]) {
  const shapes = ids.map((id) => ({
    id,
    type: "board",
    name: id,
    x: 0,
    y: 0,
    width: 10,
    height: 20,
    children: [],
    export: async () => png(id),
  }));
  const page = {
    id: "page",
    name: "P",
    root: {
      children: shapes,
    },
    getShapeById: (id: string) => shapes.find((shape) => shape.id === id),
  };
  const penpot = {
    version: "fixture",
    currentFile: {
      id: "file",
      revn: 1,
      pages: [
        page,
      ],
    },
    currentPage: page,
    library: {
      local: {
        tokens: {
          themes: [],
          sets: [],
        },
      },
    },
  };
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      return {
        text: JSON.stringify({
          result: await new AsyncFunction("penpot", String(args.code))(penpot),
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  return client;
}

const run = async (
  frames: string[],
  existing: string[],
  write?: {
    note: string;
    by: string;
  },
) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-approve-batch-"));
  const report = await approveFrames(editor(existing), root, undefined, fast, {
    page: "P",
    entries: frames.map((frame) => ({
      frame,
    })),
    format: "png",
    write,
  });
  return {
    root,
    report,
  };
};

describe("approving many frames", () => {
  it("previews every frame and records nothing without owner words", async () => {
    const { root, report } = await run(
      [
        "a",
        "b",
      ],
      [
        "a",
        "b",
      ],
    );
    expect(report).toMatchObject({
      complete: true,
      recorded: false,
    });
    expect(report.candidates.map((candidate) => candidate.frame)).toEqual([
      "a",
      "b",
    ]);
    expect(report.candidates.every((candidate) => !candidate.recorded)).toBe(true);
    await expect(stat(path.join(root, "design/approvals.json"))).rejects.toThrow();
  });

  it("records every frame with the same owner words", async () => {
    const { root, report } = await run(
      [
        "a",
        "b",
      ],
      [
        "a",
        "b",
      ],
      {
        note: "Looks right to me",
        by: "Niklas",
      },
    );
    expect(report.recorded).toBe(true);
    const file = JSON.parse(await readFile(path.join(root, "design/approvals.json"), "utf8"));
    expect(file.records).toHaveLength(2);
    expect(file.records.map((record: { note: string }) => record.note)).toEqual([
      "Looks right to me",
      "Looks right to me",
    ]);
  });

  it("writes nothing when one frame cannot be rendered", async () => {
    const { root, report } = await run(
      [
        "a",
        "missing",
      ],
      [
        "a",
      ],
      {
        note: "ok",
        by: "Niklas",
      },
    );
    expect(report.complete).toBe(false);
    expect(report.recorded).toBe(false);
    expect(report.failed).toEqual([
      expect.objectContaining({
        frame: "missing",
      }),
    ]);
    await expect(stat(path.join(root, "design/approvals.json"))).rejects.toThrow();
  });
});

describe("the frame list", () => {
  it("takes ids or objects with a case, and refuses repeats and nonsense", () => {
    expect(
      parseApproveFrames([
        "a",
        {
          frame: "b",
          case: "login",
        },
      ]),
    ).toEqual([
      {
        frame: "a",
      },
      {
        frame: "b",
        caseId: "login",
      },
    ]);
    for (const bad of [
      [],
      {},
      [
        "a",
        "a",
      ],
      [
        1,
      ],
      [
        {
          frame: "",
        },
      ],
    ]) {
      expect(() => parseApproveFrames(bad)).toThrow();
    }
  });
});
