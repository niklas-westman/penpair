import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { BaselineFrame } from "../src/baselines-config.js";
import { runCli } from "../src/cli-main.js";
import * as clientModule from "../src/client.js";
import * as endpointModule from "../src/endpoint.js";
import * as exportModule from "../src/export.js";
import * as shotsModule from "../src/shots.js";

const frameId = "abcdef01-2345-6789-abcd-0123456789ab";
const otherFrameId = "abcdef01-2345-6789-abcd-0123456789ac";
const projectRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    projectRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

async function approvalProject(selector: Pick<BaselineFrame, "frame" | "frameId">) {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-approve-case-"));
  projectRoots.push(root);
  await writeFile(
    path.join(root, "penpair.config.json"),
    JSON.stringify({
      instance: "fixture",
      profile: {
        type: "external",
        origin: "https://example.test",
      },
      baselines: {
        page: "Page",
        root: "design/baselines",
        frames: [
          {
            ...selector,
            id: "desktop",
            route: "/",
            case: {
              viewport: {
                width: 1,
                height: 1,
              },
              theme: "light",
              state: "default",
              fixture: "default",
            },
          },
        ],
      },
    }),
  );

  const client = {
    callTool: vi.fn().mockRejectedValue(new Error("Unexpected Penpot lookup")),
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(clientModule, "connect").mockResolvedValue(client);
  vi.spyOn(endpointModule, "resolveEndpoint").mockResolvedValue({
    url: "https://example.test/mcp?userToken=PRIVATE-APPROVAL-FIXTURE-KEY",
    description: {
      source: "env",
      origin: "https://example.test",
      pathname: "/mcp",
    },
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const lookup = vi.spyOn(shotsModule, "findShapesByName").mockResolvedValue({
    fileId: "file",
    pageId: "page",
    revision: 1,
    matches: [
      {
        id: frameId,
        name: "Desktop",
        type: "board",
      },
    ],
  });
  const capture = vi.spyOn(exportModule, "exportShapePng").mockResolvedValue({
    capture: {
      fileId: "file",
      pageId: "page",
      frameId,
      revision: 1,
      scale: 1,
      activeThemes: [],
      penpotApiVersion: "fixture",
      renderEnvironment: "fixture",
    },
    png: Buffer.from("stable approval preview bytes"),
    stable: true,
    exports: 2,
  });

  return {
    client,
    lookup,
    capture,
  };
}

function approve(selectedFrameId: string): Promise<number> {
  return runCli([
    "approve",
    "--page",
    "Page",
    "--frame",
    selectedFrameId,
    "--case",
    "desktop",
    "--json",
  ]);
}

it("approves a configured frame ID directly without a name lookup", async () => {
  const project = await approvalProject({
    frameId,
    frame: "Expected name",
  });

  expect(await approve(frameId.toUpperCase())).toBe(0);
  expect(project.lookup).not.toHaveBeenCalled();
  expect(project.client.callTool).not.toHaveBeenCalled();
  expect(project.capture).toHaveBeenCalledWith(
    project.client,
    frameId.toUpperCase(),
    expect.objectContaining({
      page: "Page",
      stable: true,
    }),
  );
});

it("refuses a different configured frame ID before lookup or export", async () => {
  const project = await approvalProject({
    frameId,
  });

  expect(await approve(otherFrameId)).toBe(1);
  expect(project.lookup).not.toHaveBeenCalled();
  expect(project.capture).not.toHaveBeenCalled();
  expect(project.client.callTool).not.toHaveBeenCalled();
});

it("keeps exact name lookup for name-only approval cases", async () => {
  const project = await approvalProject({
    frame: "Desktop",
  });

  expect(await approve(frameId)).toBe(0);
  expect(project.lookup).toHaveBeenCalledWith(project.client, "Desktop", "Page");
  expect(project.capture).toHaveBeenCalledOnce();
});

it("refuses a name-only case when its resolved frame differs", async () => {
  const project = await approvalProject({
    frame: "Desktop",
  });

  expect(await approve(otherFrameId)).toBe(1);
  expect(project.lookup).toHaveBeenCalledWith(project.client, "Desktop", "Page");
  expect(project.capture).not.toHaveBeenCalled();
});
