import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { exportFrames, parseFrames } from "../src/export-batch.js";

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
function editor(
  names = [
    "Desktop",
    "Tablet",
    "Phone",
  ],
) {
  let exports = 0;
  const shapes = names.map((name, index) => ({
    id: `s${index}`,
    name,
    type: "board",
    x: 0,
    y: 0,
    width: 10,
    height: 20,
    fills: [
      {
        fillColor: "#ffffff",
      },
    ],
    children: [
      {
        id: `s${index}-text`,
        type: "text",
        name: "Label",
        characters: "Hello",
        x: 1,
        y: 1,
        width: 5,
        height: 5,
        children: [],
      },
    ],
    export: async () => {
      exports++;
      return png(`${name}:${shapes[index]!.children[0]!.characters}`);
    },
  }));
  const tokens = {
    sets: [
      {
        name: "Base",
        active: true,
        tokens: [
          {
            name: "ink",
            type: "color",
            value: "#000000",
          },
        ],
      },
    ],
    themes: [],
  };
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
        tokens,
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
  return {
    client,
    shapes,
    tokens,
    exports: () => exports,
  };
}
const run = (root: string, client: PenpotToolClient, frames: string, cache = false) =>
  exportFrames(
    client,
    root,
    {
      page: "P",
      frames: parseFrames(frames),
      out: "design/exports",
    },
    {
      ...fast,
      cache,
    },
  );

describe("frame list", () => {
  it("takes IDs with optional file names and refuses unsafe or repeated ones", () => {
    expect(parseFrames("a, b=login-desktop")).toEqual([
      {
        id: "a",
        name: "a",
      },
      {
        id: "b",
        name: "login-desktop",
      },
    ]);
    for (const bad of [
      "a=../x",
      "a=b=c",
      "a,a",
      "a=x,b=x",
      "a=.hidden",
      "",
    ]) {
      expect(() => parseFrames(bad)).toThrow();
    }
  });
});

describe("batch export", () => {
  it("exports every frame into the folder and summarises", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-batch-"));
    const e = editor();
    const report = await run(root, e.client, "s0=desktop,s1=tablet,s2=phone");
    expect(report).toMatchObject({
      complete: true,
      summary: {
        exported: 3,
        cached: 0,
        failed: 0,
      },
    });
    expect((await readFile(path.join(root, "design/exports/desktop.png"))).length).toBeGreaterThan(
      24,
    );
    expect(report.frames.map((frame) => frame.file)).toEqual([
      "design/exports/desktop.png",
      "design/exports/tablet.png",
      "design/exports/phone.png",
    ]);
  });

  it("records a failed frame and goes on with the rest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-batch-"));
    const e = editor();
    const report = await run(root, e.client, "s0,missing,s2");
    expect(report.complete).toBe(false);
    expect(report.frames.map((frame) => frame.outcome)).toEqual([
      "exported",
      "failed",
      "exported",
    ]);
    expect(report.frames[1]!.message).toMatch(/no shape missing/);
  });

  it("with the cache, skips frames that have not changed and exports the changed one", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-batch-"));
    const e = editor();
    await run(root, e.client, "s0,s1,s2", true);
    const first = e.exports();
    const again = await run(root, e.client, "s0,s1,s2", true);
    expect(again.summary).toEqual({
      exported: 0,
      cached: 3,
      failed: 0,
    });
    expect(e.exports()).toBe(first);
    e.shapes[1]!.children[0]!.characters = "Changed";
    const third = await run(root, e.client, "s0,s1,s2", true);
    expect(third.frames.map((frame) => frame.outcome)).toEqual([
      "cached",
      "exported",
      "cached",
    ]);
  });

  it("exports again when the output file was removed or edited, or a token value changed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-batch-"));
    const e = editor();
    await run(root, e.client, "s0,s1", true);
    await rm(path.join(root, "design/exports/s0.png"));
    await writeFile(path.join(root, "design/exports/s1.png"), "edited by hand");
    const afterEdit = await run(root, e.client, "s0,s1", true);
    expect(afterEdit.summary).toMatchObject({
      exported: 2,
      cached: 0,
    });
    e.tokens.sets[0]!.tokens[0]!.value = "#ff0000";
    expect((await run(root, e.client, "s0,s1", true)).summary).toMatchObject({
      exported: 2,
      cached: 0,
    });
  });

  it("without --cache always exports, and never trusts a cache another run left", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-batch-"));
    const e = editor();
    await run(root, e.client, "s0", true);
    expect((await run(root, e.client, "s0", false)).summary).toMatchObject({
      exported: 1,
      cached: 0,
    });
  });
});
