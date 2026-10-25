import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../src/mcp-server.js";
import { resolveEndpoint } from "../src/endpoint.js";
import { runCommand } from "../src/cli-main.js";
import * as cli from "../src/cli-main.js";
import { collectCommand } from "../src/command-result.js";
async function project(instance: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-server-"));
  const config = {
    instance,
    profile: {
      type: "external",
      origin: "https://design.penpot.app",
    },
    file: {
      id: instance,
    },
  };
  await writeFile(path.join(root, "penpair.config.json"), JSON.stringify(config));
  return {
    root,
    config,
  };
}
async function session(root: string, allowWrites = false) {
  const server = await createMcpServer({
    root,
    allowWrites,
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
describe("project-pinned typed MCP server", () => {
  it("disables global endpoint fallback explicitly", async () => {
    const { root } = await project("isolated");
    await expect(
      resolveEndpoint({
        environment: {},
        envFiles: [],
        home: root,
        globalConfig: false,
      }),
    ).rejects.toThrow(/fallback is disabled/);
  });
  it("requires a pin and absolute root, exposes bounded typed reads, and omits registered writes by default", async () => {
    await expect(
      createMcpServer({
        root: ".",
      }),
    ).rejects.toThrow(/absolute/);
    const { root } = await project("one");
    const s = await session(root);
    try {
      const tools = (await s.client.listTools()).tools;
      expect(tools.some((t) => t.name === "run_registered")).toBe(false);
      expect(tools.find((t) => t.name === "inspect")!.annotations?.readOnlyHint).toBe(true);
      expect(tools.find((t) => t.name === "export")!.annotations?.readOnlyHint).toBe(false);
      const invalid = await s.client.callTool({
        name: "tree",
        arguments: {
          page: "A",
          rawCode: "evil",
        },
      });
      expect(invalid.isError).toBe(true);
      const disabled = await s.client.callTool({
        name: "run_registered",
        arguments: {
          name: "evil",
        },
      });
      expect(disabled.isError).toBe(true);
      const escape = await s.client.callTool({
        name: "export",
        arguments: {
          page: "A",
          id: "x",
          out: "../outside.png",
        },
      });
      expect(escape.isError).toBe(true);
    } finally {
      await s.close();
    }
  });
  it.each([
    false,
    true,
  ])(
    "declares all four behavior hints on every advertised tool (writes=%s)",
    async (allowWrites) => {
      const { root } = await project("annotations");
      const connection = await session(root, allowWrites);
      try {
        const tools = (await connection.client.listTools()).tools;
        expect(tools.map((tool) => tool.name).sort()).toEqual(
          [
            "pages",
            "tree",
            "audit",
            "inspect",
            "tokens_dump",
            "run_status",
            "baselines_status",
            "project_status",
            "doctor",
            "design_spec",
            "export",
            ...(allowWrites
              ? [
                  "run_registered",
                  "design_release_copy",
                ]
              : []),
          ].sort(),
        );
        for (const tool of tools) {
          const destructive = tool.name === "export" || tool.name === "run_registered";
          const changesEnvironment = destructive || tool.name === "design_release_copy";
          const offline = tool.name === "run_status" || tool.name === "baselines_status";
          expect(tool.annotations, tool.name).toEqual({
            readOnlyHint: !changesEnvironment,
            destructiveHint: destructive,
            idempotentHint: !changesEnvironment,
            openWorldHint: !offline,
          });
          for (const hint of [
            "readOnlyHint",
            "destructiveHint",
            "idempotentHint",
            "openWorldHint",
          ] as const) {
            expect(typeof tool.annotations?.[hint], `${tool.name}.${hint}`).toBe("boolean");
          }
        }
      } finally {
        await connection.close();
      }
    },
  );

  it("advertises native copy only with write opt-in and validates its bounded typed inputs before dispatch", async () => {
    const { root } = await project("copy-inputs");
    const canonicalRoot = await realpath(root);
    const readOnly = await session(root);
    const enabled = await session(root, true);
    const result = await collectCommand("design-release", async () => 0);
    const dispatch = vi.spyOn(cli, "runCommand").mockResolvedValue(result);
    try {
      expect(
        (await readOnly.client.listTools()).tools.some(
          (tool) => tool.name === "design_release_copy",
        ),
      ).toBe(false);
      const definition = (await enabled.client.listTools()).tools.find(
        (tool) => tool.name === "design_release_copy",
      )!;
      expect(definition.inputSchema.required).toEqual([
        "sourcePage",
        "frameIds",
        "releaseVersion",
      ]);
      const base = {
        sourcePage: "Candidate",
        frameIds: [
          "frame-a",
        ],
        releaseVersion: "1.2.0",
      };
      const invalid = [
        {
          ...base,
          frameIds: [],
        },
        {
          ...base,
          frameIds: [
            "frame-a",
            "frame-a",
          ],
        },
        {
          ...base,
          frameIds: [
            1,
          ],
        },
        {
          ...base,
          frameIds: [
            "--apply",
          ],
        },
        {
          ...base,
          frameIds: Array.from(
            {
              length: 101,
            },
            (_, index) => `frame-${index}`,
          ),
        },
        {
          ...base,
          debugPort: 0,
        },
        {
          ...base,
          debugPort: -1,
        },
        {
          ...base,
          debugPort: 1.5,
        },
        {
          ...base,
          debugPort: 65536,
        },
        {
          ...base,
          apply: true,
        },
        {
          ...base,
          releaseVersion: "../unrelated-page",
        },
        {
          ...base,
          resume: "run-id",
        },
        {
          ...base,
          endpoint: "http://remote.test",
        },
        {
          ...base,
          rawCode: "arbitrary code",
        },
      ];
      for (const arguments_ of invalid) {
        expect(
          (
            await enabled.client.callTool({
              name: "design_release_copy",
              arguments: arguments_,
            })
          ).isError,
        ).toBe(true);
      }
      expect(dispatch).not.toHaveBeenCalled();
      expect(
        (
          await readOnly.client.callTool({
            name: "design_release_copy",
            arguments: base,
          })
        ).isError,
      ).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();

      await enabled.client.callTool({
        name: "design_release_copy",
        arguments: base,
      });
      expect(dispatch).toHaveBeenLastCalledWith(
        [
          "design-release",
          "copy",
          "--source-page",
          "Candidate",
          "--frame",
          "frame-a",
          "--release",
          "1.2.0",
        ],
        expect.objectContaining({
          root: canonicalRoot,
          projectEndpointOnly: true,
          strictFileGuard: true,
        }),
      );
      await enabled.client.callTool({
        name: "design_release_copy",
        arguments: {
          ...base,
          frameIds: [
            "frame-a",
            "frame-b",
          ],
          apply: true,
          debugPort: 9222,
          resume: "original-run",
        },
      });
      expect(dispatch).toHaveBeenLastCalledWith(
        [
          "design-release",
          "copy",
          "--source-page",
          "Candidate",
          "--frame",
          "frame-a",
          "--frame",
          "frame-b",
          "--release",
          "1.2.0",
          "--debug-port",
          "9222",
          "--apply",
          "--resume",
          "original-run",
        ],
        expect.objectContaining({
          root: canonicalRoot,
          projectEndpointOnly: true,
          strictFileGuard: true,
        }),
      );
    } finally {
      dispatch.mockRestore();
      await enabled.close();
      await readOnly.close();
    }
  });

  it("keeps concurrent roots separate without changing cwd and refuses target changes after startup", async () => {
    const a = await project("alpha");
    const b = await project("beta");
    const cwd = process.cwd();
    const results = await Promise.all(
      [
        a,
        b,
      ].map((p) =>
        runCommand(
          [
            "onboard",
          ],
          {
            root: p.root,
          },
        ),
      ),
    );
    expect(JSON.stringify(results[0])).toContain("alpha");
    expect(JSON.stringify(results[0])).not.toContain("beta");
    expect(JSON.stringify(results[1])).toContain("beta");
    expect(process.cwd()).toBe(cwd);
    const s = await session(a.root, true);
    try {
      expect(
        (await s.client.listTools()).tools.find((t) => t.name === "run_registered")!.annotations
          ?.destructiveHint,
      ).toBe(true);
      await writeFile(
        path.join(a.root, "penpair.config.json"),
        JSON.stringify({
          ...a.config,
          file: {
            id: "other",
          },
        }),
      );
      const changed = await s.client.callTool({
        name: "baselines_status",
        arguments: {},
      });
      expect(changed.isError).toBe(true);
      expect(JSON.stringify(changed)).toMatch(/target changed/);
    } finally {
      await s.close();
    }
  });
  it("returns the CLI envelope for offline tools and keeps unconfigured baselines incomplete/failed", async () => {
    const { root } = await project("one");
    const s = await session(root);
    try {
      const response = await s.client.callTool({
        name: "baselines_status",
        arguments: {},
      });
      expect(response.structuredContent).toMatchObject({
        schemaVersion: 1,
        outcome: "failed",
        completeness: {
          complete: false,
        },
      });
    } finally {
      await s.close();
    }
  });
});
