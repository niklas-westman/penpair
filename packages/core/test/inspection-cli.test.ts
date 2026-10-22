import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runCli } from "../src/cli-main.js";
import * as clientModule from "../src/client.js";
import * as endpointModule from "../src/endpoint.js";
import type { PenpotToolClient } from "../src/client.js";
import { endpointRedactor } from "../src/endpoint.js";

afterEach(() => vi.restoreAllMocks());
const key = "PRIVATE-MCP-INSPECTION-CREDENTIAL";
const endpoint = {
  url: `https://example.test/mcp?userToken=${key}`,
  description: {
    source: "env" as const,
    origin: "https://example.test",
    pathname: "/mcp",
  },
};
async function project(text = "Full text 🌿") {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-inspection-cli-"));
  await writeFile(
    path.join(root, "penpair.config.json"),
    JSON.stringify({
      instance: "fixture",
      profile: {
        type: "external",
        origin: "https://example.test",
      },
      adapters: [
        "./adapter.mjs",
      ],
    }),
  );
  await writeFile(
    path.join(root, "adapter.mjs"),
    `import {writeFile} from 'node:fs/promises'; await writeFile(${JSON.stringify(path.join(root, "executed"))},'bad'); throw new Error('must not load');`,
  );
  const shape = {
    id: "shape",
    type: "text",
    name: "Text",
    characters: text,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    hidden: false,
    blocked: false,
    children: [],
    tokens: {},
  };
  const page = {
    id: "page",
    name: "P",
    root: {
      children: [
        shape,
      ],
    },
    getShapeById: () => shape,
  };
  const penpot = {
    currentFile: {
      id: "file",
      revn: 1,
      pages: [
        page,
      ],
    },
    currentPage: page,
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
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
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(clientModule, "connect").mockResolvedValue(client);
  vi.spyOn(endpointModule, "resolveEndpoint").mockResolvedValue(endpoint);
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return {
    root,
    output,
  };
}
it("exports a complete canonical document without loading configured project modules", async () => {
  const f = await project();
  expect(
    await runCli([
      "inspect",
      "shape",
      "--page",
      "P",
      "--all",
      "--fields",
      "geometry,text,tokens",
      "--out",
      "design/frame.json",
      "--json",
    ]),
  ).toBe(0);
  const result = JSON.parse(String(f.output.mock.calls[0]![0]));
  expect(result).toMatchObject({
    outcome: "success",
    target: {
      fileId: "file",
      pageId: "page",
    },
    data: {
      kind: "shape-inspection",
      complete: true,
      nodes: [
        {
          text: {
            characters: "Full text 🌿",
          },
        },
      ],
    },
  });
  expect(JSON.parse(await readFile(path.join(f.root, "design/frame.json"), "utf8"))).toMatchObject({
    complete: true,
    sha256: expect.any(String),
  });
  await expect(readFile(path.join(f.root, "executed"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("marks redacted evidence incomplete and preserves an existing output file", async () => {
  const f = await project(`Do not print ${key}`);
  await writeFile(path.join(f.root, "frame.json"), "old approved evidence");
  expect(
    await runCli([
      "inspect",
      "shape",
      "--page",
      "P",
      "--all",
      "--out",
      "frame.json",
      "--json",
    ]),
  ).toBe(3);
  const text = String(f.output.mock.calls[0]![0]);
  expect(text).not.toContain(key);
  expect(JSON.parse(text)).toMatchObject({
    outcome: "incomplete",
    redacted: true,
    completeness: {
      complete: false,
    },
    data: {
      complete: false,
    },
  });
  expect(await readFile(path.join(f.root, "frame.json"), "utf8")).toBe("old approved evidence");
});
it("redacts known key fragments at inspection chunk boundaries without treating ordinary IDs as fragments", () => {
  const redact = endpointRedactor(endpoint, true);
  const first = key.slice(0, 16);
  const second = key.slice(16);
  expect(redact(`data before ${first}`)).not.toContain(first);
  expect(redact(`${second} data after`)).not.toContain(second);
  expect(endpointRedactor(endpoint)(first)).toBe(first);
});
it("keeps human-format capture output valid JSON while redacting credentials", async () => {
  const f = await project(`Do not print ${key}`);
  expect(
    await runCli([
      "inspect",
      "shape",
      "--page",
      "P",
      "--all",
    ]),
  ).toBe(3);
  const text = String(f.output.mock.calls[0]![0]);
  expect(text).not.toContain(key);
  expect(JSON.parse(text)).toMatchObject({
    complete: false,
    redacted: true,
  });
});
