import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp-server.js";
import { resolveEndpoint } from "../src/endpoint.js";
import { runCommand } from "../src/cli-main.js";
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
                ]
              : []),
          ].sort(),
        );
        for (const tool of tools) {
          const changesEnvironment = tool.name === "export" || tool.name === "run_registered";
          const offline = tool.name === "run_status" || tool.name === "baselines_status";
          expect(tool.annotations, tool.name).toEqual({
            readOnlyHint: !changesEnvironment,
            destructiveHint: changesEnvironment,
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
