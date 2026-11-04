import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorExternal } from "../src/instance/connection.js";
import { runCommand } from "../src/cli-main.js";
import * as connectionModule from "../src/instance/connection.js";
import * as endpointModule from "../src/endpoint.js";
const config = {
  instance: "fixture",
  profile: {
    type: "external" as const,
    origin: "https://example.test",
  },
  file: {
    id: "expected",
  },
};
const answering = vi.fn(async () => ({
  status: 200,
})) as unknown as typeof fetch;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("separates transport, fresh challenge, page identity and file pin observations", async () => {
  const challenges: string[] = [];
  for (let i = 0; i < 2; i++) {
    const result = await doctorExternal(config, {
      accessToken: null,
      fetch: answering,
      mcp: {
        origin: config.profile.origin,
        connect: async (request) => {
          challenges.push(request!.challenge);
          request!.onTransport();
          return {
            file: "Fixture",
            fileId: "wrong",
            pageId: "page",
            challenge: request!.challenge,
          };
        },
      },
    });
    expect(
      result
        .filter((row) => row.layer)
        .map((row) => [
          row.layer,
          row.ok,
        ]),
    ).toEqual([
      [
        "origin",
        true,
      ],
      [
        "transport",
        true,
      ],
      [
        "execution",
        true,
      ],
      [
        "file-pin",
        false,
      ],
    ]);
    expect(result[2]).toMatchObject({
      durationMs: expect.any(Number),
      observedAt: expect.any(String),
      evidence: {
        heartbeat: "unknown",
        pluginHealth: {
          state: "responsive",
          heartbeatAgeMs: null,
          heartbeatSource: "unavailable",
          keepAlive: {
            method: "unknown",
            verified: false,
          },
        },
      },
    });
  }
  expect(challenges[0]).not.toBe(challenges[1]);
});
it.each([
  "stale",
  "missing-page",
  "old-probe",
])("refuses %s execution evidence", async (mode) => {
  const result = await doctorExternal(config, {
    fetch: answering,
    mcp: {
      origin: config.profile.origin,
      connect: async (request) => {
        if (mode !== "old-probe") {
          request!.onTransport();
        }
        return {
          file: "Fixture",
          fileId: "expected",
          pageId: mode === "missing-page" ? undefined : "page",
          challenge: "stale",
        };
      },
    },
  });
  expect(result.find((row) => row.layer === "execution")?.ok).toBe(false);
});
it("bounds a sleeping origin and a sleeping editor within one deadline", async () => {
  vi.useFakeTimers();
  for (const sleepOrigin of [
    true,
    false,
  ]) {
    const pending = doctorExternal(config, {
      timeoutMs: 1000,
      fetch: sleepOrigin ? ((async () => new Promise(() => undefined)) as typeof fetch) : answering,
      mcp: {
        origin: config.profile.origin,
        connect: async (request) => {
          request!.onTransport();
          return new Promise(() => undefined);
        },
      },
    });
    await vi.runAllTimersAsync();
    expect((await pending).some((row) => !row.ok && /deadline/i.test(row.detail))).toBe(true);
  }
});
it("redacts secret-bearing probe errors", async () => {
  const result = await doctorExternal(config, {
    fetch: answering,
    mcp: {
      origin: config.profile.origin,
      connect: async () => {
        throw new Error("https://example.test/mcp?userToken=PRIVATE");
      },
    },
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

it("reports upstream suspension and heartbeat age without writing or treating wake as recovery", async () => {
  const connect = vi.fn(async () => {
    throw new Error(
      "Plugin tab suspended (no heartbeat for 898s) https://example.test/mcp?userToken=PRIVATE",
    );
  });
  const result = await doctorExternal(config, {
    fetch: answering,
    mcp: {
      origin: config.profile.origin,
      connect,
    },
  });
  const execution = result.find((row) => row.layer === "execution");
  expect(execution).toMatchObject({
    ok: false,
    evidence: {
      heartbeat: "unknown",
      pluginHealth: {
        state: "suspended",
        heartbeatAgeMs: 898000,
        heartbeatSource: "upstream-error",
        keepAlive: {
          method: "unknown",
          verified: false,
        },
      },
    },
    detail: expect.stringContaining("last heartbeat 898s ago"),
    remedy: expect.stringContaining("Reconcile any uncertain run"),
  });
  expect(connect).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

it("keeps suspension unknown when a generic deadline does not establish its cause", async () => {
  const result = await doctorExternal(config, {
    fetch: answering,
    mcp: {
      origin: config.profile.origin,
      connect: async () => {
        throw new Error("MCP request timeout");
      },
    },
  });
  expect(result.find((row) => row.layer === "execution")).toMatchObject({
    ok: false,
    evidence: {
      pluginHealth: {
        state: "unknown",
        heartbeatAgeMs: null,
      },
    },
  });
});
it.each([
  "999",
  "30001",
  "NaN",
  "1000.5",
])("rejects invalid doctor timeout %s without connecting", async (timeout) => {
  expect(
    (
      await runCommand([
        "doctor",
        "--timeout-ms",
        timeout,
      ])
    ).exitCode,
  ).toBe(1);
});

it("malformed file/page observations cannot establish fresh execution readiness", async () => {
  const result = await doctorExternal(config, {
    fetch: answering,
    mcp: {
      origin: config.profile.origin,
      connect: async (request) => {
        request!.onTransport();
        return {
          file: "Fixture",
          fileId: 123 as unknown as string,
          pageId: "page",
          challenge: request!.challenge,
        };
      },
    },
  });
  expect(result.find((row) => row.layer === "execution")?.ok).toBe(false);
});

it("qualifies a connected transport row when the editor verdict fails", async () => {
  const result = await doctorExternal(config, {
    fetch: answering,
    mcp: {
      origin: config.profile.origin,
      connect: async (request) => {
        request!.onTransport();
        return {
          file: "Fixture",
          fileId: "expected",
          pageId: "page",
          challenge: "stale",
        };
      },
    },
  });
  const transport = result.find((row) => row.layer === "transport");
  expect(transport).toMatchObject({
    ok: true,
    warning: true,
  });
  expect(transport?.detail).toMatch(/did not answer/);
  expect(result.find((row) => row.layer === "execution")?.ok).toBe(false);
});

it.each([
  true,
  false,
])(
  "reports the skipped tab census without changing the editor verdict (%s)",
  async (editorReady) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-doctor-census-"));
    await writeFile(path.join(root, "penpair.config.json"), JSON.stringify(config));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(endpointModule, "resolveEndpoint").mockResolvedValue({
      url: "https://example.test/mcp",
      description: {
        source: "env",
        origin: config.profile.origin,
        pathname: "/mcp",
      },
    });
    vi.spyOn(connectionModule, "doctorExternal").mockResolvedValue([
      {
        check: "editor and plugin",
        ok: editorReady,
        detail: "Fixture editor verdict",
      },
    ]);

    const result = await runCommand([
      "--json",
      "doctor",
    ]);

    expect(result.exitCode).toBe(editorReady ? 0 : 1);
    expect(result.data).toMatchObject({
      ok: editorReady,
      checks: expect.arrayContaining([
        {
          check: "browser tabs",
          ok: true,
          warning: true,
          detail: expect.stringContaining("--debug-port"),
          remedy: expect.stringContaining("--debug-port"),
        },
      ]),
    });
  },
);

describe("the optional access token row", () => {
  const askedFor = (status: number) => {
    const urls: string[] = [];
    const fetchImplementation = (async (url: URL | string) => {
      urls.push(String(url));
      return {
        status: String(url).includes("get-teams") ? status : 200,
        ok: String(url).includes("get-teams") ? status < 400 : true,
        text: async () => "unauthorized",
      };
    }) as unknown as typeof fetch;
    return {
      urls,
      fetchImplementation,
    };
  };
  const tokenRow = async (accessToken: string | null, status = 200) => {
    const { urls, fetchImplementation } = askedFor(status);
    const result = await doctorExternal(config, {
      accessToken,
      fetch: fetchImplementation,
    });
    return {
      row: result.find((entry) => entry.check === "access token (optional)")!,
      urls,
      result,
    };
  };

  it("is fine without a token, and says what a token would give", async () => {
    const { row, urls } = await tokenRow(null);
    expect(row.ok).toBe(true);
    expect(row.detail).toContain("plugin");
    expect(urls.some((url) => url.includes("get-teams"))).toBe(false);
  });

  it("is fine when the origin accepts the token, and never shows it", async () => {
    const { row } = await tokenRow("secret-token-value");
    expect(row.ok).toBe(true);
    expect(JSON.stringify(row)).not.toContain("secret-token-value");
  });

  it("fails with what to do when the token is refused", async () => {
    const { row } = await tokenRow("secret-token-value", 401);
    expect(row.ok).toBe(false);
    expect(row.remedy).toContain("Access tokens");
  });

  it("does not call a challenge page a refused token", async () => {
    const result = await doctorExternal(config, {
      accessToken: "secret-token-value",
      fetch: (async (url: URL | string) =>
        String(url).includes("get-teams")
          ? new Response("<!DOCTYPE html><title>Just a moment...</title>", {
              status: 403,
            })
          : new Response("ok", {
              status: 200,
            })) as unknown as typeof fetch,
    });
    const row = result.find((entry) => entry.check === "access token (optional)")!;
    expect(row.ok).toBe(false);
    expect(row.detail).toContain("challenge");
  });

  it("is not asked for when the origin does not answer", async () => {
    const result = await doctorExternal(config, {
      accessToken: "secret-token-value",
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(result.map((row) => row.check)).toEqual([
      "penpot",
    ]);
  });
});
