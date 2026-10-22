import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { waitForStableLayout } from "../src/layout.js";
import { guardFile } from "../src/file-guard.js";
import { collectCommand, CommandInterruptedError } from "../src/command-result.js";
import { connect, executeCode, type PenpotToolClient } from "../src/client.js";

const noReply = Symbol("no-reply");
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) {
    await close();
  }
});

async function server(
  call: (request: IncomingMessage, response: ServerResponse) => unknown,
  authenticate = true,
) {
  let calls = 0;
  const http = createServer(async (request, response) => {
    if (!authenticate) {
      response.writeHead(401);
      response.end("Unauthorized");
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405);
      response.end();
      return;
    }
    let text = "";
    for await (const chunk of request) {
      text += chunk;
    }
    const body = JSON.parse(text);
    if (body.method.startsWith("notifications/")) {
      response.writeHead(202);
      response.end();
      return;
    }
    const reply = (result: unknown) => {
      response.writeHead(200, {
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result,
        }),
      );
    };
    if (body.method === "initialize") {
      reply({
        protocolVersion: body.params.protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "fake-penpot",
          version: "test",
        },
      });
    } else if (body.method === "tools/list") {
      reply({
        tools: [
          {
            name: "execute_code",
            inputSchema: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                },
              },
            },
          },
        ],
      });
    } else {
      calls++;
      const result = call(request, response);
      if (result !== noReply && !response.destroyed && !response.writableEnded) {
        reply(result);
      }
    }
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") {
    throw new Error("No test listener");
  }
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    endpoint: {
      url: `${origin}/mcp?userToken=PRIVATE-FIXTURE`,
      description: {
        source: "env" as const,
        origin,
        pathname: "/mcp",
      },
    },
    calls: () => calls,
  };
}
async function connected(endpoint: Parameters<typeof connect>[0]): Promise<PenpotToolClient> {
  const client = await connect(endpoint);
  cleanups.unshift(() => client.close());
  return client;
}
const success = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        result: {
          ok: true,
          observed: 1,
        },
        log: "",
      }),
    },
  ],
};

describe("real HTTP MCP connection path", () => {
  it("negotiates, lists tools and executes through the installed MCP client", async () => {
    const fake = await server(() => success);
    const client = await connected(fake.endpoint);
    expect(await client.listTools!()).toEqual([
      "execute_code",
    ]);
    expect(
      (
        await executeCode(client, "return {}", {
          effect: "read",
        })
      ).result,
    ).toEqual({
      ok: true,
      observed: 1,
    });
    expect(fake.calls()).toBe(1);
  });

  it.each([
    "read",
    "write",
  ] as const)("cancels a stalled HTTP %s without replaying it", async (effect) => {
    const fake = await server(() => noReply);
    const client = await connected(fake.endpoint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new CommandInterruptedError("deadline")), 30);
    try {
      const result = await collectCommand(
        "request",
        async () => {
          await executeCode(client, "execute()", {
            effect,
          });
          return 0;
        },
        {
          signal: controller.signal,
        },
      );
      expect(result).toMatchObject({
        outcome: effect === "write" ? "uncertain" : "deadline",
        exitCode: effect === "write" ? 4 : 124,
      });
      expect(fake.calls()).toBe(1);
    } finally {
      clearTimeout(timer);
    }
  });

  it("propagates a layout request budget through the file guard into the SDK", async () => {
    const fake = await server(() => noReply);
    const client = guardFile(await connected(fake.endpoint), {
      id: "file",
    });
    expect(
      await waitForStableLayout(client, {
        timeoutMs: 100,
      }),
    ).toMatchObject({
      stable: false,
      method: "unavailable",
      samples: 0,
    });
    expect(fake.calls()).toBe(1);
  });

  it("accepts structured executor envelopes through the SDK", async () => {
    const fake = await server(() => ({
      content: [],
      structuredContent: {
        result: {
          ok: true,
          measured: 2,
        },
        log: "structured",
      },
    }));
    const client = await connected(fake.endpoint);
    expect(
      await executeCode(client, "return {}", {
        effect: "read",
      }),
    ).toMatchObject({
      result: {
        measured: 2,
      },
      log: "structured",
    });
  });

  it("rejects malformed structured data even when legacy text looks successful", async () => {
    const fake = await server(() => ({
      ...success,
      structuredContent: {
        log: "missing result",
      },
    }));
    const client = await connected(fake.endpoint);
    await expect(
      executeCode(client, "write()", {
        effect: "write",
      }),
    ).rejects.toMatchObject({
      code: "write-uncertain",
    });
    expect(fake.calls()).toBe(1);
  });

  it("classifies rejected credentials without revealing the endpoint key", async () => {
    const fake = await server(() => success, false);
    try {
      await connected(fake.endpoint);
      throw new Error("Unexpected connection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "auth-rejected",
      });
      expect(String(error)).not.toContain("PRIVATE-FIXTURE");
    }
  });

  it("retries read-only suspended tool results over HTTP", async () => {
    let requests = 0;
    const fake = await server(() =>
      ++requests === 1
        ? {
            isError: true,
            content: [
              {
                type: "text",
                text: "suspended after no heartbeat",
              },
            ],
          }
        : success,
    );
    const client = await connected(fake.endpoint);
    expect(
      (
        await executeCode(client, "return {}", {
          effect: "read",
          sleep: async () => undefined,
        })
      ).outcome,
    ).toBe("ran");
    expect(fake.calls()).toBe(2);
  });

  it("does not replay a delivered write after the HTTP socket is lost", async () => {
    const fake = await server((request) => {
      request.socket.destroy();
    });
    const client = await connected(fake.endpoint);
    await expect(
      executeCode(client, "mutate()", {
        effect: "write",
      }),
    ).rejects.toMatchObject({
      code: "write-uncertain",
    });
    expect(fake.calls()).toBe(1);
  });

  it("returns an uncertain write outcome for malformed tool envelopes", async () => {
    const fake = await server(() => ({
      content: [
        {
          type: "text",
          text: "incomplete JSON",
        },
      ],
    }));
    const client = await connected(fake.endpoint);
    await expect(
      executeCode(client, "mutate()", {
        effect: "write",
      }),
    ).rejects.toMatchObject({
      code: "write-uncertain",
    });
    expect(fake.calls()).toBe(1);
  });
});
