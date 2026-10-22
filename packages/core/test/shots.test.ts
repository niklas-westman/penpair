import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureShots, exportShapeByName, findShapesByName } from "../src/shots.js";
import { runCli } from "../src/cli-main.js";
import * as clientModule from "../src/client.js";
import * as endpointModule from "../src/endpoint.js";
import { writeFile } from "node:fs/promises";
import { parseCommandArgs } from "../src/cli-arguments.js";
import type { PenpotToolClient } from "../src/client.js";

afterEach(() => vi.restoreAllMocks());
const fast = {
  sleep: async () => undefined,
  settleMs: 0,
  attempts: 1,
};
const folder = () => mkdtemp(path.join(os.tmpdir(), "penpair-shots-"));
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
  ],
) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let exports = 0;
  const shapes = names.map((name, index) => ({
    id: `shape-${index}`,
    name,
    type: "board",
    x: 0,
    y: 0,
    width: 10,
    height: 20,
    children: [],
    export: async () => {
      exports++;
      return png(name);
    },
  }));
  const page = {
    id: "page",
    name: "Page",
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
    penpot,
    shapes,
    exports: () => exports,
  };
}

describe("exact export selectors", () => {
  it("finds a unique name and returns stable identity-bound bytes", async () => {
    const e = editor();
    const result = await exportShapeByName(e.client, "Desktop", "Page", fast);
    expect(result).toMatchObject({
      stable: true,
      capture: {
        fileId: "file",
        pageId: "page",
        frameId: "shape-0",
        revision: 1,
      },
    });
    expect(e.exports()).toBe(2);
  });
  it("refuses zero or multiple matches without exporting", async () => {
    const e = editor([
      "Same",
      "Same",
    ]);
    await expect(exportShapeByName(e.client, "Missing", "Page", fast)).rejects.toThrow(/matched 0/);
    await expect(exportShapeByName(e.client, "Same", "Page", fast)).rejects.toThrow(
      /matched 2.*shape-0/,
    );
    expect(e.exports()).toBe(0);
  });
  it("refuses ambiguous page names", async () => {
    const e = editor();
    e.penpot.currentFile.pages.push({
      ...e.penpot.currentPage,
      id: "other-page",
    });
    await expect(findShapesByName(e.client, "Desktop", "Page", fast)).rejects.toThrow(
      /page name is ambiguous/,
    );
  });
  it("refuses revision changes between lookup and export", async () => {
    const e = editor();
    const call = e.client.callTool.bind(e.client);
    let changed = false;
    e.client.callTool = async (name, args) => {
      if (!changed && String(args.code).includes("await s.export")) {
        changed = true;
        e.penpot.currentFile.revn++;
      }
      return call(name, args);
    };
    await expect(exportShapeByName(e.client, "Desktop", "Page", fast)).rejects.toThrow(
      /source changed after lookup/,
    );
  });
});

describe("ad-hoc shots", () => {
  it("publishes complete immutable captures with no baseline approvals", async () => {
    const root = await folder();
    const e = editor();
    const report = await captureShots(
      e.client,
      root,
      {
        page: "Page",
        prefix: "Desk",
      },
      fast,
    );
    expect(report).toMatchObject({
      complete: true,
      fileId: "file",
      pageId: "page",
      captures: [
        {
          name: "Desktop",
          width: 10,
          height: 20,
        },
      ],
    });
    const manifest = JSON.parse(
      await readFile(path.join(root, "design/shots/penpair-shots.json"), "utf8"),
    );
    expect(manifest.complete).toBe(true);
    expect(manifest.captures[0].approved).toBeUndefined();
    expect(await readFile(path.join(root, "design/shots", report.captures[0]!.file))).toEqual(
      png("Desktop"),
    );
    const again = await captureShots(
      e.client,
      root,
      {
        page: "Page",
        prefix: "Desk",
      },
      fast,
    );
    expect(again.captures[0]!.file).not.toBe(report.captures[0]!.file);
    expect(await readFile(path.join(root, "design/shots", report.captures[0]!.file))).toEqual(
      png("Desktop"),
    );
  });
  it("writes nothing for an empty selection or a failed export", async () => {
    const root = await folder();
    const e = editor();
    expect(
      await captureShots(
        e.client,
        root,
        {
          page: "Page",
          prefix: "Missing",
        },
        fast,
      ),
    ).toMatchObject({
      complete: false,
      wrote: [],
    });
    const call = e.client.callTool.bind(e.client);
    e.client.callTool = async (name, args) => {
      if (String(args.code).includes("await s.export")) {
        throw new Error("render failed");
      }
      return call(name, args);
    };
    await expect(
      captureShots(
        e.client,
        root,
        {
          page: "Page",
        },
        fast,
      ),
    ).rejects.toThrow(/render failed/);
    expect(await readdir(root)).toEqual([]);
  });
  it("preserves the prior complete manifest after an intervening edit", async () => {
    const root = await folder();
    const e = editor();
    await captureShots(
      e.client,
      root,
      {
        page: "Page",
      },
      fast,
    );
    const file = path.join(root, "design/shots/penpair-shots.json");
    const before = await readFile(file);
    const call = e.client.callTool.bind(e.client);
    let exports = 0;
    e.client.callTool = async (name, args) => {
      if (String(args.code).includes("await s.export") && ++exports === 3) {
        e.penpot.currentFile.revn++;
      }
      return call(name, args);
    };
    await expect(
      captureShots(
        e.client,
        root,
        {
          page: "Page",
        },
        fast,
      ),
    ).rejects.toThrow(/source changed/);
    expect(await readFile(file)).toEqual(before);
  });
});

it("suggests a nearby option without silently accepting it", () => {
  expect(() =>
    parseCommandArgs({
      args: [
        "--namePrefix",
        "Frame",
      ],
      options: {
        prefix: {
          type: "string",
        },
        page: {
          type: "string",
        },
      },
    }),
  ).toThrow(/Did you mean --prefix/);
});

it("CLI named export publishes the selected bytes and exposes their capture identity", async () => {
  const root = await folder();
  const e = editor();
  await writeFile(
    path.join(root, "penpair.config.json"),
    JSON.stringify({
      instance: "fixture",
      profile: {
        type: "external",
        origin: "https://example.test",
      },
    }),
  );
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(endpointModule, "resolveEndpoint").mockResolvedValue({
    url: "https://example.test/mcp?userToken=PRIVATE-MCP-ONLY-KEY",
    description: {
      source: "env",
      origin: "https://example.test",
      pathname: "/mcp",
    },
  });
  vi.spyOn(clientModule, "connect").mockResolvedValue(e.client);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const out = path.join(root, "named.png");
  expect(
    await runCli([
      "export",
      "--name",
      "Desktop",
      "--page",
      "Page",
      out,
      "--json",
    ]),
  ).toBe(0);
  expect(await readFile(out)).toEqual(png("Desktop"));
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({
    outcome: "success",
    target: {
      fileId: "file",
      pageId: "page",
    },
    data: {
      capture: {
        frameId: "shape-0",
      },
    },
  });
});
