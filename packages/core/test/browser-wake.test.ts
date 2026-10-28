import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectBrowserPages,
  inspectBrowserTarget,
  reloadBrowserTarget,
  wakeBrowserTarget,
  type BrowserTargetOptions,
} from "../src/browser-wake.js";

const pinnedFile = {
  origin: "https://design.example.test",
  fileId: "file-123",
  port: 9222,
};

const selectedTab = {
  id: "ABCD-1234",
  type: "page",
  url: `${pinnedFile.origin}/#/workspace?team-id=team-1&file-id=${pinnedFile.fileId}&page-id=page-1`,
};

const cleanup: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const close of cleanup.splice(0)) {
    await close();
  }
});

function fakeBrowser(
  targets: unknown = [
    selectedTab,
  ],
): {
  fetch: typeof fetch;
  requests: string[];
} {
  const requests: string[] = [];
  const browserFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return url.endsWith("/json/list") ? Response.json(targets) : new Response("Target activated");
  };
  return {
    fetch: browserFetch,
    requests,
  };
}

describe("browser target activation", () => {
  it("activates only the existing pinned file, without navigation, reload or execution", async () => {
    const browser = fakeBrowser([
      {
        ...selectedTab,
        id: "wrong-origin",
        url: "https://other.test/#/workspace?file-id=file-123",
      },
      {
        ...selectedTab,
        id: "wrong-file",
        url: `${pinnedFile.origin}/#/workspace?file-id=other`,
      },
      {
        ...selectedTab,
        id: "worker",
        type: "service_worker",
      },
      selectedTab,
    ]);

    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browser.fetch,
      }),
    ).resolves.toEqual({
      activated: true,
      targetId: selectedTab.id,
      keepAlive: "none",
    });
    expect(browser.requests).toEqual([
      "http://127.0.0.1:9222/json/list",
      "http://127.0.0.1:9222/json/activate/ABCD-1234",
    ]);
  });

  it("inspects without activating and does not infer keep-alive from tab presence", async () => {
    const browser = fakeBrowser();
    await expect(
      inspectBrowserTarget({
        ...pinnedFile,
        fetch: browser.fetch,
      }),
    ).resolves.toEqual({
      targetId: selectedTab.id,
      keepAlive: "unknown",
    });
    expect(browser.requests).toEqual([
      "http://127.0.0.1:9222/json/list",
    ]);
  });

  it("recognizes direct workspace URLs as well as hash routing", async () => {
    const browser = fakeBrowser([
      {
        ...selectedTab,
        url: `${pinnedFile.origin}/workspace?file-id=${pinnedFile.fileId}`,
      },
    ]);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browser.fetch,
      }),
    ).resolves.toHaveProperty("activated", true);
  });

  it.each([
    `${pinnedFile.origin}/#/view?file-id=file-123`,
    `${pinnedFile.origin}/#/workspace?file-id=file-123&file-id=other`,
    `${pinnedFile.origin}.attacker.test/#/workspace?file-id=file-123`,
    `https://person:secret@design.example.test/#/workspace?file-id=file-123`,
    "not a URL",
  ])("refuses an unqualified target URL %#", async (url) => {
    const browser = fakeBrowser([
      {
        ...selectedTab,
        url,
      },
    ]);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browser.fetch,
      }),
    ).rejects.toThrow("No browser page matches");
    expect(browser.requests).toHaveLength(1);
  });

  it("refuses duplicate matching tabs rather than guessing by title or order", async () => {
    const browser = fakeBrowser([
      selectedTab,
      {
        ...selectedTab,
        id: "duplicate",
      },
    ]);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browser.fetch,
      }),
    ).rejects.toThrow("Multiple browser pages");
    expect(browser.requests).toHaveLength(1);
  });

  it.each([
    "../close/other",
    "tab?token=PRIVATE",
    "",
    "x".repeat(257),
  ])("refuses unsafe target IDs %#", async (id) => {
    const browser = fakeBrowser([
      {
        ...selectedTab,
        id,
      },
    ]);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browser.fetch,
      }),
    ).rejects.toThrow("Invalid browser debugging target ID");
    expect(browser.requests).toHaveLength(1);
  });

  it.each([
    {},
    [
      null,
    ],
    [
      {
        ...selectedTab,
        url: 123,
      },
    ],
    Array(1001).fill(selectedTab),
  ])("rejects malformed or excessive target lists %#", async (targets) => {
    const browser = fakeBrowser(targets);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browser.fetch,
      }),
    ).rejects.toThrow("Invalid browser debugging target list");
    expect(browser.requests).toHaveLength(1);
  });

  it("does not expose browser payloads or transport errors", async () => {
    for (const browserFetch of [
      async () => new Response("PRIVATE invalid JSON"),
      async () => {
        throw new Error("https://private.test/mcp?userToken=PRIVATE");
      },
    ]) {
      const error = await wakeBrowserTarget({
        ...pinnedFile,
        fetch: browserFetch,
      }).catch((failure: unknown) => failure);
      expect(String(error)).not.toContain("PRIVATE");
    }
  });

  it("refuses redirects and HTTP failures without activation", async () => {
    for (const status of [
      302,
      401,
      500,
    ]) {
      const browserFetch = vi.fn(
        async () =>
          new Response("PRIVATE", {
            status,
            headers: {
              location: "http://private.test",
            },
          }),
      );
      await expect(
        wakeBrowserTarget({
          ...pinnedFile,
          fetch: browserFetch,
        }),
      ).rejects.toThrow("refused the request");
      expect(browserFetch).toHaveBeenCalledTimes(1);
    }
  });

  it("does not report activation when the browser refuses it", async () => {
    const browserFetch = vi.fn(async (input: Parameters<typeof fetch>[0]) =>
      String(input).endsWith("/json/list")
        ? Response.json([
            selectedTab,
          ])
        : new Response("PRIVATE", {
            status: 500,
          }),
    );
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browserFetch,
      }),
    ).rejects.toThrow("refused the request");
  });
});

describe("local browser origin aliases", () => {
  it("keeps localhost and 127.0.0.1 distinct by default", async () => {
    const browser = fakeBrowser([
      {
        ...selectedTab,
        url: "http://localhost:9001/#/workspace?file-id=file-123",
      },
    ]);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        origin: "http://127.0.0.1:9001",
        fetch: browser.fetch,
      }),
    ).rejects.toThrow("No browser page matches");
    expect(browser.requests).toHaveLength(1);
  });

  it.each([
    [
      "http://127.0.0.1:9001",
      "http://localhost:9001",
    ],
    [
      "http://localhost:9001",
      "http://127.0.0.1:9001",
    ],
    [
      "http://localhost",
      "http://127.0.0.1:80",
    ],
  ])("accepts explicit local aliases for %s", async (origin, targetOrigin) => {
    const browser = fakeBrowser([
      {
        ...selectedTab,
        url: `${targetOrigin}/#/workspace?file-id=file-123`,
      },
    ]);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        origin,
        allowLoopbackAlias: true,
        fetch: browser.fetch,
      }),
    ).resolves.toHaveProperty("activated", true);
  });

  it("still refuses duplicate tabs across equivalent local origins", async () => {
    const browser = fakeBrowser([
      {
        ...selectedTab,
        url: "http://localhost:9001/#/workspace?file-id=file-123",
      },
      {
        ...selectedTab,
        id: "duplicate",
        url: "http://127.0.0.1:9001/#/workspace?file-id=file-123",
      },
    ]);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        origin: "http://127.0.0.1:9001",
        allowLoopbackAlias: true,
        fetch: browser.fetch,
      }),
    ).rejects.toThrow("Multiple browser pages");
    expect(browser.requests).toHaveLength(1);
  });

  it.each([
    "http://localhost:9002",
    "http://127.0.0.1:9002",
    "http://127.0.0.2:9001",
    "http://localhost.attacker.test:9001",
    "http://other.test:9001",
    "http://[::1]:9001",
    "https://localhost:9001",
    "https://127.0.0.1:9001",
  ])("does not expand alias matching to %s", async (targetOrigin) => {
    const browser = fakeBrowser([
      {
        ...selectedTab,
        url: `${targetOrigin}/#/workspace?file-id=file-123`,
      },
    ]);
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        origin: "http://127.0.0.1:9001",
        allowLoopbackAlias: true,
        fetch: browser.fetch,
      }),
    ).rejects.toThrow("No browser page matches");
    expect(browser.requests).toHaveLength(1);
  });

  it.each([
    "https://localhost:9001",
    "http://other.test:9001",
    pinnedFile.origin,
  ])("rejects alias mode for a nonlocal HTTP origin %s before IO", async (origin) => {
    const browserFetch = vi.fn();
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        origin,
        allowLoopbackAlias: true,
        fetch: browserFetch,
      }),
    ).rejects.toThrow("Browser loopback aliases require an HTTP localhost or 127.0.0.1 origin");
    expect(browserFetch).not.toHaveBeenCalled();
  });
});

describe("bounded debugging access", () => {
  it.each([
    {
      port: 0,
    },
    {
      port: 65536,
    },
    {
      port: 9222.5,
    },
    {
      timeoutMs: 999,
    },
    {
      timeoutMs: 30001,
    },
    {
      fileId: "",
    },
    {
      fileId: "file\n123",
    },
    {
      origin: "https://person:PRIVATE@design.example.test",
    },
    {
      origin: "https://design.example.test/path",
    },
    {
      origin: "https://design.example.test?userToken=PRIVATE",
    },
    {
      origin: "file:///private",
    },
  ])("validates input before contacting the debugging port %#", async (invalid) => {
    const browserFetch = vi.fn();
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        ...invalid,
        fetch: browserFetch,
      }),
    ).rejects.toThrow();
    expect(browserFetch).not.toHaveBeenCalled();
  });

  it("honors cancellation before contacting the browser", async () => {
    const browserFetch = vi.fn();
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browserFetch,
        signal: AbortSignal.abort("PRIVATE"),
      }),
    ).rejects.toThrow("Browser debugging cancelled");
    expect(browserFetch).not.toHaveBeenCalled();
  });

  it("bounds a nonresponsive endpoint independently of fetch's abort behavior", async () => {
    vi.useFakeTimers();
    const browserFetch = vi.fn(async () => new Promise<Response>(() => undefined));
    const pending = wakeBrowserTarget({
      ...pinnedFile,
      timeoutMs: 1000,
      fetch: browserFetch,
    });
    const assertion = expect(pending).rejects.toThrow("deadline exceeded");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(browserFetch).toHaveBeenCalledTimes(1);
  });

  it("shares the deadline across discovery and activation", async () => {
    vi.useFakeTimers();
    const browserFetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return String(input).endsWith("/json/list")
        ? Response.json([
            selectedTab,
          ])
        : new Response("Target activated");
    });
    const pending = wakeBrowserTarget({
      ...pinnedFile,
      timeoutMs: 1000,
      fetch: browserFetch,
    });
    const assertion = expect(pending).rejects.toThrow("deadline exceeded");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(browserFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
  });

  it("does not dispatch activation after cancelled discovery finishes late", async () => {
    const controller = new AbortController();
    let finishDiscovery: (response: Response) => void = () => undefined;
    const browserFetch = vi.fn(
      async () => new Promise<Response>((resolve) => (finishDiscovery = resolve)),
    );
    const pending = wakeBrowserTarget({
      ...pinnedFile,
      fetch: browserFetch,
      signal: controller.signal,
    });
    const assertion = expect(pending).rejects.toThrow("cancelled");
    controller.abort("PRIVATE");
    await assertion;
    finishDiscovery(
      Response.json([
        selectedTab,
      ]),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(browserFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    true,
    false,
  ])("bounds target payload bytes, declared length=%s", async (declared) => {
    const browserFetch = vi.fn(
      async () =>
        new Response("x".repeat(1024 * 1024 + 1), {
          headers: declared
            ? {
                "content-length": String(1024 * 1024 + 1),
              }
            : {},
        }),
    );
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: browserFetch,
      }),
    ).rejects.toThrow("exceeds the size limit");
    expect(browserFetch).toHaveBeenCalledTimes(1);
  });
});

async function localBrowser(
  respond: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<BrowserTargetOptions> {
  const server = createServer(respond);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No local browser fixture listener");
  }
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    ...pinnedFile,
    port: address.port,
  };
}

it("discovers and activates through a real loopback HTTP connection", async () => {
  const requests: string[] = [];
  const options = await localBrowser((request, response) => {
    requests.push(request.url ?? "");
    response.setHeader("content-type", "application/json");
    response.end(
      request.url === "/json/list"
        ? JSON.stringify([
            selectedTab,
          ])
        : "Target activated",
    );
  });
  await expect(wakeBrowserTarget(options)).resolves.toHaveProperty("activated", true);
  expect(requests).toEqual([
    "/json/list",
    "/json/activate/ABCD-1234",
  ]);
});

it("never follows a real HTTP redirect to another service", async () => {
  let redirectedRequests = 0;
  const destination = await localBrowser((_request, response) => {
    redirectedRequests++;
    response.end(
      JSON.stringify([
        selectedTab,
      ]),
    );
  });
  const options = await localBrowser((_request, response) => {
    response.writeHead(302, {
      location: `http://127.0.0.1:${destination.port}/json/list`,
    });
    response.end();
  });
  await expect(wakeBrowserTarget(options)).rejects.toThrow("Cannot reach the local browser");
  expect(redirectedRequests).toBe(0);
});

describe("browser tab diagnostics", () => {
  const integrations = {
    id: "settings",
    type: "page",
    url: `${pinnedFile.origin}/#/settings/integrations?token=SECRET`,
  };
  it("says which tab is the pinned workspace and keeps query strings out of the answer", async () => {
    const browser = fakeBrowser([
      selectedTab,
      integrations,
      {
        id: "elsewhere",
        type: "page",
        url: "https://other.test/#/x?token=SECRET",
      },
    ]);
    const found = await inspectBrowserPages({
      ...pinnedFile,
      fetch: browser.fetch,
    });
    expect(found.matching).toBe(1);
    expect(found.pages.map((page) => page.state)).toEqual([
      "pinned-file-workspace",
      "not-a-workspace",
      "other-origin",
    ]);
    expect(found.summary).toContain("/settings/integrations");
    expect(found.summary).toContain("not a workspace");
    expect(JSON.stringify(found)).not.toContain("SECRET");
    expect(browser.requests.every((url) => url.endsWith("/json/list"))).toBe(true);
  });
  it("lists the tabs it saw when the pinned workspace is missing or open twice", async () => {
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: fakeBrowser([
          integrations,
        ]).fetch,
      }),
    ).rejects.toThrow(
      /No browser page matches.*Tabs seen: 1\. .*\/settings\/integrations \(not a workspace/,
    );
    await expect(
      wakeBrowserTarget({
        ...pinnedFile,
        fetch: fakeBrowser([
          selectedTab,
          {
            ...selectedTab,
            id: "second",
          },
        ]).fetch,
      }),
    ).rejects.toThrow(/Multiple browser pages.*Tabs seen: 1\..*; 2\./);
  });
});

describe("browser reload", () => {
  const socketUrl = `ws://127.0.0.1:${pinnedFile.port}/devtools/page/${selectedTab.id}`;
  function fakeSocket(reply: object | "close") {
    const sent: string[] = [];
    class Fake {
      listeners: Record<string, ((event: { data?: string }) => void)[]> = {};
      constructor(public url: string) {
        queueMicrotask(() => this.emit("open", {}));
      }
      addEventListener(type: string, listener: (event: { data?: string }) => void) {
        (this.listeners[type] ??= []).push(listener);
      }
      emit(
        type: string,
        event: {
          data?: string;
        },
      ) {
        for (const listener of this.listeners[type] ?? []) {
          listener(event);
        }
      }
      send(message: string) {
        sent.push(message);
        queueMicrotask(() =>
          reply === "close"
            ? this.emit("close", {})
            : this.emit("message", {
                data: JSON.stringify(reply),
              }),
        );
      }
      close() {}
    }
    return {
      Socket: Fake as unknown as typeof WebSocket,
      sent,
    };
  }
  const withSocket = (url: string | undefined) =>
    fakeBrowser([
      {
        ...selectedTab,
        ...(url
          ? {
              webSocketDebuggerUrl: url,
            }
          : {}),
      },
    ]).fetch;

  it("reloads only the one pinned tab, asking for nothing but Page.reload", async () => {
    const { Socket, sent } = fakeSocket({
      id: 1,
      result: {},
    });
    expect(
      await reloadBrowserTarget({
        ...pinnedFile,
        fetch: withSocket(socketUrl),
        webSocket: Socket,
      }),
    ).toEqual({
      reloaded: true,
      targetId: selectedTab.id,
    });
    expect(sent.map((message) => JSON.parse(message).method)).toEqual([
      "Page.reload",
    ]);
  });
  it("refuses a socket that is not this loopback browser's page, and reports a refusal or a closed socket", async () => {
    const { Socket } = fakeSocket({
      id: 1,
      result: {},
    });
    for (const url of [
      "ws://evil.test:9222/devtools/page/ABCD-1234",
      "ws://127.0.0.1:1234/devtools/page/ABCD-1234",
      "ws://127.0.0.1:9222/devtools/browser/ABCD-1234",
    ]) {
      await expect(
        reloadBrowserTarget({
          ...pinnedFile,
          fetch: withSocket(url),
          webSocket: Socket,
        }),
      ).rejects.toThrow(/Refusing a debugging socket/);
    }
    await expect(
      reloadBrowserTarget({
        ...pinnedFile,
        fetch: withSocket(undefined),
        webSocket: Socket,
      }),
    ).rejects.toThrow(/did not offer a debugging socket/);
    await expect(
      reloadBrowserTarget({
        ...pinnedFile,
        fetch: withSocket(socketUrl),
        webSocket: fakeSocket({
          id: 1,
          error: {
            message: "nope",
          },
        }).Socket,
      }),
    ).rejects.toThrow(/refused the reload: nope/);
    await expect(
      reloadBrowserTarget({
        ...pinnedFile,
        fetch: withSocket(socketUrl),
        webSocket: fakeSocket("close").Socket,
      }),
    ).rejects.toThrow(/closed the debugging socket/);
  });
});
