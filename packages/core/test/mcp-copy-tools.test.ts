import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as cli from "../src/cli-main.js";
import { collectCommand } from "../src/command-result.js";
import { createMcpServer } from "../src/mcp-server.js";

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-mcp-copy-"));
  await writeFile(
    path.join(root, "penpair.config.json"),
    JSON.stringify({
      instance: "copy-tools",
      profile: {
        type: "external",
        origin: "https://design.penpot.app",
      },
      file: {
        id: "copy-tools",
      },
    }),
  );
  return root;
}

async function session(
  root: string,
  options: {
    allowWrites?: boolean;
    timeoutMs?: number;
  } = {},
) {
  const server = await createMcpServer({
    root,
    allowWrites: options.allowWrites ?? true,
    timeoutMs: options.timeoutMs,
  });
  const client = new Client({
    name: "test",
    version: "1",
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

const copyBase = {
  sourcePage: "Candidate",
  frameIds: [
    "frame-a",
  ],
  releaseVersion: "1.2.0",
};

afterEach(() => vi.restoreAllMocks());

describe("design_release_copy: how it is verified", () => {
  it("passes evidence and verifyPixels on to the command and nothing else", async () => {
    const dispatch = vi
      .spyOn(cli, "runCommand")
      .mockResolvedValue(await collectCommand("design-release", async () => 0));
    const s = await session(await project());
    try {
      await s.client.callTool({
        name: "design_release_copy",
        arguments: {
          ...copyBase,
          apply: true,
          debugPort: 9222,
          evidence: "backend",
          verifyPixels: "sample",
        },
      });
      expect(dispatch.mock.calls.at(-1)![0]).toEqual([
        "design-release",
        "copy",
        "--source-page",
        "Candidate",
        "--frame",
        "frame-a",
        "--release",
        "1.2.0",
        "--debug-port",
        "9222",
        "--apply",
        "--evidence",
        "backend",
        "--verify-pixels",
        "sample",
      ]);
    } finally {
      await s.close();
    }
  });

  it.each([
    {
      evidence: "anything",
    },
    {
      evidence: "BACKEND",
    },
    {
      evidence: "--apply",
    },
    {
      verifyPixels: "full",
    },
    {
      verifyPixels: "all --apply",
    },
    {
      verifyPixels: 1,
    },
  ])("refuses the value %j before anything is dispatched", async (extra) => {
    const dispatch = vi.spyOn(cli, "runCommand");
    const s = await session(await project());
    try {
      const response = await s.client.callTool({
        name: "design_release_copy",
        arguments: {
          ...copyBase,
          apply: true,
          debugPort: 9222,
          ...extra,
        },
      });
      expect(response.isError).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  it.each([
    {
      evidence: "backend",
    },
    {
      verifyPixels: "none",
    },
  ])("refuses %j on a preview, where it would silently do nothing", async (extra) => {
    const dispatch = vi.spyOn(cli, "runCommand");
    const s = await session(await project());
    try {
      const response = await s.client.callTool({
        name: "design_release_copy",
        arguments: {
          ...copyBase,
          ...extra,
        },
      });
      expect(response.isError).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });
});

describe("design_release_copy_recover", () => {
  it("is not advertised, and not callable, without the write opt-in", async () => {
    const dispatch = vi.spyOn(cli, "runCommand");
    const s = await session(await project(), {
      allowWrites: false,
    });
    try {
      expect(
        (await s.client.listTools()).tools.some(
          (tool) => tool.name === "design_release_copy_recover",
        ),
      ).toBe(false);
      const response = await s.client.callTool({
        name: "design_release_copy_recover",
        arguments: {
          action: "diagnose",
          debugPort: 9222,
        },
      });
      expect(response.isError).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  it("declares what it is: a write that is neither destructive nor idempotent, one required field", async () => {
    const s = await session(await project());
    try {
      const tool = (await s.client.listTools()).tools.find(
        (entry) => entry.name === "design_release_copy_recover",
      )!;
      expect(tool.inputSchema.required).toEqual([
        "action",
      ]);
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual([
        "action",
        "debugPort",
        "destinationInspected",
        "reason",
        "runId",
      ]);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
      expect(tool.description).toContain("never pastes");
    } finally {
      await s.close();
    }
  });

  it("maps diagnose and abandon to exactly the CLI's flags", async () => {
    const dispatch = vi
      .spyOn(cli, "runCommand")
      .mockResolvedValue(await collectCommand("design-release", async () => 0));
    const s = await session(await project());
    try {
      await s.client.callTool({
        name: "design_release_copy_recover",
        arguments: {
          action: "diagnose",
          debugPort: 9222,
        },
      });
      expect(dispatch.mock.calls.at(-1)![0]).toEqual([
        "design-release",
        "copy",
        "--diagnose",
        "--debug-port",
        "9222",
      ]);
      await s.client.callTool({
        name: "design_release_copy_recover",
        arguments: {
          action: "abandon",
          runId: "25178312-ec4c-4569-8271-608bf0c45d16",
          reason: "stopped by the deadline before the paste",
        },
      });
      expect(dispatch.mock.calls.at(-1)![0]).toEqual([
        "design-release",
        "copy",
        "--abandon",
        "25178312-ec4c-4569-8271-608bf0c45d16",
        "--reason",
        "stopped by the deadline before the paste",
      ]);
      await s.client.callTool({
        name: "design_release_copy_recover",
        arguments: {
          action: "abandon",
          runId: "run-1",
          reason: "inspected the destination page",
          destinationInspected: true,
        },
      });
      expect(dispatch.mock.calls.at(-1)![0]).toEqual([
        "design-release",
        "copy",
        "--abandon",
        "run-1",
        "--reason",
        "inspected the destination page",
        "--destination-inspected",
      ]);
    } finally {
      await s.close();
    }
  });

  it("maps find-pasted to the read-only CLI flag and nothing else", async () => {
    const dispatch = vi
      .spyOn(cli, "runCommand")
      .mockResolvedValue(await collectCommand("design-release", async () => 0));
    const s = await session(await project());
    try {
      await s.client.callTool({
        name: "design_release_copy_recover",
        arguments: {
          action: "find-pasted",
          runId: "416015e8-aa14-48c6-b061-08a760cdfc36",
        },
      });
      expect(dispatch.mock.calls.at(-1)![0]).toEqual([
        "design-release",
        "copy",
        "--find-pasted",
        "416015e8-aa14-48c6-b061-08a760cdfc36",
      ]);
    } finally {
      await s.close();
    }
  });

  it.each([
    [
      "find-pasted without a run id",
      {
        action: "find-pasted",
      },
    ],
    [
      "find-pasted with a port",
      {
        action: "find-pasted",
        runId: "run-1",
        debugPort: 9222,
      },
    ],
    [
      "find-pasted with a reason",
      {
        action: "find-pasted",
        runId: "run-1",
        reason: "why",
      },
    ],
    [
      "find-pasted with destinationInspected",
      {
        action: "find-pasted",
        runId: "run-1",
        destinationInspected: true,
      },
    ],
    [
      "find-pasted with a run id that is a flag",
      {
        action: "find-pasted",
        runId: "--apply",
      },
    ],
    [
      "no action",
      {},
    ],
    [
      "an unknown action",
      {
        action: "delete",
      },
    ],
    [
      "diagnose without a port",
      {
        action: "diagnose",
      },
    ],
    [
      "diagnose with a run id",
      {
        action: "diagnose",
        debugPort: 9222,
        runId: "run-1",
      },
    ],
    [
      "diagnose with a reason",
      {
        action: "diagnose",
        debugPort: 9222,
        reason: "why",
      },
    ],
    [
      "diagnose that claims an inspected destination",
      {
        action: "diagnose",
        debugPort: 9222,
        destinationInspected: true,
      },
    ],
    [
      "diagnose with a port out of range",
      {
        action: "diagnose",
        debugPort: 70000,
      },
    ],
    [
      "abandon without a run id",
      {
        action: "abandon",
        reason: "why",
      },
    ],
    [
      "abandon without a reason",
      {
        action: "abandon",
        runId: "run-1",
      },
    ],
    [
      "abandon with a port",
      {
        action: "abandon",
        runId: "run-1",
        reason: "why",
        debugPort: 9222,
      },
    ],
    [
      "abandon with a run id that is a path",
      {
        action: "abandon",
        runId: "../runs/other",
        reason: "why",
      },
    ],
    [
      "abandon with a run id that is a flag",
      {
        action: "abandon",
        runId: "--apply",
        reason: "why",
      },
    ],
    [
      "abandon with a run id that has a space",
      {
        action: "abandon",
        runId: "run 1",
        reason: "why",
      },
    ],
    [
      "abandon with a reason that is a flag",
      {
        action: "abandon",
        runId: "run-1",
        reason: "--destination-inspected",
      },
    ],
    [
      "abandon with a reason holding a control character",
      {
        action: "abandon",
        runId: "run-1",
        reason: "why\nand more",
      },
    ],
    [
      "abandon with a destinationInspected that is not a boolean",
      {
        action: "abandon",
        runId: "run-1",
        reason: "why",
        destinationInspected: "yes",
      },
    ],
    [
      "an argument it does not have",
      {
        action: "abandon",
        runId: "run-1",
        reason: "why",
        apply: true,
      },
    ],
  ])("refuses %s before anything is dispatched", async (_label, args) => {
    const dispatch = vi.spyOn(cli, "runCommand");
    const s = await session(await project());
    try {
      const response = await s.client.callTool({
        name: "design_release_copy_recover",
        arguments: args,
      });
      expect(response.isError).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });
});

describe("how long a tool may run", () => {
  const dispatchThatTakes = (milliseconds: number) => {
    const seen: {
      aborted: boolean;
    }[] = [];
    vi.spyOn(cli, "runCommand").mockImplementation(async (_args, options) => {
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
      seen.push({
        aborted: options?.signal?.aborted === true,
      });
      return collectCommand("design-release", async () => 0);
    });
    return seen;
  };

  it("keeps the server's deadline for an ordinary tool", async () => {
    const seen = dispatchThatTakes(150);
    const s = await session(await project(), {
      timeoutMs: 40,
    });
    try {
      await s.client.callTool({
        name: "pages",
        arguments: {},
      });
      expect(seen).toEqual([
        {
          aborted: true,
        },
      ]);
    } finally {
      await s.close();
    }
  });

  it("lets a copy outlast that deadline, so a paste is never cut off by it", async () => {
    const seen = dispatchThatTakes(150);
    const s = await session(await project(), {
      timeoutMs: 40,
    });
    try {
      await s.client.callTool({
        name: "design_release_copy",
        arguments: copyBase,
      });
      expect(seen).toEqual([
        {
          aborted: false,
        },
      ]);
    } finally {
      await s.close();
    }
  });
});

describe("progress while a copy runs", () => {
  const progressing = (messages: string[]) =>
    vi.spyOn(cli, "runCommand").mockImplementation(async (_args, options) => {
      for (const message of messages) {
        options?.onProgress?.(message);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      options?.onProgress?.("after the work but before the answer");
      return collectCommand("design-release", async () => 0);
    });

  it("forwards a progress line when the client asks, at most once in a burst", async () => {
    progressing([
      "design-release copy: prepare started",
      "design-release copy: prepare waiting",
      "design-release copy: prepare completed",
    ]);
    const s = await session(await project());
    const received: string[] = [];
    try {
      await s.client.callTool(
        {
          name: "design_release_copy",
          arguments: copyBase,
        },
        undefined,
        {
          onprogress: (progress) => received.push(String(progress.message)),
        },
      );
      expect(received).toEqual([
        "design-release copy: prepare started",
      ]);
    } finally {
      await s.close();
    }
  });

  it("sends nothing unless the client asked, and nothing for a tool that does not report", async () => {
    progressing([
      "line",
    ]);
    const s = await session(await project());
    const received: string[] = [];
    try {
      await s.client.callTool({
        name: "design_release_copy",
        arguments: copyBase,
      });
      await s.client.callTool(
        {
          name: "pages",
          arguments: {},
        },
        undefined,
        {
          onprogress: (progress) => received.push(String(progress.message)),
        },
      );
      expect(received).toEqual([]);
    } finally {
      await s.close();
    }
  });
});
