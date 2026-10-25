import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as browser from "../src/browser-wake.js";
import * as client from "../src/client.js";
import * as endpoint from "../src/endpoint.js";
import * as adapters from "../src/adapters.js";
import { runCommand, runCli } from "../src/cli-main.js";

const config = {
  instance: "fixture",
  profile: {
    type: "external",
    origin: "https://example.test",
  },
  file: {
    id: "expected-file",
  },
  adapters: [
    "./must-not-import.mjs",
  ],
};
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "penpair-wake-command-"));
  await writeFile(path.join(root, "penpair.config.json"), JSON.stringify(config));
  await writeFile(path.join(root, "must-not-import.mjs"), 'throw new Error("unexpected import");');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, {
    recursive: true,
    force: true,
  });
});

function connection(fileId = "expected-file", failure?: string) {
  const resolve = vi.spyOn(endpoint, "resolveEndpoint").mockResolvedValue({
    url: "https://example.test/mcp?userToken=PRIVATE",
    description: {
      source: "env",
      origin: "https://example.test",
      pathname: "/mcp",
    },
  });
  const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    if (failure) {
      return {
        isError: true,
        text: failure,
      };
    }
    const challenge = /challenge: ("[^"\n]+")/.exec(String(args.code))?.[1];
    return {
      isError: false,
      text: JSON.stringify({
        result: {
          file: "Fixture",
          fileId,
          pageId: "page",
          challenge: challenge ? JSON.parse(challenge) : undefined,
        },
      }),
    };
  });
  const close = vi.fn(async () => undefined);
  vi.spyOn(client, "connect").mockResolvedValue({
    callTool,
    close,
  });
  const wake = vi.spyOn(browser, "wakeBrowserTarget").mockResolvedValue({
    activated: true,
    targetId: "target",
    keepAlive: "none",
  });
  const imports = vi.spyOn(adapters, "loadAdapters");
  return {
    resolve,
    callTool,
    close,
    wake,
    imports,
  };
}

it("activates only the pinned target then proves readiness with one read, without importing adapters", async () => {
  const spies = connection();
  const result = await runCommand(
    [
      "wake",
      "--debug-port",
      "9222",
    ],
    {
      root,
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.data).toMatchObject({
    activated: true,
    ready: true,
    keepAlive: "none",
  });
  expect(spies.wake).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: config.profile.origin,
      fileId: config.file.id,
      port: 9222,
    }),
  );
  expect(spies.callTool).toHaveBeenCalledOnce();
  expect(spies.callTool.mock.calls[0]?.[1].code).toContain("return { challenge:");
  expect(spies.close).toHaveBeenCalledOnce();
  expect(spies.imports).not.toHaveBeenCalled();
  expect(spies.wake.mock.invocationCallOrder[0]).toBeLessThan(
    spies.callTool.mock.invocationCallOrder[0]!,
  );
});

it.each([
  "wrong-file",
  "expected-file",
])("does not equate activation with readiness for %s", async (fileId) => {
  const spies = connection(
    fileId,
    fileId === "expected-file" ? "no heartbeat for 898s; suspended" : undefined,
  );
  const result = await runCommand(
    [
      "wake",
      "--debug-port",
      "9222",
    ],
    {
      root,
    },
  );
  expect(result.exitCode).toBe(1);
  expect(result.data).toMatchObject({
    activated: true,
    ready: false,
  });
  expect(spies.callTool).toHaveBeenCalledOnce();
  expect(spies.close).toHaveBeenCalledOnce();
});

it("does not execute a plugin call when activation fails", async () => {
  const spies = connection();
  spies.wake.mockRejectedValue(new Error("No matching target"));
  const result = await runCommand(
    [
      "wake",
      "--debug-port",
      "9222",
    ],
    {
      root,
    },
  );
  expect(result.exitCode).toBe(1);
  expect(spies.callTool).not.toHaveBeenCalled();
});

it("enables only the configured local frontend's loopback alias without requiring a Docker profile", async () => {
  const spies = connection();
  await writeFile(
    path.join(root, "penpair.config.json"),
    JSON.stringify({
      instance: "fixture",
      file: config.file,
      penpotVersion: "2.18.3",
      directory: ".penpot",
      ports: {
        frontend: 9001,
        mail: 9002,
      },
    }),
  );
  spies.resolve.mockResolvedValue({
    url: "http://localhost:9001/mcp?userToken=PRIVATE",
    description: {
      source: "env",
      origin: "http://localhost:9001",
      pathname: "/mcp",
    },
  });
  const result = await runCommand(
    [
      "wake",
      "--debug-port",
      "9222",
    ],
    {
      root,
    },
  );
  expect(result.exitCode).toBe(0);
  expect(spies.wake).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: "http://127.0.0.1:9001",
      allowLoopbackAlias: true,
    }),
  );
});

it("reports suspension through doctor without activating a browser or retrying the read", async () => {
  const spies = connection("expected-file", "no heartbeat for 762s; plugin suspended");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ready"));
  const result = await runCommand(
    [
      "doctor",
    ],
    {
      root,
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.stringify(result.data)).toContain('"heartbeatAgeMs":762000');
  expect(spies.wake).not.toHaveBeenCalled();
  expect(spies.callTool).toHaveBeenCalledOnce();
});

it("refuses a foreign MCP connection before touching the browser", async () => {
  const spies = connection();
  spies.resolve.mockResolvedValue({
    url: "https://foreign.test/mcp",
    description: {
      source: "env",
      origin: "https://foreign.test",
      pathname: "/mcp",
    },
  });
  const result = await runCommand(
    [
      "wake",
      "--debug-port",
      "9222",
    ],
    {
      root,
    },
  );
  expect(result.exitCode).toBe(1);
  expect(spies.wake).not.toHaveBeenCalled();
});

it("requires a pinned file before resolving credentials or touching the browser", async () => {
  const spies = connection();
  await writeFile(
    path.join(root, "penpair.config.json"),
    JSON.stringify({
      ...config,
      file: undefined,
    }),
  );
  const result = await runCommand(
    [
      "wake",
      "--debug-port",
      "9222",
    ],
    {
      root,
    },
  );
  expect(result.exitCode).toBe(1);
  expect(spies.resolve).not.toHaveBeenCalled();
  expect(spies.wake).not.toHaveBeenCalled();
});

it.each([
  [],
  [
    "--debug-port",
    "0",
  ],
  [
    "--debug-port",
    "65536",
  ],
  [
    "--debug-port",
    "1.2",
  ],
  [
    "--debug-port",
    "9222",
    "--any-file",
  ],
  [
    "--debug-port",
    "9222",
    "--standalone",
  ],
  [
    "--debug-port",
    "9222",
    "--timeout-ms",
    "999",
  ],
  [
    "--debug-port",
    "9222",
    "extra",
  ],
])("rejects unsupported wake arguments %j before browser access", async (...args) => {
  const spies = connection();
  const result = await runCommand(
    [
      "wake",
      ...args,
    ],
    {
      root,
    },
  );
  expect(result.exitCode).toBe(1);
  expect(spies.wake).not.toHaveBeenCalled();
  expect(spies.resolve).not.toHaveBeenCalled();
});

it("preserves the wake verification budget in the executable entrypoint", async () => {
  const spies = connection();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  expect(
    await runCli(
      [
        "wake",
        "--debug-port",
        "9222",
        "--timeout-ms",
        "1234",
        "--json",
      ],
      {
        root,
      },
    ),
  ).toBe(0);
  expect(spies.wake).toHaveBeenCalledWith(
    expect.objectContaining({
      timeoutMs: 1234,
    }),
  );
});
